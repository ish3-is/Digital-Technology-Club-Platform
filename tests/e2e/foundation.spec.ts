import { submitLogin } from "./auth";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const credentials = JSON.parse(
  readFileSync(".data/e2e-credentials.json", "utf8"),
);
test("الدخول والتهيئة والنطاق والجوال والثيم والخروج", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
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
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("البحث في المقر").fill("اللجان");
  await page.getByRole("dialog").getByRole("link", { name: "اللجان", exact: true }).click();
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
