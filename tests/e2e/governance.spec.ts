import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { submitLogin } from "./auth";

const person = z.object({
  id: z.string(),
  email: z.email(),
  password: z.string(),
});
const people = z
  .object({
    head: person,
    member: person,
    approver: person,
    supervisor: person,
  })
  .parse(JSON.parse(readFileSync(".data/work-e2e-credentials.json", "utf8")));
type Actor = keyof typeof people;
const headers = { origin: "http://localhost:3001" };
const record = z.object({ id: z.string().min(1), title: z.string() });
const timeline = z.array(z.object({ action: z.string() }));
const reportDetail = z.object({
  row: record.extend({
    status: z.string(),
    summary: z.string(),
    sections: z.array(z.object({ id: z.string(), content: z.string() })),
  }),
  permissions: z.array(z.string()),
  reviewers: z.array(
    z.object({ id: z.string(), decision: z.string(), comment: z.string() }),
  ),
  timeline,
});
const evidenceDetail = z.object({
  row: record.extend({
    verificationStatus: z.string(),
    uploadedBy: z.string(),
  }),
  permissions: z.array(z.string()),
  timeline,
});
const actions = z.array(
  z.object({ id: z.string(), title: z.string(), type: z.string() }),
);
const savedCookies = new Map<
  Actor,
  Awaited<ReturnType<BrowserContext["cookies"]>>
>();

