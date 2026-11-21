import { prisma } from "@dualflow/db";

type Workspace = Awaited<ReturnType<typeof prisma.workspace.upsert>>;

/**
 * Remembered after the first time, so later requests skip one database trip.
 * (Before, every page asked the database for the workspace again.)
 */
let cached: Promise<Workspace> | null = null;

/** Phase 0 has one workspace. Later this comes from the logged-in user. */
export function getDefaultWorkspace(): Promise<Workspace> {
  cached ??= prisma.workspace
    .upsert({
      where: { slug: "default" },
      update: {},
      create: { slug: "default", name: "DualFlow" },
    })
    .catch((err) => {
      cached = null; // try again next time (for example the database was waking up)
      throw err;
    });
  return cached;
}
