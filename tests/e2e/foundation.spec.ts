import { submitLogin } from "./auth";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const credentials = JSON.parse(
  readFileSync(".data/e2e-credentials.json", "utf8"),
);
test("الدخول والتهيئة والنطاق والجوال والثيم والخروج", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
  await expect(page.getByText("إحدى أعمال")).toBeVisible();
  await page.getByRole("link", { name: "طلب إضافة حساب" }).click();
  await expect(page.getByRole("heading", { name: "طلب إضافة حساب" })).toBeVisible();
  await page.getByLabel("الاسم الكامل في سجل النادي").fill("مشعل الجذمي");
  await page.getByLabel("البريد الإلكتروني").fill("new-member@example.test");
  await page.getByLabel("لجنتك").selectOption("media");
  await page.getByRole("button", { name: "مطابقة العضوية وإرسال الطلب" }).click();
  await expect(
    page.getByText(/اسمك غير موجود ضمن هذه اللجنة/),
  ).toBeVisible();
  await page.getByLabel("لجنتك").selectOption("digital");
  await page.getByRole("button", { name: "مطابقة العضوية وإرسال الطلب" }).click();
  await expect(page.getByRole("heading", { name: "وصل طلبك" })).toBeVisible();
  await expect(page.getByText("تمت مطابقة اسمك وتسجيل الطلب")).toBeVisible();
  await page.getByRole("link", { name: "العودة إلى تسجيل الدخول" }).click();
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("البريد الإلكتروني").fill(credentials.email);
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill(credentials.password);
  await submitLogin(page);
  await expect(
    page.getByRole("heading", { name: /السلام عليكم|أهلًا بك في فريق النادي/ }),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "لنبدأ رحلتك" }).isVisible()) {
    await page.getByLabel("الاسم الذي سيظهر لزملائك").fill("بيانات تجريبية");
    await page.getByRole("button", { name: "لنبدأ رحلتك" }).click();
  }
  await expect(
    page.getByRole("heading", { name: /السلام عليكم/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "نبض النادي" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "المتصلون الآن" })).toBeVisible();
  const onlineMembers = page.getByRole("list", { name: "أسماء المتصلين الآن" });
  await expect(onlineMembers).toBeVisible();
  await expect(onlineMembers.getByRole("listitem").first()).toContainText(/\S+/);
  const donutTab = page.getByRole("tab", { name: "دائرة" });
  await donutTab.click();
  await expect(donutTab).toHaveAttribute("aria-selected", "true");
  const columnsTab = page.getByRole("tab", { name: "أعمدة" });
  await columnsTab.click();
  await expect(columnsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/نجم الشهر/)).toBeVisible();
  await expect(page.getByText(/لجنة الشهر/)).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  expect(
    (await page.request.get("/api/committees/test-private")).status(),
  ).toBe(404);
  expect((await page.request.get("/api/admin")).status()).toBe(403);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "هذه المساحة غير متاحة" }),
  ).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "البحث والتنقل" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("البحث في المقر").fill("اللجان");
  await page.getByRole("dialog").getByRole("link", { name: "اللجان", exact: true }).click();
  await expect(page.getByRole("button", { name: "تشكيل لجنة جديدة" })).toHaveCount(0);
  await page.getByRole("link", { name: /لجنة تجريبية/ }).click();
  await page.getByLabel("نبذة اللجنة").fill("بيانات تجريبية: تحديث موثق");
  await page.getByRole("button", { name: "حفظ النبذة" }).click();
  await expect(
    page.getByText("تم حفظ نبذة اللجنة", { exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "تفعيل الوضع الداكن" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/home-dark.png", fullPage: true });
  await page.getByRole("button", { name: "تفعيل الوضع الفاتح" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/notifications");
  const unread = await page.getByRole("button", { name: "تم الاطلاع" }).count();
  if (unread) {
    await page.getByRole("button", { name: "تم الاطلاع" }).first().click();
    await expect(page.getByRole("button", { name: "تم الاطلاع" })).toHaveCount(
      unread - 1,
    );
  }
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page).toHaveURL(/login/);
  expect((await page.request.get("/api/foundation")).status()).toBe(401);
});
