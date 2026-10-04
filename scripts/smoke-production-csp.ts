import { chromium, type ConsoleMessage } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Production CSP smoke check.
 *
 * Loads a running production server in a real browser and fails if the content
 * security policy blocks anything the application legitimately needs. A
 * restrictive policy is only useful if the app still works under it.
 */
const base = process.env.SMOKE_BASE ?? "http://localhost:3099";
const email = process.env.SMOKE_EMAIL!;
const password = process.env.SMOKE_PASSWORD!;

// Use whichever Chromium build this machine already has, so the check does not
// depend on downloading a browser at run time.
const browser = await chromium.launch(
  process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : {},
);
const context = await browser.newContext({ baseURL: base });
const page = await context.newPage();

const violations: string[] = [];
const pageErrors: string[] = [];
page.on("console", (msg: ConsoleMessage) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  // CSP denials surface as console errors; anything matching is a real block.
  if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
});
page.on("pageerror", (e) => pageErrors.push(e.message));

async function signIn() {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password },
    // Better Auth validates the origin against BETTER_AUTH_URL, which is the
    // public address rather than the local smoke-test address.
    headers: { origin: process.env.SMOKE_ORIGIN ?? base },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()}`);
  for (const cookie of res.headersArray()) {
    if (cookie.name.toLowerCase().includes("session"))
      await context.addCookies([
        {
          name: cookie.name,
          value: cookie.value.split(";")[0].split("=").slice(1).join("="),
          domain: new URL(base).hostname,
          path: "/",
        },
      ]);
  }
}

// Anonymous surface.
await page.goto("/login");
await page.waitForLoadState("networkidle");

// Authenticated surfaces, which render more script and style.
await signIn();
const routes = [
  "/",
  "/operations",
  "/operations/finance",
  "/people",
  "/governance",
  "/intelligence",
  "/intelligence/executive",
  "/supervisor",
  "/work",
  "/events",
];
let failed = 0;
for (const route of routes) {
  violations.length = 0;
  pageErrors.length = 0;
  const res = await page.goto(route);
  await page.waitForLoadState("networkidle").catch(() => {});
  const status = res?.status() ?? 0;
  const ok = status === 200 && violations.length === 0 && pageErrors.length === 0;
  if (!ok) {
    failed++;
    console.log(
      `FAIL ${route} (${status}) csp=${violations.length} errors=${pageErrors.length}`,
    );
    for (const v of violations.slice(0, 3)) console.log("   csp:", v.slice(0, 160));
    for (const e of pageErrors.slice(0, 3)) console.log("   err:", e.slice(0, 160));
  } else {
    console.log(`OK ${route}`);
  }
}

await browser.close();
console.log(failed ? `فشل ${failed} مسار` : "لا يخالف التطبيق سياسته في الإنتاج");
process.exit(failed ? 1 : 0);