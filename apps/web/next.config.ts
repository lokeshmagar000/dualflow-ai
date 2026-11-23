import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Our packages are TypeScript source, so Next.js must compile them.
  // The API ones are only used when the API runs inside this process (Vercel, see lib/inside-api.ts).
  transpilePackages: [
    "@dualflow/shared",
    "@dualflow/publish",
    "@dualflow/api",
    "@dualflow/ai",
    "@dualflow/db",
    "@dualflow/queue",
    "@dualflow/storage",
    "@dualflow/voice",
  ],
  // The repo is one "monorepo": tell Next.js where its top folder is, so the files the
  // server needs (also the Prisma database engine) are copied when it is put online.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  outputFileTracingIncludes: {
    "/**": ["../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**"],
  },
};

export default config;
