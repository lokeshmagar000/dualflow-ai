import { prisma } from "@dualflow/db";

/** Phase 0 has one workspace. Later this comes from the logged-in user. */
export async function getDefaultWorkspace() {
  return prisma.workspace.upsert({
    where: { slug: "default" },
    update: {},
    create: { slug: "default", name: "DualFlow" },
  });
}
