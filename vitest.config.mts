import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: [
      "packages/**/test/**/*.test.ts",
      "lib/**/*.test.ts",
      "components/**/*.test.ts",
    ],
  },
});
