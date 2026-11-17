/** Creates a starter workspace and two example channels (one per language). Run: pnpm db:seed */
import { prisma } from "./index";

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: "default" },
    update: {},
    create: { slug: "default", name: "DualFlow" },
  });

  await prisma.budget.upsert({
    where: { workspaceId_period: { workspaceId: workspace.id, period: "DAILY" } },
    update: {},
    create: { workspaceId: workspace.id, period: "DAILY", capUsd: 5 },
  });

  const topic = await prisma.topic.create({
    data: {
      workspaceId: workspace.id,
      title: "Why Nepal's tea is becoming famous worldwide",
      source: "MANUAL",
    },
  });
  console.log("Seeded workspace", workspace.slug, "and topic", topic.title);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
