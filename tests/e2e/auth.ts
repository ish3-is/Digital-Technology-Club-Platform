import { expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Per-actor session reuse.
 *
 * The sign-in limiter allows five attempts per minute and the suite signs in
 * for the same handful of actors dozens of times. Each blocked attempt waits
 * out the cooldown, and that wait is where nearly all of the suite's
 * wall-clock time went. Each actor is therefore authenticated once and its
 * session cookie is replayed for the remainder of the run.
 *
 * Production throttling is untouched: `submitLogin` still drives the real form
 * and still honours a 429. This helper only avoids repeating an authentication
 * the limiter has already paid for.
 */

const origin = process.env.CLUB_E2E_ORIGIN ?? "http://localhost:3001";
type SessionCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
};

/**
 * Cached cookies live inside the per-run E2E data directory so the existing
 * teardown removes them with the rest of the run's state, and so they can
 * never be mistaken for — or committed as — a real credential.
 *
 * The directory name is read from the same handoff file the teardown trusts
 * rather than from an environment variable: `PGLITE_DIR` is set for the web
 * server only and is not inherited by the Playwright worker.
 */
function runStateDir(): string {
  const handoff = join(".data", ".e2e-current-dir");
  if (existsSync(handoff)) {
    const name = readFileSync(handoff, "utf8").trim();
    if (name && name === basename(name) && name.startsWith("e2e-playwright-"))
      return join(".data", name, "e2e-auth");
  }
  // Outside a recorded run there is nothing to tie the cache to, so it is not
  // written at all rather than left behind in a shared location.
  return "";
}

const cookieFile = (actor: string) => {
  const dir = runStateDir();
  return dir ? join(dir, `${actor}.json`) : "";
};

async function authenticate(
  request: import("@playwright/test").APIRequestContext,
  actor: string,
): Promise<SessionCookie[]> {
  const credentials = JSON.parse(
    readFileSync(".data/work-e2e-credentials.json", "utf8"),
  ) as Record<string, { email: string; password: string }>;
  const account = credentials[actor];
  if (!account) throw new Error(`Unknown E2E actor: ${actor}`);

  const response = await request.post("/api/auth/sign-in/email", {
    headers: { origin },
    data: { email: account.email, password: account.password },
  });

  // The limiter applies here too. Waiting is correct — the alternative is
  // weakening a production control so the suite can run faster.
  if (response.status() === 429) {
    const retry = Number(response.headers()["retry-after"]);
    const seconds = Number.isFinite(retry) && retry > 0 ? Math.min(retry, 60) : 60;
    await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
    return authenticate(request, actor);
  }

  expect(response.status(), `sign-in for ${actor}`).toBe(200);
  const match = (response.headers()["set-cookie"] ?? "").match(
    /session_token=([^;]+)/,
  );
  if (!match) throw new Error(`No session cookie returned for ${actor}`);
  return [
    {
      name: "better-auth.session_token",
      value: decodeURIComponent(match[1]),
      domain: "localhost",
      path: "/",
    },
  ];
}

/**
 * Restores this actor's session, signing in only when it has not already been
 * authenticated during this run.
 *
 * Restoring a cookie is not the same as the form flow: a freshly created E2E
 * account is offered its onboarding step, and a session that skipped it is in a
 * different application state. The caller is therefore responsible for the
 * same post-login navigation the form path performs, and this only supplies the
 * session.
 */
export async function loginAs(page: Page, actor: string): Promise<void> {
  const file = cookieFile(actor);
  if (file && existsSync(file)) {
    await page.context().addCookies(
      JSON.parse(readFileSync(file, "utf8")) as SessionCookie[],
    );
    // A cached session must never masquerade as a working one.
    if ((await page.request.get("/api/auth/get-session")).ok()) {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: /السلام عليكم/ }),
      ).toBeVisible();
      return;
    }
    await page.context().clearCookies();
  }

  const cookies = await authenticate(page.request, actor);
  await page.context().addCookies(cookies);

  // A newly created E2E account is offered its onboarding step. The session is
  // established but the account is not usable until that step is taken, and a
  // later write against a half-onboarded account conflicts. Doing it here keeps
  // every caller in the same state the login form would have left it in.
  await page.goto("/");
  const start = page.getByRole("button", { name: "لنبدأ رحلتك" });
  if (await start.isVisible()) await start.click();
  await expect(
    page.getByRole("heading", { name: /السلام عليكم/ }),
  ).toBeVisible();
  const dir = runStateDir();
  if (file && dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(cookies));
  }
}

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

/**
 * Retries only a dropped or refused connection.
 *
 * The pooled dev server occasionally resets a socket mid-run. That is a
 * transport fault with no server-side effect, so replaying the same request is
 * safe. An HTTP response is never retried: a 4xx or 5xx is a real outcome and
 * must stay visible to the assertions that depend on it, and no business or
 * state-machine failure is ever retried away.
 */
const TRANSPORT_CODES = ["ECONNRESET", "ECONNREFUSED", "EPIPE"];

/**
 * Node attaches these to `error.code`, but Playwright's APIRequestContext
 * reports a dropped socket only in the message text. Both are inspected, so a
 * pooled-connection reset is retried whether it arrives as either.
 */
function isTransportFailure(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code && TRANSPORT_CODES.includes(code)) return true;
  const message = (error as { message?: string } | null)?.message ?? "";
  return TRANSPORT_CODES.some((marker) => message.includes(marker));
}

export async function withTransportRetry<T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isTransportFailure(error)) throw error;
      // A short, bounded pause is enough for the socket to settle.
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
}

/**
 * A page-scoped HTTP client that retries only dropped connections.
 *
 * Every direct `page.request` call goes through here, so no call site can be
 * left without transport protection by oversight. Status assertions still run
 * on the single response that arrives: an HTTP error is never retried.
 */
export function apiClient(page: Page, headers: Record<string, string> = {}) {
  return {
    get: (path: string) =>
      withTransportRetry(() => page.request.get(path, { headers })),
    post: (path: string, data?: unknown) =>
      withTransportRetry(() =>
        page.request.post(path, { headers, data: data as never }),
      ),
    put: (path: string, data?: unknown) =>
      withTransportRetry(() =>
        page.request.put(path, { headers, data: data as never }),
      ),
    patch: (path: string, data?: unknown) =>
      withTransportRetry(() =>
        page.request.patch(path, { headers, data: data as never }),
      ),
    delete: (path: string) =>
      withTransportRetry(() => page.request.delete(path, { headers })),
  };
}
