import { submitLogin } from "./auth";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
const people = JSON.parse(
  readFileSync(".data/work-e2e-credentials.json", "utf8"),
);
const savedCookies = new Map<
  string,
  Awaited<ReturnType<BrowserContext["cookies"]>>
>();
async function login(page: Page, key: string) {
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
async function createTask(page: Page, title: string) {
  const response = await page.request.post("/api/work", {
    headers: { origin: "http://localhost:3001" },
    data: {
      kind: "task",
      title,
      committeeId: "test-media",
      termId: "test-term",
      responsibleId: people.member.id,
      reviewerId: people.head.id,
      dueAt: new Date(Date.now() + 3600000).toISOString(),
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
test("عملي على الجوال: تنفيذ وتعليق وإشارة وطلب مراجعة واعتماد", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  await login(page, "head");
  const title = `مهمة متصفح ${Date.now()}`;
  const item = await createTask(page, title);
  await page.context().clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "member");
  await page.goto("/work");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "بدء التنفيذ", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "طلب المراجعة" }),
  ).toBeVisible();
  await dialog.getByLabel("تعليقك").fill("تم تنفيذ العمل، يرجى المراجعة.");
  await dialog
    .getByRole("listbox", { name: "إشارة إلى زميل" })
    .selectOption(people.head.id);
  await dialog
    .getByRole("button", { name: "إضافة تعليق", exact: true })
    .click();
  await expect(
    dialog.getByText("تم تنفيذ العمل، يرجى المراجعة.", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("إرفاق صورة أو ملف نصي").setInputFiles({
    name: "evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("دليل تجريبي للمتصفح"),
  });
  await dialog.getByRole("button", { name: "رفع المرفق", exact: true }).click();
  await expect(
    dialog.getByRole("link", { name: /evidence.txt/ }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "طلب المراجعة" }).click();
  await expect(
    dialog.getByText("مهمة · بانتظار المراجعة", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/task-mobile.png",
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "إغلاق التفاصيل" }).click();
  await page.goto("/work/tasks");
  await page.getByRole("button", { name: "عرض اللوحة" }).click();
  await expect(
    page
      .locator(".kanban-column")
      .filter({
        has: page.getByRole("heading", {
          name: "بانتظار المراجعة",
          exact: true,
        }),
      })
      .getByRole("button", { name: new RegExp(title) }),
  ).toBeVisible();
  const reviewer = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await login(reviewer, "head");
  await reviewer.goto("/inbox");
  await reviewer.getByRole("button", { name: new RegExp(title) }).click();
  await reviewer
    .getByRole("dialog")
    .getByLabel("تعليق المراجعة")
    .fill("تم التحقق من الدليل");
  await reviewer.getByRole("button", { name: "تسجيل قرار المراجعة" }).click();
  await expect(
    reviewer.getByRole("dialog").getByText("مهمة · مكتملة", { exact: true }),
  ).toBeVisible();
  await reviewer.screenshot({
    path: "test-results/approval-mobile.png",
    fullPage: false,
  });
  await reviewer.close();
  expect((await page.request.get(`/api/work/${item.id}`)).status()).toBe(200);
});
test("إنشاء طلب في الواجهة ووصوله إلى صندوق وارد اللجنة المستلمة", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  await login(page, "head");
  await page.goto("/work/requests");
  await page.getByRole("button", { name: "طلب جديد", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const title = `طلب متصفح ${Date.now()}`;
  await dialog.getByLabel("العنوان", { exact: true }).fill(title);
  await dialog
    .getByLabel("الوصف", { exact: true })
    .fill("طلب فعلي بين لجنتين في قاعدة الاختبار");
  await dialog
    .getByRole("combobox", { name: "اللجنة المستلمة", exact: true })
    .selectOption("test-private");
  await dialog.getByRole("button", { name: "حفظ وفتح التفاصيل" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const recipient = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await login(recipient, "recipient");
  await recipient.goto("/inbox");
  await recipient.getByRole("button", { name: new RegExp(title) }).click();
  await recipient
    .getByRole("button", { name: "استلام الطلب", exact: true })
    .click();
  await expect(
    recipient
      .getByRole("dialog")
      .getByText("طلب · تم الاستلام", { exact: true }),
  ).toBeVisible();
  await recipient.screenshot({
    path: "test-results/request-mobile.png",
    fullPage: false,
  });
  expect(
    await recipient.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await recipient.close();
});
test("اجتماع وقرار وتحويله إلى مهمة والبحث والإنشاء السريع", async ({
  page,
}) => {
  test.setTimeout(240000);
  await login(page, "head");
  await page.goto("/work/meetings");
  await page.getByRole("button", { name: "اجتماع جديد", exact: true }).click();
  let dialog = page.getByRole("dialog");
  const title = `اجتماع متصفح ${Date.now()}`;
  await dialog.getByLabel("العنوان", { exact: true }).fill(title);
  await dialog.getByLabel("البداية بتوقيت الرياض").fill("2027-01-20T10:00");
  await dialog.getByLabel("النهاية بتوقيت الرياض").fill("2027-01-20T11:00");
  await dialog
    .getByRole("listbox", { name: "المدعوون", exact: true })
    .selectOption(people.member.id);
  await dialog.getByRole("button", { name: "حفظ وفتح التفاصيل" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/meeting-mobile.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "تسجيل قرار", exact: true }).click();
  dialog = page.getByRole("dialog").last();
  const decision = `قرار متصفح ${Date.now()}`;
  await dialog.getByLabel("العنوان", { exact: true }).fill(decision);
  await dialog.getByRole("button", { name: "حفظ وفتح التفاصيل" }).click();
  await expect(
    page.getByRole("heading", { name: decision, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "إنشاء مهمة مرتبطة" }).click();
  dialog = page.getByRole("dialog").last();
  await dialog
    .getByLabel("العنوان", { exact: true })
    .fill("تنفيذ القرار التجريبي");
  await dialog
    .getByRole("combobox", { name: "المسؤول الرئيسي", exact: true })
    .selectOption(people.member.id);
  await dialog
    .getByRole("combobox", { name: "المراجع", exact: true })
    .selectOption(people.head.id);
  await dialog.getByRole("button", { name: "حفظ وفتح التفاصيل" }).click();
  await expect(
    page.getByRole("heading", { name: "تنفيذ القرار التجريبي", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "إغلاق التفاصيل" }).click();
  await page.goto("/work/decisions");
  await expect(
    page.getByRole("button", { name: new RegExp(decision) }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByLabel("البحث في المقر").fill(decision);
  await expect(
    page.getByRole("dialog").getByRole("link", { name: new RegExp(decision) }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/work/tasks");
  await page.getByRole("button", { name: "عرض اللوحة" }).click();
  await page.screenshot({
    path: "test-results/work-desktop.png",
    fullPage: false,
  });
});
