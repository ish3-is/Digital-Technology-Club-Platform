import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { loginAs, submitLogin, withTransportRetry } from "./auth";

/**
 * Intelligence surfaces: executive metrics with provenance, event readiness,
 * committee scoping, reporting and export, plus role visibility.
 */

const person = z.object({
  id: z.string(),
  email: z.email(),
  password: z.string(),
});
const people = z
  .object({
    member: person,
    approver: person,
    supervisor: person,
    president: person,
    financeLead: person,
    mediaLead: person,
    head: person,
  })
  .parse(JSON.parse(readFileSync(".data/work-e2e-credentials.json", "utf8")));
type Actor = keyof typeof people;

const headers = { origin: "http://localhost:3001" };

async function login(page: Page, key: Actor) {
  // Reuse the run-wide session so the sign-in limiter is not charged once per
  // test. `loginAs` leaves the account in the same state the form would.
  try {
    await loginAs(page, key);
    return;
  } catch {
    // Fall through to the interactive form below.
  }
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(people[key].email);
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill(people[key].password);
  await submitLogin(page);
  await expect(
    page.getByRole("heading", { name: /السلام عليكم|أهلًا بك في فريق النادي/ }),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "لنبدأ رحلتك" }).isVisible())
    await page.getByRole("button", { name: "لنبدأ رحلتك" }).click();
  await expect(
    page.getByRole("heading", { name: /السلام عليكم/ }),
  ).toBeVisible();
}

/**
 * A pooled socket can be recycled by the dev server between calls, which shows
 * up as a connection-level reset rather than an application error. Retrying
 * only that transport failure keeps the scenario testing the product instead
 * of the socket; an HTTP response of any status is never retried.
 */
const opsPost = post;

async function post(page: Page, path: string, body: unknown, status = 200) {
  const res = await withTransportRetry(() =>
    page.request.post(`/api/operations${path}`, {
      headers,
      data: body as never,
    }),
  );
  // A mismatch reports the server's own message, which is far more useful than
  // a bare status code when an expectation fails.
  expect(res.status(), `POST ${path}: ${await res.text().catch(() => "")}`).toBe(status);
  return res.json();
}

test("A — لوحة الاستخبارات التنفيذية تعرض بيانات مشتقة مع إسناد لكل رقم", async ({ page }) => {
  await login(page, "president");

  // Give the dashboards real records to derive from.
  const budget = await opsPost(
    page,
    "/budgets",
    {
      title: "ميزانية استخبارات تجريبية",
      allocatedAmount: 2000,
      startsOn: new Date().toISOString(),
    },
    201,
  );
  expect(budget.id).toBeTruthy();
  const expense = await opsPost(
    page,
    "/expenses",
    {
      title: "مصروف استخبارات تجريبي",
      category: "supplies",
      amount: 250,
      budgetId: budget.id,
      submit: true,
    },
    201,
  );
  expect(expense.id).toBeTruthy();

  const res = await page.goto("/intelligence/executive");
  expect(res?.status()).toBe(200);

  // The pulse reports six named dimensions, not one opaque score.
  await expect(page.getByRole("heading", { name: "نبض النادي" })).toBeVisible();
  for (const dimension of [
    "التنفيذ",
    "الفعاليات",
    "الأشخاص",
    "الحوكمة",
    "العمليات",
    "المشاركة",
  ])
    await expect(page.getByText(dimension, { exact: true }).first()).toBeVisible();

  // No ranking language anywhere on the executive surface.
  const body = await page.content();
  for (const banned of ["أفضل لجنة", "أفضل عضو", "Top 5", "لوحة الصدارة"])
    expect(body).not.toContain(banned);

  // Every metric can explain itself.
  await page.getByRole("button", { name: "كيف حُسب؟" }).first().click();
  await expect(page.getByText("الصيغة").first()).toBeVisible();
  await expect(page.getByText("المقام").first()).toBeVisible();

  // The period filter is switchable and reflected in the URL.
  await page.getByRole("link", { name: "آخر ٧ أيام" }).click();
  await expect(page).toHaveURL(/range=7d/);

  // Spending is presented as derived, with the purchase-based wording.
  await expect(page.getByText("المنصرف فعليًا").first()).toBeVisible();

  // This suite shares one isolated database, so the records seeded above are
  // archived here to leave the later zero-data scenarios with an empty club.
  // A different actor performs the cleanup: the requester may not review or
  // archive their own request, which is exactly the separation being enforced.
  await login(page, "financeLead");
  // submitted → cancelled is a valid terminal transition, so the request
  // leaves every active list without forcing it through the purchase flow.
  await opsPost(page, `/expense/${expense.id}`, {
    action: "cancel",
    note: "إنهاء اختبار الاستخبارات",
  });
  await opsPost(page, `/budget/${budget.id}`, { status: "archived" });
});