test("مدير النظام ينشئ موارد الحوكمة ويعدلها ويقدم التقرير من الواجهة", async ({
  page,
}) => {
  await login(page, "approver");
  const options = z
    .object({
      roles: z.array(z.object({ id: z.string() })),
      contexts: z.array(z.object({ permissions: z.array(z.string()) })),
    })
    .parse(await get(page, "options"));
  expect(options.roles.map((r) => r.id)).toContain("system_admin");
  for (const p of [
    "goal.create",
    "initiative.create",
    "kpi.create",
    "evidence.create",
    "report.create",
  ])
    expect(options.contexts.some((c) => c.permissions.includes(p))).toBe(true);
  const openCreate = async (tab: string, label: string) => {
    await page.goto(`/governance?tab=${tab}`);
    await page.getByRole("button", { name: label, exact: true }).click();
    return page.getByRole("dialog");
  };
  const saveSection = async (heading: string) => {
    const section = page.locator("section").filter({
      has: page.getByRole("heading", { name: heading, exact: true }),
    });
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" && r.url().includes("/api/governance/"),
    );
    await section.getByRole("button", { name: "حفظ", exact: true }).click();
    expect((await response).status()).toBe(200);
  };
  let form = await openCreate("goals", "هدف جديد");
  await form.getByLabel("عنوان هدف", { exact: true }).fill("هدف اختبار CRUD");
  await form
    .getByLabel("الفصل واللجنة")
    .selectOption({ label: "الفصل التجريبي · لجنة تجريبية" });
  await form.getByRole("button", { name: "إنشاء هدف", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "هدف اختبار CRUD", exact: true }),
  ).toBeVisible();
  const goalId = new URL(page.url()).searchParams.get("item")!;
  await page
    .getByLabel("عنوان الهدف", { exact: true })
    .fill("هدف اختبار CRUD معدل");
  await saveSection("تحديث الهدف");
  await expect(
    page.getByRole("heading", { name: "هدف اختبار CRUD معدل", exact: true }),
  ).toBeVisible();
  await page.getByLabel("الحالة التالية").selectOption("in_progress");
  await clickAction(page, `goals/${goalId}/edit`, "تحديث الحالة");
  await page.goto("/governance?tab=goals");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "هدف اختبار CRUD معدل",
        exact: true,
      }),
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`item=${goalId}$`));
  form = await openCreate("initiatives", "مبادرة جديدة");
  await form
    .getByLabel("عنوان مبادرة", { exact: true })
    .fill("مبادرة اختبار CRUD");
  await form.getByLabel("الهدف المرتبط").selectOption(goalId);
  await form.getByLabel("مسؤول المبادرة").selectOption(people.supervisor.id);
  await form.getByRole("button", { name: "إنشاء مبادرة", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "مبادرة اختبار CRUD", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("عنوان المبادرة", { exact: true })
    .fill("مبادرة اختبار CRUD معدلة");
  await saveSection("تعديل المبادرة");
  await expect(
    page.getByRole("heading", {
      name: "مبادرة اختبار CRUD معدلة",
      exact: true,
    }),
  ).toBeVisible();
  form = await openCreate("kpis", "مؤشر جديد");
  await form.getByLabel("عنوان مؤشر", { exact: true }).fill("مؤشر اختبار CRUD");
  await form
    .getByLabel("الفصل واللجنة")
    .selectOption({ label: "الفصل التجريبي · لجنة تجريبية" });
  await form.getByLabel("الهدف المرتبط").selectOption(goalId);
  await form.getByLabel("وحدة القياس").fill("جلسة");
  await form.getByLabel("القيمة المستهدفة").fill("10");
  await form.getByRole("button", { name: "إنشاء مؤشر", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "مؤشر اختبار CRUD", exact: true }),
  ).toBeVisible();
  const kpiUrl = page.url(),
    kpiId = new URL(kpiUrl).searchParams.get("item")!;
  await page.getByLabel("القيمة المستهدفة").fill("12");
  await saveSection("تعريف المؤشر وطريقة حسابه");
  await page.getByLabel("قيمة القياس", { exact: true }).fill("3");
  await page.getByLabel("تاريخ القياس").fill("2026-09-01");
  await page.getByLabel("ملاحظة المصدر وطريقة القياس").fill("قياس اختبار فقط");
  await clickAction(page, `kpis/${kpiId}/measure`, "إضافة قياس");
  await expect(page.getByText("3 جلسة", { exact: true })).toBeVisible();
  form = await openCreate("evidence", "إضافة دليل");
  await form.getByLabel("عنوان دليل", { exact: true }).fill("دليل اختبار CRUD");
  await form
    .getByLabel("الوصف", { exact: true })
    .fill("توثيق تجريبي لمصدر القياس");
  await form
    .getByRole("combobox", { name: "مصدر الدليل", exact: true })
    .selectOption(`kpi:${kpiId}`);
  await form.getByRole("button", { name: "إنشاء دليل", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "دليل اختبار CRUD", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "تسجيل قرار التحقق" }),
  ).toHaveCount(0);
  const evidenceId = new URL(page.url()).searchParams.get("item")!;
  await page.goto(kpiUrl);
  await page.getByLabel("الدليل المرتبط بالقياس").selectOption(evidenceId);
  await clickAction(page, `evidence/${evidenceId}/link`, "ربط دليل بالقياس");
  await expect(
    page.getByRole("link", { name: "افتح الدليل المرتبط", exact: true }),
  ).toBeVisible();
  form = await openCreate("reports", "إنشاء تقرير");
  await form
    .getByLabel("عنوان تقرير", { exact: true })
    .fill("تقرير اختبار CRUD");
  await form
    .getByLabel("ملخص التقرير", { exact: true })
    .fill("ملخص اختبار موثق");
  await form
    .getByLabel("الفصل واللجنة")
    .selectOption({ label: "الفصل التجريبي · لجنة تجريبية" });
  await form.getByLabel("بداية الفترة").fill("2026-09-01");
  await form.getByLabel("نهاية الفترة").fill("2026-09-07");
  await form.getByRole("button", { name: "إنشاء تقرير", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "تقرير اختبار CRUD", exact: true }),
  ).toBeVisible();
  const reportId = new URL(page.url()).searchParams.get("item")!;
  for (const label of ["الإنجازات", "التحديات", "خطة الفترة القادمة"]) {
    await page.getByLabel(label, { exact: true }).fill("محتوى تجريبي موثق");
    await saveSection(label);
  }
  await page.getByLabel("المراجع المستقل").selectOption(people.supervisor.id);
  await clickAction(page, `reports/${reportId}/reviewers`, "تعيين المراجع");
  await clickAction(page, `reports/${reportId}/submit`, "تقديم للمراجعة");
  expect(
    reportDetail.parse(await get(page, `reports/${reportId}`)).row.status,
  ).toBe("submitted");
  await expect(
    page.getByRole("button", { name: "تقديم للمراجعة", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/governance-crud-submitted.png",
    fullPage: true,
  });
  await login(page, "supervisor");
  for (const [kind, label] of [
    ["goals", "هدف جديد"],
    ["initiatives", "مبادرة جديدة"],
    ["kpis", "مؤشر جديد"],
    ["evidence", "إضافة دليل"],
    ["reports", "إنشاء تقرير"],
  ]) {
    await page.goto(`/governance?tab=${kind}`);
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/للقراءة فقط:/)).toBeVisible();
  }
  await page.goto(kpiUrl);
  await expect(
    page.getByRole("heading", { name: "مؤشر اختبار CRUD", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "إضافة قياس", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "تعديل المؤشر", exact: true }),
  ).toHaveCount(0);
});

