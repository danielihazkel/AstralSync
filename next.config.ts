import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@astralsync/astro-core", "@astralsync/numero-core"],
};

export default nextConfig;
