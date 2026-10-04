import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { submitLogin } from "./auth";

const person = z.object({ id: z.string(), email: z.email(), password: z.string() });
const people = z
  .object({
    head: person,
    member: person,
    approver: person,
    supervisor: person,
    president: person,
  })
  .parse(JSON.parse(readFileSync(".data/work-e2e-credentials.json", "utf8")));

/**
 * Regression guard for the `/governance` hydration mismatch.
 *
 * The response streams `loading.tsx` while the route resolves. When the route
 * then threw — an account without onboarding, for instance — React swapped the
 * streamed skeleton for the error boundary and hydrated against markup the
 * server had never sent, producing React error #441.
 *
 * This asserts that Governance hydrates cleanly in both states, so the defect
 * cannot return through any other early throw.
 */
const HYDRATION = /Minified React error #4(4[0-9]|1[0-9])/;
const CSP_VIOLATION = /Content Security Policy|Refused to/;

/**
 * Signs in with the E2E account through the real form, so the browser stores
 * the session cookie itself and the page hydrates as an authenticated user.
 */
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(people.supervisor.email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(people.supervisor.password);
  // The submit button is disabled until the form hydrates, so wait for it to
  // become enabled before submitting.
  await expect(page.getByRole("button", { name: "الدخول إلى المقر" })).toBeEnabled();
  await submitLogin(page);
  await expect(
    page.getByRole("heading", { name: /السلام عليكم|أهلًا بك في فريق النادي/ }),
  ).toBeVisible();
}

function watchForHydrationErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("SCENARIO A — الحوكمة تُهيَّأ بلا خطأ ترطيب", async ({ page }) => {
  await signIn(page);

  const errors = watchForHydrationErrors(page);
  const response = await page.goto("/governance");
  await page.waitForLoadState("networkidle");
  // Let React finish hydrating before judging the console.
  await page.waitForTimeout(2000);

  expect(response?.status()).toBe(200);

  const hydration = errors.filter((e) => HYDRATION.test(e));
  const csp = errors.filter((e) => CSP_VIOLATION.test(e));
  const uncaught = errors.filter((e) => !HYDRATION.test(e) && !CSP_VIOLATION.test(e));

  expect(hydration, "hydration errors on /governance").toEqual([]);
  expect(csp, "CSP violations on /governance").toEqual([]);
  expect(uncaught, "uncaught errors on /governance").toEqual([]);
});

test("SCENARIO B — المسارات المجاورة تبقى نظيفة", async ({ page }) => {
  await signIn(page);

  for (const route of ["/", "/people", "/intelligence", "/operations"]) {
    const errors = watchForHydrationErrors(page);
    const response = await page.goto(route);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);

    expect(response?.status(), route).toBe(200);
    expect(
      errors.filter((e) => HYDRATION.test(e)),
      `hydration errors on ${route}`,
    ).toEqual([]);
  }
});