async function login(page: Page, key: Actor) {
  await page.context().clearCookies();
  const saved = savedCookies.get(key);
  if (saved) {
    await page.context().addCookies(saved);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /السلام عليكم/ }),
    ).toBeVisible();
    return;
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
  if (await page.getByRole("button", { name: "لنبدأ رحلتك" }).isVisible()) {
    await page.getByRole("button", { name: "لنبدأ رحلتك" }).click();
    await expect(
      page.getByRole("heading", { name: /السلام عليكم/ }),
    ).toBeVisible();
  }
  savedCookies.set(key, await page.context().cookies());
}

async function get(page: Page, path: string): Promise<unknown> {
  const response = await page.request.get(`/api/governance/${path}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  return response.json();
}

async function post(
  page: Page,
  path: string,
  data: unknown,
  status = 200,
): Promise<unknown> {
  const response = await page.request.post(`/api/governance/${path}`, {
    headers,
    data,
  });
  expect(response.status()).toBe(status);
  return response.json();
}

async function clickAction(page: Page, path: string, label: string) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/governance/${path}`) &&
        r.request().method() === "POST",
    ),
    page.getByRole("button", { name: label, exact: true }).click(),
  ]);
  expect(response.status()).toBe(200);
}

async function createGoal(
  page: Page,
  title: string,
  committeeId = "test-media",
) {
  const goal = record.parse(
    await post(
      page,
      "goals",
      { title, committeeId, academicTermId: "test-term" },
      201,
    ),
  );
  const detail = z
    .object({ row: record })
    .parse(await get(page, `goals/${goal.id}`));
  expect(detail.row).toEqual(goal);
  return goal;
}

async function createSubmittedReport(page: Page, title: string) {
  const options = z
    .object({ reportTypes: z.array(z.object({ id: z.string() })) })
    .parse(await get(page, "options"));
  const type = options.reportTypes.find(
    (t) => t.id === "weekly-committee-report",
  );
  if (!type)
    throw new Error("The E2E seed must provision weekly-committee-report");
  const report = record.parse(
    await post(
      page,
      "reports",
      {
        title,
        summary: "ملخص موثق لبيانات الاختبار فقط",
        typeId: type.id,
        academicTermId: "test-term",
        committeeId: "test-media",
        periodStart: "2026-09-01T00:00:00+03:00",
        periodEnd: "2026-09-07T23:59:00+03:00",
        sectionKeys: ["achievements", "next_plan", "kpi_updates"],
      },
      201,
    ),
  );
  const path = `reports/${report.id}`;
  const draft = reportDetail.parse(await get(page, path));
  for (const section of draft.row.sections) {
    await post(page, `${path}/section`, {
      sectionId: section.id,
      content: "محتوى تجريبي موثق للقسم",
    });
  }
  await post(page, `${path}/reviewers`, { userIds: [people.supervisor.id] });
  await post(page, `${path}/submit`, {});
  const submitted = reportDetail.parse(await get(page, path));
  expect(submitted.row.status).toBe("submitted");
  expect(submitted.row.sections).toHaveLength(3);
  expect(
    submitted.row.sections.every(
      (s) => s.content === "محتوى تجريبي موثق للقسم",
    ),
  ).toBe(true);
  expect(submitted.reviewers).toEqual([
    { id: people.supervisor.id, decision: "pending", comment: "" },
  ]);
  return report;
}

