import type { NextConfig } from "next";

const config: NextConfig = {
  // Our shared package is TypeScript source, so Next.js must compile it.
  transpilePackages: ["@dualflow/shared"],
};

export default config;
