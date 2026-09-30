import { defineConfig } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 240000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://localhost:3001",
    channel: "msedge",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --import tsx scripts/migrate.ts && node --import tsx scripts/seed-work-e2e.ts && npx next dev --webpack --hostname ::1 --port 3001",
    // Probe the app's IPv6 listener, not another app on 127.0.0.1:3001.
    url: "http://[::1]:3001/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      CLUB_E2E: "1",
      // Never reuse real data or credentials from the development environment.
      DATABASE_URL: "",
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
      BETTER_AUTH_URL: "http://localhost:3001",
      PGLITE_DIR: `.data/e2e-playwright-${randomUUID()}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  },
  reporter: "list",
});
