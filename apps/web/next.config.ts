import { join } from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@language-arcade/shared"],
  outputFileTracingRoot: join(process.cwd(), "../..")
};

export default nextConfig;
