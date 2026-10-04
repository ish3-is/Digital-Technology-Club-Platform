import { defineConfig } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

// One isolated PGlite directory per run, shared by every evaluation of this
// config file. Playwright loads the config more than once (the web server
// process among them), so the name is written once and then reused: generating
// a fresh UUID per evaluation would leave the teardown holding a directory that
// was never actually used.
const PREFIX = "e2e-playwright-";
const HANDOFF = ".data/.e2e-current-dir";
// PGLITE_DIR is handed to the seed script as a .data path, so the resolved value
// keeps that prefix; the handoff file stores the bare directory name, which is
// what the teardown validates against before deleting anything.
const stored = existsSync(HANDOFF) ? readFileSync(HANDOFF, "utf8").trim() : "";
const reusable =
  stored !== "" && stored === basename(stored) && stored.startsWith(PREFIX);
const e2eDataName = reusable ? stored : `${PREFIX}${randomUUID()}`;
if (!reusable) writeFileSync(HANDOFF, e2eDataName, "utf8");

export default defineConfig({
  testDir: "tests/e2e",
  globalTeardown: "./scripts/e2e-teardown.ts",
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
    // The dev server compiles every route on first request under load; the
    // production-shaped runs in this repo need more than the default budget.
    timeout: 300000,
    env: {
      CLUB_E2E: "1",
      // Never reuse real data or credentials from the development environment.
      DATABASE_URL: "",
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
      BETTER_AUTH_URL: "http://localhost:3001",
      PGLITE_DIR: `.data/${e2eDataName}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  },
  reporter: "list",
});
