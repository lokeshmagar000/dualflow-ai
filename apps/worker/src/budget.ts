/**
 * Money safety: before any paid AI step, check the kill switch and the daily budget.
 * Every paid call also writes a CostEvent row, so spend is always known.
 */
import { UnrecoverableError } from "bullmq";
import { prisma } from "@dualflow/db";
import type { CostLine } from "@dualflow/ai";

export async function assertBudget(workspaceId: string) {
  const budgets = await prisma.budget.findMany({ where: { workspaceId } });
  if (budgets.some((b) => b.paused)) {
    // UnrecoverableError = "do not retry", because retrying would not help.
    throw new UnrecoverableError("Automation is paused (kill switch is on).");
  }
  const daily = budgets.find((b) => b.period === "DAILY");
  if (daily) {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const spent = await prisma.costEvent.aggregate({
      _sum: { usd: true },
      where: { workspaceId, createdAt: { gte: startOfDay } },
    });
    if ((spent._sum.usd ?? 0) >= daily.capUsd) {
      throw new UnrecoverableError(`Daily budget of $${daily.capUsd} reached.`);
    }
  }
}

export async function recordCosts(workspaceId: string, storyId: string, lines: CostLine[]) {
  if (lines.length === 0) return;
  await prisma.costEvent.createMany({
    data: lines.map((l) => ({ workspaceId, storyId, ...l })),
  });
}