test("لوحة الحوكمة تعرض التبويبات والقوائم والمقاييس المشتقة", async ({
  page,
}) => {
  await login(page, "head");
  const goal = await createGoal(page, "هدف لوحة الحوكمة");
  await page.goto("/governance");
  await expect(
    page.getByRole("heading", { name: "الحوكمة والأدلة", exact: true }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "مساحات الحوكمة" });
  for (const tab of [
    "الأهداف",
    "المبادرات",
    "المؤشرات",
    "خزنة الأدلة",
    "التقارير",
  ]) {
    await nav.getByRole("link", { name: tab, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: tab, exact: true }),
    ).toBeVisible();
  }
  await nav.getByRole("link", { name: "الأهداف", exact: true }).click();
  await expect(
    page.getByRole("link").filter({
      has: page.getByRole("heading", { name: goal.title, exact: true }),
    }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "النبض والقيادة", exact: true }).click();
  const snapshot = z
    .object({
      pulse: z.array(
        z.object({
          label: z.string(),
          value: z.number().nullable(),
          numerator: z.number(),
          denominator: z.number(),
          formula: z.string(),
        }),
      ),
    })
    .parse(await get(page, "snapshot"));
  expect(snapshot.pulse).toHaveLength(4);
  for (const metric of snapshot.pulse) {
    const card = page.locator("article").filter({
      has: page.getByRole("heading", { name: metric.label, exact: true }),
    });
    await expect(card.locator(".gov-value")).toHaveText(
      metric.value === null ? "غير متاح" : `${metric.value}٪`,
    );
    await card.getByText("كيف حُسبت؟", { exact: true }).click();
    await expect(
      card.getByText(
        `${metric.numerator} / ${metric.denominator} · ${metric.formula}`,
        { exact: true },
      ),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("بحث الحوكمة يعرض النتائج ضمن النطاق ويعالج غياب النتائج", async ({
  page,
}) => {
  await login(page, "head");
  const goal = await createGoal(page, "هدف بحث الحوكمة");
  await login(page, "approver");
  const hidden = await createGoal(
    page,
    "هدف بحث الحوكمة للجنة الأخرى",
    "test-private",
  );
  await login(page, "head");
  await page.goto("/governance/search");
  await expect(
    page.getByRole("heading", { name: "الحوكمة والأدلة", exact: true }),
  ).toBeVisible();
  const query = encodeURIComponent(goal.title);
  const results = z.array(record).parse(await get(page, `search?q=${query}`));
  expect(results).toContainEqual(goal);
  expect(results.map((r) => r.id)).not.toContain(hidden.id);
  await page.goto(`/governance/search?q=${query}`);
  await expect(
    page.getByRole("heading", {
      name: `نتائج البحث عن “${goal.title}”`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: goal.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: hidden.title, exact: true }),
  ).toHaveCount(0);
  await page.goto("/governance/search?q=عبارة-لا-تطابق-أي-سجل");
  await expect(
    page.getByText("لا توجد وردة تطابق البحث.", { exact: true }),
  ).toBeVisible();
  expect(await get(page, "search?q=س")).toEqual([]);
});

test("صندوق وارد الحوكمة يعرض مراجعة فعلية مع السبب ورابط التقرير", async ({
  page,
}) => {
  await login(page, "head");
  const report = await createSubmittedReport(page, "تقرير وارد الحوكمة");
  await login(page, "supervisor");
  expect(actions.parse(await get(page, "inbox"))).toContainEqual({
    id: `review:${report.id}`,
    title: report.title,
    type: "report_review",
  });
  await page.goto("/governance/inbox");
  await expect(
    page.getByRole("heading", { name: "صندوق الوارد", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "كيف يُملأ الصندوق؟", exact: true }),
  ).toBeVisible();
  const row = page.locator("article").filter({
    has: page.getByRole("link", { name: report.title, exact: true }),
  });
  await expect(
    row.getByText("مراجعة مسندة إليك ضمن نطاقك", { exact: true }),
  ).toBeVisible();
  await row.getByRole("link", { name: report.title, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: report.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "تسجيل توصية المراجعة" }),
  ).toBeVisible();
});

test("مركز القيادة يعرض النبض والمؤشرات وصحة اللجان والمراجعة الأسبوعية", async ({
  page,
}) => {
  await login(page, "approver");
  await page.goto("/governance/executive");
  for (const name of [
    "مركز القيادة",
    "نبض النادي الكامل",
    "المؤشرات والمتابعة",
    "صحة اللجان",
    "التنبيهات",
    "قرارات تنتظرك",
  ]) {
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("navigation", { name: "مساحات الحوكمة" })
    .getByRole("link", { name: "المراجعة الأسبوعية", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "المراجعة الأسبوعية", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "اكتمل هذا الأسبوع", exact: true }),
  ).toBeVisible();
});

test("مسار موجز المشرف يعرض المراجعات المسندة ويمنع العضو غير المخول", async ({
  page,
}) => {
  await login(page, "head");
  const report = await createSubmittedReport(page, "تقرير موجز المشرف");
  await login(page, "supervisor");
  const response = await page.goto("/supervisor/brief");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/supervisor\/brief$/);
  await expect(
    page.getByRole("heading", { name: "ما يحتاج مراجعتك", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText("ملخص المشرف", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "افتح الحوكمة", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: report.title, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: report.title, exact: true }),
  ).toBeVisible();
  await login(page, "member");
  await page.goto("/supervisor/brief");
  await expect(
    page.getByRole("heading", { name: "هذه المساحة غير متاحة", exact: true }),
  ).toBeVisible();
});

test("طلب تعديل ثم توصية مراجعة لا يعتمدان التقرير حتى قرار المعتمد المستقل", async ({
  page,
}) => {
  await login(page, "head");
  const report = await createSubmittedReport(
    page,
    "تقرير فصل المراجعة عن الاعتماد",
  );
  const path = `reports/${report.id}`;
  const href = `/governance?tab=reports&item=${report.id}`;
  await post(page, `${path}/approve`, {}, 403);
  await login(page, "approver");
  await post(page, `${path}/approve`, {}, 409);
  expect(reportDetail.parse(await get(page, path)).row.status).toBe(
    "submitted",
  );

  await login(page, "supervisor");
  await page.goto(href);
  await page
    .getByRole("combobox", { name: "قرار المراجعة", exact: true })
    .selectOption("changes_requested");
  await page
    .getByRole("textbox", { name: "ملاحظة المراجعة", exact: true })
    .fill("تعديل مطلوب في الملخص");
  await clickAction(page, `${path}/review`, "تسجيل توصية المراجعة");
  const changes = reportDetail.parse(await get(page, path));
  expect(changes.row.status).toBe("changes_requested");
  expect(changes.reviewers).toEqual([
    {
      id: people.supervisor.id,
      decision: "changes_requested",
      comment: "تعديل مطلوب في الملخص",
    },
  ]);
  expect(
    actions.parse(await get(page, "inbox")).map((a) => a.id),
  ).not.toContain(`review:${report.id}`);

  await login(page, "head");
  expect(actions.parse(await get(page, "inbox"))).toContainEqual({
    id: `changes:${report.id}`,
    title: report.title,
    type: "report_changes",
  });
  await page.goto("/governance/inbox");
  await page.getByRole("link", { name: report.title, exact: true }).click();
  const summary = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "تحرير ملخص التقرير",
      exact: true,
    }),
  });
  await summary
    .getByRole("textbox", { name: "ملخص التقرير", exact: true })
    .fill("ملخص مصحح بعد ملاحظات المشرف");
  await summary.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect
    .poll(async () => reportDetail.parse(await get(page, path)).row.summary)
    .toBe("ملخص مصحح بعد ملاحظات المشرف");
  await clickAction(page, `${path}/submit`, "تقديم للمراجعة");
  const resubmitted = reportDetail.parse(await get(page, path));
  expect(resubmitted.row.status).toBe("submitted");
  expect(resubmitted.reviewers[0]?.decision).toBe("pending");

  await login(page, "supervisor");
  await page.goto(href);
  await page
    .getByRole("textbox", { name: "ملاحظة المراجعة", exact: true })
    .fill("أوصي بالموافقة بعد التصحيح");
  await clickAction(page, `${path}/review`, "تسجيل توصية المراجعة");
  const reviewed = reportDetail.parse(await get(page, path));
  expect(reviewed.row.status).toBe("under_review");
  expect(reviewed.reviewers[0]?.decision).toBe("approved");
  expect(reviewed.permissions).toContain("report.review");
  expect(reviewed.permissions).not.toContain("report.approve");
  expect(reviewed.timeline.map((e) => e.action)).toContain("reviewed");
  expect(reviewed.timeline.map((e) => e.action)).not.toContain("approved");
  await expect(
    page.getByRole("button", { name: "اعتماد التقرير", exact: true }),
  ).toHaveCount(0);
  await post(page, `${path}/approve`, {}, 403);
  expect(reportDetail.parse(await get(page, path)).row.status).toBe(
    "under_review",
  );

  await login(page, "approver");
  expect(actions.parse(await get(page, "inbox"))).toContainEqual({
    id: `approve:${report.id}`,
    title: report.title,
    type: "report_approval",
  });
  await page.goto("/governance/inbox");
  await page.getByRole("link", { name: report.title, exact: true }).click();
  await clickAction(page, `${path}/approve`, "اعتماد التقرير");
  const approved = reportDetail.parse(await get(page, path));
  expect(approved.row.status).toBe("approved");
  expect(approved.timeline.map((e) => e.action)).toEqual(
    expect.arrayContaining(["reviewed", "approved"]),
  );
  expect(
    actions.parse(await get(page, "inbox")).map((a) => a.id),
  ).not.toContain(`approve:${report.id}`);
});

