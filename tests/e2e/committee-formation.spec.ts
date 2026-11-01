import { expect, test } from "@playwright/test";
import { loginAs } from "./auth";

test.setTimeout(90_000);

test("تشكيل لجنة يفتح مساحتها ويقيّد الاعتماد بالمعتمد المحدد", async ({ page }) => {
  await loginAs(page, "approver");
  await page.goto("/committees");
  await page.getByRole("button", { name: "تشكيل لجنة جديدة" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("اسم اللجنة").fill("لجنة تجربة التشكيل");
  // Keep the shared ordinary-member and supervisor fixtures unchanged for the
  // privacy specs that run later. This fixture is already a committee head, so
  // an additional committee scope proves formation without widening its role.
  await dialog.getByLabel("رئيس اللجنة").selectOption({ label: "رئيس لجنة تجريبي" });
  await dialog
    .getByRole("group", { name: "اعتماد أعمال اللجنة" })
    .getByRole("checkbox", { name: /معتمد تجريبي/ })
    .check();
  await dialog.getByRole("button", { name: "إنشاء اللجنة" }).click();

  await expect(page).toHaveURL(/\/committees\/[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { name: "لجنة تجربة التشكيل" })).toBeVisible();
  await expect(page.getByRole("button", { name: "إدارة التشكيل" })).toBeVisible();

  const committeeId = new URL(page.url()).pathname.split("/").pop();
  await page.goto(`/work?create=task&committee=${committeeId}`);
  const reviewers = await page.getByLabel("المراجع").locator("option").allTextContents();
  expect(reviewers).toEqual([
    "اختر مراجعًا مختلفًا",
    "معتمد تجريبي · معتمد اللجنة",
  ]);
});
