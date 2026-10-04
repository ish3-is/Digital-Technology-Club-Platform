import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    // Set before any module loads: static imports hoist above module bodies,
    // so a test cannot assign this from inside its own file.
    env: {
      BETTER_AUTH_SECRET:
        "intelligence-test-secret-with-at-least-thirty-two-characters",
    },
  },
});
