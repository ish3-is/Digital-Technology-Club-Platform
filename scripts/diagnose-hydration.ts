import { chromium, type ConsoleMessage } from "@playwright/test";

/**
 * Captures React's full hydration diagnostic for a route.
 *
 * A production build only prints "Minified React error #441". Run against a
 * development build, React reports which element differed and what each side
 * rendered, which is what identifies the root cause.
 *
 * Sign-in runs through the real form so the browser stores the session cookie
 * itself; replaying a raw set-cookie header loses its signature.
 */
const base = process.env.SMOKE_BASE ?? "http://localhost:3099";
const route = process.argv[2] ?? "/governance";

const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM! });
const context = await browser.newContext({ baseURL: base });
const page = await context.newPage();

if (process.env.SMOKE_EMAIL) {
  // Sign in through the API inside the browser context, which stores the
  // session cookie the same way a form submission would. The login form's
  // submit button stays disabled outside a hydrated client, so driving the
  // form from a standalone script is not reliable here.
  const response = await context.request.post("/api/auth/sign-in/email", {
    data: { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD },
    // Better Auth validates the origin against BETTER_AUTH_URL, which is the
    // public address rather than the local smoke-test address.
    headers: { origin: process.env.SMOKE_ORIGIN ?? base },
  });
  if (!response.ok()) console.log(`warning: sign-in returned ${response.status()}`);
  const cookies = await context.cookies();
  if (!cookies.some((c) => c.name.includes("session")))
    console.log("warning: no session cookie after sign-in");
}

const messages: string[] = [];
page.on("console", (m: ConsoleMessage) => {
  const text = m.text();
  if (m.type() === "error" || m.type() === "warning") messages.push(text);
});
page.on("pageerror", (e) => messages.push("pageerror: " + e.message));

await page.goto(route, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const hydration = messages.filter((m) => /hydrat|didn't match|server rendered|Minified React/i.test(m));
console.log(hydration.length ? `=== ${route}: ${hydration.length} hydration message(s) ===` : `=== ${route}: clean ===`);
for (const m of hydration) console.log(m.slice(0, 3000) + "\n");

const other = messages.filter((m) => !/hydrat|didn't match|server rendered|Minified React/i.test(m));
if (other.length) console.log(`--- other console messages (${other.length}) ---\n` + other.slice(0, 3).join("\n").slice(0, 800));

await browser.close();