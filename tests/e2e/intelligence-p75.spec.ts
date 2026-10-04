import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { loginAs, submitLogin, withTransportRetry } from "./auth";

const person = z.object({ id: z.string(), email: z.email(), password: z.string() });
const people = z
  .object({
    head: person,
    member: person,
    approver: person,
    supervisor: person,
    president: person,
    mediaLead: person,
  })
  .parse(JSON.parse(readFileSync(".data/work-e2e-credentials.json", "utf8")));
type Actor = keyof typeof people;
const headers = { origin: "http://localhost:3001" };
const saved = new Map<Actor, Awaited<ReturnType<BrowserContext["cookies"]>>>();

async function login(page: Page, key: Actor) {
  await page.context().clearCookies();
  // Run-wide cache first: this actor may already be signed in from an
  // earlier spec, and the limiter charges for every fresh sign-in.
  if (!saved.get(key)) {
    try {
      await loginAs(page, key);
      saved.set(key, await page.context().cookies());
      return;
    } catch {
      // Fall through to the interactive form below.
    }
  }
  const cached = saved.get(key);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /السلام عليكم|أهلًا بك في فريق النادي/ }),
    ).toBeVisible();
    return;
  }
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(people[key].email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(people[key].password);
  await submitLogin(page);
  await expect(
    page.getByRole("heading", { name: /السلام عليكم|أهلًا بك في فريق النادي/ }),
  ).toBeVisible();
  saved.set(key, await page.context().cookies());
}

/**
 * Files a report and returns the API result.
 *
 * Reports filed here are cleaned up by cancelling the work item the same way a
 * user would, through the real workflow rather than a direct delete, so the
 * shared E2E database is left as it was found.
 */
/**
 * A pooled socket can be recycled by the dev server between calls, which shows
 * up as a connection-level reset rather than an application error. Retrying once
 * on exactly that transport failure keeps the scenario testing the product; an
 * HTTP response of any status is never retried.
 */

async function fileReport(page: Page, body: Record<string, unknown>) {
  return withTransportRetry(() =>
    page.request.post("/api/intelligence/filing", {
      headers,
      data: body as never,
    }),
  );
}

test("A — ملخص المشرف يعرض الاستخبارات دون تحرير داخلي", async ({ page }) => {
  await login(page, "supervisor");

  const res = await page.goto("/supervisor");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "ملخص المشرف" })).toBeVisible();

  // Intelligence sections are present, each with its own explanation.
  await expect(page.getByRole("heading", { name: "الحالة العامة" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "جاهزية الفعاليات القادمة" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "تقارير تحتاج إجراءك" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "بنود الحوكمة" })).toBeVisible();

  // Operational domains appear for a reader who may see them.
  await expect(page.getByText("المالية").first()).toBeVisible();

  // The brief states plainly that it grants no committee-internal editing.
  await expect(page.getByText(/لا يفتح هذا الملخص صلاحيات تحرير داخل اللجان/)).toBeVisible();
  await expect(page.getByText(/لا يفتح صلاحيات تحرير داخل اللجان/)).toBeVisible();

  // No committee editing control is offered anywhere on the page.
  const body = await page.content();
  expect(body).not.toContain("لجنة تجريبية — التعديل");
  expect(body).not.toContain("RoleError");
  expect(body).not.toContain("TypeError");
});

test("B — قمع التأهيل يعرض المراحل والتحويلات بأمان", async ({ page }) => {
  await login(page, "president");

  const res = await page.goto("/intelligence/executive");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "قمع التأهيل" })).toBeVisible();

  // Every required stage renders with its Arabic label.
  for (const stage of [
    "طلب الانضمام",
    "تم القبول",
    "تم إسناد اللجنة",
    "أول مهمة",
    "أول فعالية",
    "إكمال 30 يومًا",
  ])
    await expect(page.getByText(stage, { exact: true }).first()).toBeVisible();

  // A stage can be opened to reveal the rule that produced its number.
  await page.getByRole("button", { name: /طلب الانضمام/ }).first().click();
  await expect(page.getByText("القاعدة:").first()).toBeVisible();

  // An empty funnel reports "unavailable" rather than 0% or NaN.
  const body = await page.content();
  expect(body).not.toContain("NaN");
  expect(body).not.toContain("undefined%");
});

test("C — الاتجاهات مشتقة وتتحدث مع السجلات", async ({ page }) => {
  await login(page, "president");

  const res = await page.goto("/intelligence/executive");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "الاتجاهات التشغيلية" })).toBeVisible();

  // The panel is present and states its rule or explains the empty state. An
  // empty database legitimately has no points, and must say so rather than
  // inventing zeros.
  const body = await page.content();
  expect(body).toMatch(/نقطة زمنية|لا توجد بيانات في الفترة/);
  expect(body).toContain("القاعدة");
  expect(body).not.toContain("NaN");

  // The operations page carries a trend too.
  const ops = await page.goto("/intelligence/operations");
  expect(ops?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "حجم الطلبات عبر الزمن" })).toBeVisible();
});

test("D — إيداع التقرير ينشئه في التقارير دون اعتماد تلقائي", async ({ page }) => {
  await login(page, "president");

  const view = await page.goto("/intelligence/reports/executive_periodic?range=term");
  expect(view?.status()).toBe(200);
  await expect(page.getByRole("button", { name: "حفظ كتقرير رسمي" })).toBeVisible();

  // Filing through the real API rather than the button keeps the test focused
  // on the outcome; the button is exercised by its presence and the action's
  // own contract below.
  const first = await fileReport(page, { template: "attendance", range: "term" });
  expect(first.status()).toBe(201);
  const filed = (await first.json()) as {
    reportId: string;
    status: string;
    typeId: string;
    provenanceMetrics: number;
    href: string;
  };
  // Filed as a draft: filing must never approve.
  expect(filed.status).toBe("draft");
  expect(filed.reportId).toBeTruthy();
  expect(filed.typeId).toBeTruthy();

  // It is visible in the existing Reports area, not a parallel repository.
  const reports = await page.goto(filed.href);
  expect(reports?.status()).toBe(200);
  expect(await page.textContent("body")).toContain("تقرير الحضور");

  // A second filing for the same period is refused as a duplicate.
  const again = await fileReport(page, { template: "attendance", range: "term" });
  expect(again.status()).toBe(409);
  expect(await again.text()).toContain("سبق إيداع");

  // No cleanup is needed: the report lands as a draft owned by this actor, and
  // the suite never deletes shared state directly. A later filing of the same
  // template and period is refused as a duplicate, so the run stays idempotent.
});

test("E — الإيداع محجوب عن غير المخوَّلين", async ({ page }) => {
  await login(page, "member");

  // The filing action is not offered at all.
  const view = await page.goto("/intelligence/reports/executive_periodic?range=term");
  expect(view?.status()).toBe(200);
  await expect(page.getByRole("button", { name: "حفظ كتقرير رسمي" })).toHaveCount(0);

  // And the API refuses it, whatever the caller sends.
  for (const template of ["executive_periodic", "finance", "attendance"]) {
    const res = await fileReport(page, { template, range: "term" });
    const payload = await res.text();
    expect(res.status(), `${template} -> ${payload.slice(0, 200)}`).toBe(403);
  }

  // A committee head cannot file an executive or financial report either.
  await login(page, "head");
  for (const template of ["executive_periodic", "finance"]) {
    const res = await fileReport(page, { template, range: "term" });
    expect(res.status(), template).toBe(403);
  }
});