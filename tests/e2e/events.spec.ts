import { submitLogin } from "./auth";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const people = JSON.parse(
  readFileSync(".data/work-e2e-credentials.json", "utf8"),
);
const headers = { origin: "http://localhost:3001" };
async function login(page: Page, key: string) {
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
async function mobile(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/event-${name}-mobile.png`,
    fullPage: false,
  });
}
test("غرفة العمليات: إنشاء وقالب وجاهزية ومهمة واعتماد وحضور وطلب إلى لجنة أخرى", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  await login(page, "head");
  await page.goto("/events");
  await mobile(page, "list");
  await page.getByRole("button", { name: "إنشاء فعالية", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const title = `ورشة متصفح ${Date.now()}`;
  await dialog.getByLabel("عنوان الفعالية", { exact: true }).fill(title);
  await dialog
    .getByRole("combobox", { name: "قالب التشغيل", exact: true })
    .selectOption("workshop");
  await dialog
    .getByRole("combobox", { name: "قائد الفعالية", exact: true })
    .selectOption(people.member.id);
  await dialog
    .getByRole("combobox", { name: "المعتمد المستقل", exact: true })
    .selectOption(people.approver.id);
  await dialog
    .getByLabel("البداية بتوقيت الرياض", { exact: true })
    .fill("2026-10-01T12:00");
  await dialog
    .getByLabel("النهاية بتوقيت الرياض", { exact: true })
    .fill("2026-10-01T15:00");
  await dialog.getByLabel("الموقع", { exact: true }).fill("قاعة تجريبية");
  await dialog
    .getByLabel("الجمهور المستهدف", { exact: true })
    .fill("طلاب النادي");
  await dialog.getByRole("button", { name: "إنشاء غرفة العمليات" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const id = page.url().split("/").pop()!;
  await mobile(page, "control");
  await page.getByRole("button", { name: "تفاصيل الجاهزية" }).click();
  await expect(
    page.getByRole("heading", { name: "ما الذي ينقصنا؟" }),
  ).toBeVisible();
  for (const label of [
    "تحديد الموقع",
    "اعتماد الموعد وخطة الورشة",
    "تجهيز رابط أو قائمة التسجيل",
  ]) {
    const row = page
      .locator(".readiness-row")
      .filter({ has: page.getByText(label, { exact: true }) });
    await row
      .getByRole("button", { name: "إكمال المتطلب", exact: true })
      .click();
    await expect(row.getByRole("button", { name: "إعادة فتح" })).toBeVisible();
  }
  await mobile(page, "readiness");
  await page
    .getByRole("button", { name: "المهام والطلبات", exact: true })
    .click();
  await mobile(page, "tasks");
  await page.getByRole("link", { name: "إنشاء مهمة", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel("العنوان", { exact: true })
    .fill("مهمة مرتبطة بالورشة");
  await page
    .getByRole("combobox", { name: "المسؤول الرئيسي", exact: true })
    .selectOption(people.member.id);
  await page
    .getByRole("combobox", { name: "المراجع", exact: true })
    .selectOption(people.head.id);
  await page
    .getByRole("button", { name: "حفظ وفتح التفاصيل", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "مهمة مرتبطة بالورشة" }),
  ).toBeVisible();
  let detail = await (await page.request.get(`/api/events/${id}`)).json();
  expect(
    detail.work.some(
      (w: { title: string; eventId: string }) =>
        w.title === "مهمة مرتبطة بالورشة" && w.eventId === id,
    ),
  ).toBe(true);
  await page.goto(`/events/${id}`);
  await page
    .getByRole("button", { name: "إرسال للاعتماد", exact: true })
    .click();
  await expect(
    page.getByText("اعتماد الفعالية · بانتظار", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/event-control-desktop.png",
    fullPage: true,
  });
  const approverContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const approver = await approverContext.newPage();
  await login(approver, "approver");
  await approver.goto("/inbox");
  await approver
    .getByRole("button")
    .filter({ has: approver.getByText(title, { exact: true }) })
    .click();
  await expect(
    approver.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await mobile(approver, "approval");
  await approver.getByLabel("تعليق المراجع").fill("معتمد للتنفيذ");
  await approver.getByRole("button", { name: "تسجيل قرار الاعتماد" }).click();
  await expect(
    approver.getByText("اعتماد الفعالية · معتمد", { exact: true }),
  ).toBeVisible();
  await approverContext.close();
  await page.goto(`/events/${id}`);
  await page.getByRole("button", { name: "الانتقال إلى فتح التسجيل" }).click();
  await page
    .getByRole("button", { name: "التسجيل والحضور", exact: true })
    .click();
  await page.getByText("إضافة مشارك يدويًا", { exact: true }).click();
  await page.getByLabel("اسم المشارك", { exact: true }).fill("مشارك متصفح");
  await page
    .getByLabel("البريد الإلكتروني", { exact: true })
    .fill(`participant-${Date.now()}@example.test`);
  await page
    .getByRole("button", { name: "تسجيل المشارك", exact: true })
    .click();
  await expect(page.getByText("مشارك متصفح", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "تحديث حضور مشارك متصفح", exact: true })
    .selectOption("present");
  await expect(
    page.locator(".participant-row small").filter({ hasText: /^حضر$/ }),
  ).toBeVisible();
  await mobile(page, "attendance");
  await page.goto(`/events/${id}`);
  await page
    .getByRole("button", { name: "المهام والطلبات", exact: true })
    .click();
  await page.getByRole("link", { name: "إنشاء طلب", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("العنوان", { exact: true })
    .fill(`طلب تصميم ${title}`);
  await page
    .getByRole("combobox", { name: "اللجنة المستلمة", exact: true })
    .selectOption("test-private");
  await page
    .getByRole("combobox", { name: "مراجع الجهة الطالبة", exact: true })
    .selectOption(people.head.id);
  await page
    .getByRole("button", { name: "حفظ وفتح التفاصيل", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: `طلب تصميم ${title}` }),
  ).toBeVisible();
  await mobile(page, "request");
  const recipientContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const recipient = await recipientContext.newPage();
  await login(recipient, "recipient");
  expect((await recipient.request.get(`/api/events/${id}`)).status()).toBe(404);
  await recipient.goto("/inbox");
  await recipient
    .getByRole("button")
    .filter({ has: recipient.getByText(`طلب تصميم ${title}`, { exact: true }) })
    .click();
  await recipient
    .getByRole("button", { name: "استلام الطلب", exact: true })
    .click();
  await expect(
    recipient.getByText("طلب · تم الاستلام", { exact: true }),
  ).toBeVisible();
  await recipientContext.close();
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.getByLabel("البحث في المقر").fill(title);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: new RegExp(title) })
      .first(),
  ).toBeVisible();
});
