import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@astralsync/astro-core", "@astralsync/numero-core"],
  // geo-tz reads its timezone boundary data from node_modules at runtime and
  // must not be bundled.
  serverExternalPackages: ["geo-tz", "@prisma/client"],
};

export default nextConfig;
