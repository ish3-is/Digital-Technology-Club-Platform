import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Dedicated coverage for the sign-in rate limiter.
 *
 * The rest of the suite reuses sessions so it does not pay the limiter's
 * cooldown on every test. That is a harness optimisation and must not become
 * the reason throttling goes unverified, so the limiter is exercised here on
 * its own terms, against the production configuration.
 */

const credentials = JSON.parse(
  readFileSync(".data/work-e2e-credentials.json", "utf8"),
) as Record<string, { email: string; password: string }>;

test("تحديد محاولات الدخول يبقى فعالًا بعد إعادة استخدام الجلسة", async ({
  request,
}) => {
  // A deliberately wrong password: the point is the limiter, not the
  // credentials.
  const account = credentials.member;

  const statuses: number[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await request.post("/api/auth/sign-in/email", {
      headers: { origin: "http://localhost:3001" },
      data: { email: account.email, password: "wrong-password-on-purpose" },
    });
    statuses.push(response.status());
    // Stop once the limiter engages rather than burning the whole budget.
    if (response.status() === 429) break;
  }

  expect(statuses.length, "the limiter never engaged").toBeGreaterThan(1);
  expect(
    statuses.includes(429),
    `expected a 429 among ${statuses.join(",")}`,
  ).toBe(true);
});