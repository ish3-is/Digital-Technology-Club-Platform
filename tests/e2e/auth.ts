import { expect, type Page } from "@playwright/test";
// Exercise the real limiter and honor its cooldown; never relax production policy.
export async function submitLogin(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = page.waitForResponse(r => r.url().endsWith('/api/auth/sign-in/email') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'الدخول إلى المقر' }).click();
    const result = await response;
    if (result.status() !== 429) { expect(result.status()).toBe(200); return; }
    const retry = Number(result.headers()['retry-after']);
    await page.waitForTimeout((Number.isFinite(retry) && retry > 0 ? Math.min(retry, 60) : 60) * 1000 + 1000);
  }
  throw new Error('Sign-in rate limit did not recover');
}