test("مشاهدة الدليل لا تمنح التحقق ولا تسمح بتحقق صاحبه أو تعديل الدليل المراجع", async ({
  page,
}) => {
  await login(page, "head");
  const goal = await createGoal(page, "هدف توثيق الدليل");
  const evidence = record.parse(
    await post(
      page,
      "evidence",
      {
        title: "دليل فصل المشاهدة عن التحقق",
        description: "وصف مصدر الدليل التجريبي",
        evidenceType: "manual",
        sourceEntityType: "goal",
        sourceEntityId: goal.id,
        classification: "internal",
      },
      201,
    ),
  );
  const path = `evidence/${evidence.id}`;
  const href = `/governance?tab=evidence&item=${evidence.id}`;
  expect(evidenceDetail.parse(await get(page, path)).row.uploadedBy).toBe(
    people.head.id,
  );
  await post(page, `${path}/verify`, { decision: "reviewed" }, 403);
  await login(page, "supervisor");
  const viewed = evidenceDetail.parse(await get(page, path));
  expect(viewed.row.verificationStatus).toBe("unreviewed");
  expect(viewed.permissions).not.toContain("evidence.verify");
  await page.goto(href);
  await expect(
    page.getByRole("heading", { name: evidence.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "تسجيل قرار التحقق", exact: true }),
  ).toHaveCount(0);
  await post(page, `${path}/verify`, { decision: "reviewed" }, 403);
  const unchanged = evidenceDetail.parse(await get(page, path));
  expect(unchanged.row.verificationStatus).toBe("unreviewed");
  expect(unchanged.timeline.map((e) => e.action)).not.toContain("verified");
  await login(page, "approver");
  await page.goto(href);
  await page
    .getByRole("textbox", { name: "ملاحظة التحقق", exact: true })
    .fill("تحقق مستقل من المصدر");
  await clickAction(page, `${path}/verify`, "تسجيل قرار التحقق");
  const verified = evidenceDetail.parse(await get(page, path));
  expect(verified.row.verificationStatus).toBe("reviewed");
  expect(verified.timeline.map((e) => e.action)).toContain("verified");
  await login(page, "head");
  await post(page, `${path}/edit`, { title: "تعديل غير مسموح" }, 409);
  expect(evidenceDetail.parse(await get(page, path)).row).toMatchObject({
    title: evidence.title,
    verificationStatus: "reviewed",
  });
});

test("Ctrl+K ينقل إلى بحث الحوكمة ثم يفتح السجل الفعلي", async ({ page }) => {
  await login(page, "head");
  const goal = await createGoal(page, "هدف البحث من لوحة الأوامر");
  await page.goto("/governance");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("البحث في المقر").fill(goal.title);
  await dialog.getByRole("link", { name: /بحث الحوكمة/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/governance/search\\?q=${encodeURIComponent(goal.title)}$`),
  );
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: goal.title, exact: true }),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: goal.title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`item=${goal.id}$`));
});
