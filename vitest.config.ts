import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: rootDir },
      {
        find: "server-only",
        replacement: resolve(rootDir, "tests/mocks/server-only.ts"),
      },
    ],
  },
  test: {
    environment: "node",
  },
});