test("B — جاهزية الفعالية تُشتق من المتطلبات المرتبطة بها", async ({ page }) => {
  await login(page, "president");

  // Create an event through the real event engine.
  // The E2E seed creates exactly one active term.
  const startAt = new Date(Date.now() + 5 * 86_400_000);
  const created = await withTransportRetry(() => page.request.post("/api/events", {
    headers,
    data: {
      title: "فعالية استخبارات تجريبية",
      termId: "test-term",
      committeeId: "test-media",
      leadId: people.member.id,
      approverId: people.approver.id,
      eventType: "ورشة عمل",
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 7_200_000).toISOString(),
      locationType: "onsite",
      targetAudience: "الأعضاء",
      reportRequired: false,
    } as never,
  }));
  expect(created.status(), "create event").toBe(201);
  const eventId = (await created.json()).id;

  // Link a media request to it, so readiness has a real requirement to count.
  const media = await opsPost(
    page,
    "/media-requests",
    {
      title: "بوستر فعالية استخبارات",
      mediaType: "poster",
      eventId,
      committeeId: "test-org",
    },
    201,
  );
  expect(media.id).toBeTruthy();

  const res = await page.goto(`/intelligence/events?event=${eventId}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByText("جاهزية: فعالية استخبارات تجريبية")).toBeVisible();

  const before = await page.content();
  // Readiness is a derived ratio with a stated basis, not a stored percentage.
  expect(before).toMatch(/اكتمل|لا توجد متطلبات/);

  // Moving the requirement through its lifecycle changes what readiness derives.
  await opsPost(page, `/media/${media.id}/assign`, {
    assigneeId: people.mediaLead.id,
    reviewerId: people.president.id,
  });
  await opsPost(page, `/media/${media.id}/advance`, {
    status: "in_production",
    note: "بدء التنفيذ",
  });

  await page.reload();
  const after = await page.content();
  // The readiness view still renders and still names the media dimension.
  expect(after).not.toContain("TypeError");
  expect(after).toContain("الإعلام");

  // Clean up so later zero-data scenarios still see an empty operations area.
  await opsPost(page, `/media/${media.id}/advance`, {
    status: "cancelled",
    note: "إنهاء اختبار الجاهزية",
  });
});

test("C — استخبارات اللجنة محصورة في نطاق اللجنة", async ({ page }) => {
  await login(page, "head");

  const res = await page.goto("/intelligence/committees");
  expect(res?.status()).toBe(200);
  await expect(page.getByText("لجنة تجريبية", { exact: false }).first()).toBeVisible();
  // A committee head sees their own committee only.
  expect(await page.content()).not.toContain("اللجنة المستلمة التجريبية");
  // And the page states plainly that there is no ranking.
  await expect(page.getByText(/لا يوجد ترتيب بين اللجان/)).toBeVisible();

  // Executive intelligence is refused with a readable reason.
  const exec = await page.goto("/intelligence/executive");
  expect(exec?.status()).toBe(200);
  await expect(page.getByText(/متاحة للقيادة والمشرف فقط/)).toBeVisible();

  // Private finance figures never reach a media desk.
  const ops = await page.goto("/intelligence/operations");
  expect(ops?.status()).toBe(200);
  await expect(page.getByText("لا تملك صلاحية قراءة البيانات المالية")).toBeVisible();
});

test("D — التقرير التنفيذي: الفترة والإسناد وعرض الطباعة", async ({ page }) => {
  await login(page, "president");

  const res = await page.goto("/intelligence/reports/executive_periodic");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "إسناد المؤشرات" })).toBeVisible();
  await expect(page.getByText("وقت التوليد").first()).toBeVisible();
  // The period is stated rather than implied.
  await expect(page.getByText(/الفترة:/)).toBeVisible();
  // And the report repeats that it makes no ranking claim.
  await expect(page.getByText(/لا يتضمن هذا التقرير أي ترتيب/)).toBeVisible();

  // The printable view renders the same report in a print-oriented layout.
  const printable = await page.goto("/intelligence/reports/executive_periodic?print=1");
  expect(printable?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "التقرير التنفيذي الدوري", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "إسناد المؤشرات" })).toBeVisible();
});

test("E — التصدير يلتزم بنفس نطاق الصلاحيات", async ({ page }) => {
  // A permitted caller receives a CSV with a BOM for Arabic spreadsheets.
  await login(page, "president");
  const csv = await withTransportRetry(() => page.request.get(
    "/api/intelligence/report/executive_periodic?range=term&format=csv",
    { headers },
  ));
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const bytes = await csv.body();
  expect(bytes[0]).toBe(0xef);
  expect(bytes[1]).toBe(0xbb);
  expect(bytes[2]).toBe(0xbf);
  expect(new TextDecoder("utf-8").decode(bytes)).toContain("الإسناد");

  // A media desk cannot export the financial report, and nothing leaks.
  await login(page, "head");
  const denied = await withTransportRetry(() => page.request.get(
    "/api/intelligence/report/finance?range=term&format=csv",
    { headers },
  ));
  expect(denied.status()).toBe(403);
  expect(await denied.text()).not.toContain("مورّد");
});

test("F — الاستخبارات محجوبة جزئيًا عن عضو عادي", async ({ page }) => {
  await login(page, "member");

  const exec = await page.goto("/intelligence/executive");
  expect(exec?.status()).toBe(200);
  await expect(page.getByText(/متاحة للقيادة والمشرف فقط/)).toBeVisible();

  const committees = await page.goto("/intelligence/committees");
  expect(committees?.status()).toBe(200);
  await expect(page.getByText(/متاحة لقيادة اللجان/)).toBeVisible();

  // The operational surface a member is entitled to still renders.
  const ops = await page.goto("/intelligence/operations");
  expect(ops?.status()).toBe(200);
  expect(await ops?.text()).not.toContain("TypeError");
});