import type { FastifyInstance } from "fastify";
import { prisma } from "@dualflow/db";
import { getDefaultWorkspace } from "../workspace";

export async function costRoutes(app: FastifyInstance) {
  // Spend today and this month, compared with the budgets.
  app.get("/costs/summary", async () => {
    const ws = await getDefaultWorkspace();
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [today, month, budgets] = await Promise.all([
      prisma.costEvent.aggregate({ _sum: { usd: true }, where: { workspaceId: ws.id, createdAt: { gte: startOfDay } } }),
      prisma.costEvent.aggregate({ _sum: { usd: true }, where: { workspaceId: ws.id, createdAt: { gte: startOfMonth } } }),
      prisma.budget.findMany({ where: { workspaceId: ws.id } }),
    ]);

    return {
      todayUsd: today._sum.usd ?? 0,
      monthUsd: month._sum.usd ?? 0,
      budgets,
      paused: budgets.some((b) => b.paused),
    };
  });

  // The kill switch: pause or resume all automation.
  app.post<{ Body: { paused: boolean } }>("/automation/pause", async (req) => {
    const ws = await getDefaultWorkspace();
    const paused = Boolean(req.body?.paused);
    await prisma.budget.updateMany({ where: { workspaceId: ws.id }, data: { paused } });
    await prisma.auditLog.create({
      data: { workspaceId: ws.id, actor: "owner", action: paused ? "automation.paused" : "automation.resumed" },
    });
    return { paused };
  });
}
