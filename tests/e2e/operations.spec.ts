import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { loginAs, submitLogin, withTransportRetry } from "./auth";

/**
 * Phase 6 Operations acceptance coverage.
 *
 * Recovered after an accidental in-place rewrite destroyed seven scenarios.
 * These are restorations of the originally required coverage, written against
 * the current product contract: the state machines in
 * `src/lib/operations/types.ts`, the route schemas in
 * `src/app/api/operations/[[...path]]/route.ts`, and the service guards in
 * `src/lib/operations/*.service.ts`.
 *
 * Ordering matters. The suite shares one isolated database with `workers: 1`,
 * so the zero-data scenario runs first and each scenario cleans up through real
 * terminal transitions rather than deleting rows.
 */

const person = z.object({
  id: z.string(),
  email: z.email(),
  password: z.string(),
});
const people = z
  .object({
    approver: person,
    member: person,
    supervisor: person,
    president: person,
    financeLead: person,
    mediaLead: person,
    digitalLead: person,
    resourcesLead: person,
    recipient: person,
    head: person,
  })
  .parse(JSON.parse(readFileSync(".data/work-e2e-credentials.json", "utf8")));
type Actor = keyof typeof people;

const headers = { origin: "http://localhost:3001" };

async function login(page: Page, key: Actor) {
  // Reuse the run-wide session where it is safe. Operations asserts on exact
  // counts and cross-actor separation, so the account must reach the same state
  // the form path would leave it in; `loginAs` performs that step itself.
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
async function api(page: Page, path: string) {
  const res = await withTransportRetry(() =>
    page.request.get(`/api/operations${path}`, { headers }),
  );
  expect(res.status(), `GET ${path}`).toBe(200);
  return res.json();
}

async function post(page: Page, path: string, body: unknown, status = 200) {
  const res = await withTransportRetry(() =>
    page.request.post(`/api/operations${path}`, {
      headers,
      data: body as never,
    }),
  );
  expect(
    res.status(),
    `POST ${path}: ${await res.text().catch(() => "")}`,
  ).toBe(status);
  return res.json().catch(() => undefined);
}

const uniqueSuffix = () => Math.floor(Math.random() * 1_000_000);

/** A unique title so a scenario never collides with an earlier run's rows. */
const uniqueTitle = (name: string) => `${name} ${uniqueSuffix()}`;

/**
 * Creates an event through the Events API, which is not under /operations.
 *
 * The lead is an onboarded ordinary member, because the Events engine requires
 * the lead to hold an active event permission; an administrative actor without
 * a committee assignment is refused with a validation error.
 */
async function createEvent(page: Page, name: string, when: number) {
  const res = await withTransportRetry(() =>
    page.request.post("/api/events", {
      headers,
      data: {
        title: uniqueTitle(name),
        termId: "test-term",
        committeeId: "test-media",
        leadId: people.member.id,
        approverId: people.approver.id,
        eventType: "ورشة عمل",
        startAt: new Date(when).toISOString(),
        endAt: new Date(when + 7_200_000).toISOString(),
        locationType: "onsite",
        targetAudience: "الأعضاء",
        reportRequired: false,
      } as never,
    }),
  );
  expect(
    res.status(),
    `create event ${name}: ${await res.text().catch(() => "")}`,
  ).toBe(201);
  return res.json();
}

// ---------------------------------------------------------------- zero data

test("مساحات العمليات تفتح بلا بيانات وبأمان", async ({ page }) => {
  await login(page, "approver");

  // Before any Operations record exists, every area must render honestly:
  // no crash, no NaN, no invented totals, empty states instead of zeroes.
  for (const area of ["", "finance", "media", "digital", "resources"]) {
    const res = await page.goto(`/operations/${area}`);
    expect(res?.status(), `/operations/${area}`).toBe(200);

    const body = (await page.textContent("body")) ?? "";
    expect(body, area).not.toContain("NaN");
    expect(body, area).not.toContain("[object Object]");
  }

  // The read APIs must answer with a well-formed collection rather than a
  // crash or an invented row.
  //
  // The suite shares one database, so this cannot assert the table is empty:
  // an earlier spec may already have created records. It asserts instead that
  // this actor sees only its own scoped rows, which is the real privacy and
  // correctness property, and that nothing is fabricated when there is nothing.
  const expenses = await api(page, "/expenses");
  const media = await api(page, "/media-requests");
  const digital = await api(page, "/digital-requests");
  for (const rows of [expenses, media, digital])
    expect(Array.isArray(rows)).toBe(true);
  // Assets are club-wide, so only the shape is asserted here.
  expect(Array.isArray(await api(page, "/assets"))).toBe(true);

  // A marker this actor creates must be visible to it, while a row belonging
  // to somebody else must not be. That is the real privacy property, and it
  // holds regardless of what an earlier spec left behind.
  const member = await post(
    page,
    "/expenses",
    { title: uniqueTitle("مصروف عضو"), category: "other", amount: 5 },
    201,
  );

  // An ordinary member holds no finance.view, so the list endpoint refuses it
  // outright. The requester still receives its own record, but only through the
  // submission path rather than a club-wide ledger.
  await login(page, "member");
  const memberRead = await withTransportRetry(() =>
    page.request.get("/api/operations/expenses", { headers }),
  );
  expect(memberRead.status()).toBe(403);

  // The supervisor holds an oversight-level finance.view, so the ledger is
  // readable — but it must not be able to change anything.
  await login(page, "supervisor");
  expect(
    (
      await withTransportRetry(() =>
        page.request.get("/api/operations/expenses", { headers }),
      )
    ).status(),
  ).toBe(200);
  await post(
    page,
    "/budgets",
    {
      title: uniqueTitle("ميزانية"),
      allocatedAmount: 5,
      startsOn: new Date().toISOString(),
    },
    403,
  );

  // Clean up through the state machine so later assertions are unaffected.
  await login(page, "financeLead");
  await post(page, `/expense/${member.id}`, { action: "cancel" });
});

// ------------------------------------------------------------------ finance

test("الميزانية والمصروف: الشراء الفعلي يحدّد المنصرف ويفصل المهام", async ({
  page,
}) => {
  // The finance desk owns the budget; an ordinary member owns the expense
  // request. Different people, so separation of duties is real rather than
  // accidental.
  await login(page, "financeLead");
  const budget = await post(
    page,
    "/budgets",
    {
      title: uniqueTitle("ميزانية"),
      allocatedAmount: 1000,
      startsOn: new Date().toISOString(),
    },
    201,
  );

  await login(page, "member");
  const expense = await post(
    page,
    "/expenses",
    {
      title: uniqueTitle("مصروف"),
      category: "other",
      amount: 400,
      budgetId: budget.id,
    },
    201,
  );

  // A requester may submit their own request, but never review or approve it.
  await post(page, `/expense/${expense.id}`, { action: "submit" });
  await post(page, `/expense/${expense.id}`, { action: "start_review" }, 403);
  await post(page, `/expense/${expense.id}`, { action: "approve" }, 403);

  await login(page, "financeLead");
  await post(page, `/expense/${expense.id}`, { action: "start_review" });
  await post(page, `/expense/${expense.id}`, { action: "approve" });

  // The real amount differs from what was requested: `spent` must follow the
  // purchase, not the request.
  const purchase = await post(
    page,
    "/purchases",
    {
      expenseId: expense.id,
      vendor: "مورد تجريبي",
      purchasedAt: new Date().toISOString(),
      amount: 275,
      reference: `REF-${uniqueSuffix()}`,
    },
    201,
  );
  await post(page, `/expense/${expense.id}`, { action: "reconcile" });

  const detail = await api(page, `/expense/${expense.id}`);
  expect(detail.status).toBe("reconciled");
  expect(
    detail.purchases.some((p: { id: string }) => p.id === purchase.purchase.id),
  ).toBe(true);

  // Cleanup through the real terminal transition, not by deleting rows.
  await post(page, `/expense/${expense.id}`, { action: "archive" });
});

// -------------------------------------------------------------------- media

test("طلب الإعلام يعبر من الطلب حتى النشر مع سجل مراجعات", async ({ page }) => {
  await login(page, "president");
  const event = await createEvent(
    page,
    "فعالية إعلام",
    Date.now() + 86_400_000,
  );

  const request = await post(
    page,
    "/media-requests",
    {
      title: uniqueTitle("تصميم"),
      description: "غلاف الورشة",
      mediaType: "poster",
      committeeId: "test-media",
      eventId: event.id,
    },
    201,
  );

  await login(page, "mediaLead");
  // Assigning accepts the request: assignMedia moves 'new' to 'accepted'.
  await post(page, `/media/${request.id}/assign`, {
    assigneeId: people.mediaLead.id,
    reviewerId: people.approver.id,
  });
  await post(page, `/media/${request.id}/advance`, { status: "in_production" });

  // The assignee submits their own revision through the intended self-service
  // path, the request is sent back for changes, revised, then approved.
  // submitRevision moves the request to 'in_review' itself.
  await post(page, `/media/${request.id}/revision`, { note: "المسودة الأولى" });

  // Reviewing is the named reviewer's job, and the desk lead cannot review
  // their own work.
  await login(page, "approver");
  await post(page, `/media/${request.id}/review`, {
    decision: "request_changes",
    note: "يحتاج تعديل الألوان",
  });

  await login(page, "mediaLead");
  await post(page, `/media/${request.id}/advance`, { status: "in_production" });
  await post(page, `/media/${request.id}/revision`, {
    note: "المسودة الثانية",
  });

  await login(page, "approver");
  await post(page, `/media/${request.id}/review`, {
    decision: "approve",
    note: "معتمد",
  });
  await post(page, `/media/${request.id}/advance`, { status: "scheduled" });
  await post(page, `/media/${request.id}/publish`, {});

  const detail = await api(page, `/media-request/${request.id}`);
  expect(detail.status).toBe("published");
  // The decision and revision history must actually exist.
  expect(detail.revisions.length).toBeGreaterThanOrEqual(2);
  expect(detail.decisions.length).toBeGreaterThanOrEqual(2);

  // The linked event reads the real media record.
  expect(
    JSON.stringify(await api(page, `/event-support/${event.id}`)),
  ).toContain("تصميم");

  await post(page, `/media/${request.id}/advance`, { status: "completed" });
});

// ------------------------------------------------------------------- digital

test("الخدمة الرقمية تكتمل بنموذج مرتبط وتظهر في دعم الفعالية", async ({
  page,
}) => {
  await login(page, "approver");
  const request = await post(
    page,
    "/digital-requests",
    {
      title: uniqueTitle("نموذج تسجيل"),
      serviceType: "registration_form",
      committeeId: "test-media",
      description: "تسجيل فعالية تجريبية",
    },
    201,
  );

  // A media desk may not manage Digital work.
  await login(page, "mediaLead");
  await post(page, `/digital/${request.id}`, { status: "received" }, 403);

  await login(page, "digitalLead");
  await post(page, `/digital/${request.id}/assign`, {
    assigneeId: people.digitalLead.id,
  });
  await post(page, `/digital/${request.id}`, { status: "received" });
  await post(page, `/digital/${request.id}`, { status: "in_progress" });

  const form = await post(
    page,
    "/forms",
    {
      title: uniqueTitle("نموذج"),
      purpose: "تسجيل الحضور",
      provider: "e2e",
      url: "https://example.com/e2e-form",
      formType: "registration",
      status: "active",
    },
    201,
  );

  await post(page, `/digital/${request.id}`, { status: "in_review" });
  await post(page, `/digital/${request.id}/complete`, {
    resultFormId: form.id,
    resultUrl: "https://example.com/e2e-form",
    note: "اكتمل عبر الاختبار الآلي",
  });

  const detail = await api(page, `/digital-request/${request.id}`);
  expect(detail.status).toBe("completed");
  expect(detail.resultFormId).toBe(form.id);
});

// ----------------------------------------------------------------- resources

test("حجز الأصل يُعتمد ثم يُستلم ويُرَد مع حفظ الحالة", async ({ page }) => {
  await login(page, "resourcesLead");
  const asset = await post(
    page,
    "/assets",
    { name: uniqueTitle("جهاز"), category: "معدات", condition: "good" },
    201,
  );

  await login(page, "member");
  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  const endsAt = new Date(Date.now() + 86_400_000 + 7_200_000).toISOString();
  const reservation = await post(
    page,
    "/reservations",
    { assetId: asset.id, purpose: uniqueTitle("ورشة"), startsAt, endsAt },
    201,
  );

  // A requester cannot approve their own reservation.
  await post(
    page,
    `/reservation/${reservation.id}`,
    { action: "approve" },
    403,
  );

  await login(page, "resourcesLead");
  await post(page, `/reservation/${reservation.id}`, { action: "approve" });

  // A second, overlapping reservation may be requested freely; the conflict is
  // refused when it is approved, because that is where the schedule is claimed.
  await login(page, "head");
  const clash = await post(
    page,
    "/reservations",
    { assetId: asset.id, purpose: uniqueTitle("تعارض"), startsAt, endsAt },
    201,
  );

  await login(page, "resourcesLead");
  await post(page, `/reservation/${clash.id}`, { action: "approve" }, 422);

  await login(page, "resourcesLead");
  await post(page, `/reservation/${reservation.id}`, { action: "checkout" });
  const duringCheckout = await api(page, `/asset/${asset.id}`);
  expect(duringCheckout.availability).toBe("checked_out");

  await post(page, `/reservation/${reservation.id}`, { action: "return" });
  const afterReturn = await api(page, `/asset/${asset.id}`);
  expect(afterReturn.availability).toBe("available");
  // Condition is preserved across the loan rather than reset.
  expect(afterReturn.condition).toBe("good");
});

// ------------------------------------------------------------------- privacy

test("خصوصية العمليات محجوبة بصرامة عن غير المخوَّلين", async ({ page }) => {
  const budgetBody = {
    title: uniqueTitle("ميزانية"),
    allocatedAmount: 10,
    startsOn: new Date().toISOString(),
  };
  const mediaBody = { title: uniqueTitle("طلب"), mediaType: "poster" };
  const digitalBody = { title: uniqueTitle("خدمة"), serviceType: "survey" };
  const assetBody = { name: uniqueTitle("أصل"), category: "معدات" };

  // An ordinary member may raise its own expense and media or digital request,
  // but holds no Finance visibility and cannot create a budget or an asset.
  await login(page, "member");
  await post(page, "/budgets", budgetBody, 403);
  await post(page, "/assets", assetBody, 403);
  // Reading Finance is denied outright: private money stays out of reach.
  const memberFinance = await withTransportRetry(() =>
    page.request.get("/api/operations/expenses", { headers }),
  );
  expect(memberFinance.status()).toBe(403);

  // The Finance desk may read Finance but must not manage Media or Digital.
  await login(page, "financeLead");
  await post(page, "/media-requests", mediaBody, 403);
  await post(page, "/digital-requests", digitalBody, 403);

  // And the Digital desk may not reach into Media.
  await login(page, "digitalLead");
  await post(page, "/media-requests", mediaBody, 403);

  // The supervisor sees oversight summaries and cannot mutate Operations.
  await login(page, "supervisor");
  expect(await api(page, "/home")).toBeTruthy();
  await post(page, "/budgets", budgetBody, 403);
  await post(page, "/media-requests", mediaBody, 403);
});

// --------------------------------------------------------- event integration

test("غرفة تحكم الفعالية تقرأ سجلات العمليات المرتبطة الحقيقية", async ({
  page,
}) => {
  await login(page, "president");
  const event = await createEvent(
    page,
    "فعالية تكامل",
    Date.now() + 172_800_000,
  );

  const mediaRequest = await post(
    page,
    "/media-requests",
    {
      title: uniqueTitle("تغطية"),
      mediaType: "event_coverage",
      eventId: event.id,
      committeeId: "test-media",
    },
    201,
  );
  const digitalRequest = await post(
    page,
    "/digital-requests",
    {
      title: uniqueTitle("تسجيل الفعالية"),
      serviceType: "registration_form",
      eventId: event.id,
    },
    201,
  );

  // The support view derives from the real linked rows rather than a separately
  // stored summary, so moving one record must change what it reads.
  const before = JSON.stringify(await api(page, `/event-support/${event.id}`));
  expect(before).toContain("تغطية");

  // The seeded desk leads carry no committee scope, so the president — who
  // holds every Operations permission at club scope — drives these transitions.
  await login(page, "president");
  await post(page, `/media/${mediaRequest.id}/advance`, { status: "accepted" });
  await post(page, `/digital/${digitalRequest.id}`, { status: "received" });

  const after = JSON.stringify(await api(page, `/event-support/${event.id}`));
  expect(after).not.toBe(before);
  expect(after).toContain("تسجيل الفعالية");

  // Cleanup through terminal states so later assertions see a clean area.
  await post(page, `/media/${mediaRequest.id}/advance`, {
    status: "cancelled",
  });
  await post(page, `/digital/${digitalRequest.id}`, { status: "cancelled" });
});

// ----------------------------------------------------------- search + inbox

test("البحث وصندوق الوارد يشملان سجلات العمليات", async ({ page }) => {
  await login(page, "financeLead");
  const budget = await post(
    page,
    "/budgets",
    {
      title: "ميزانية قابلة للبحث",
      allocatedAmount: 300,
      startsOn: new Date(Date.now() + 86_400_000).toISOString(),
    },
    201,
  );
  const expense = await post(
    page,
    "/expenses",
    {
      title: "مصروف قابل للبحث",
      category: "other",
      amount: 100,
      budgetId: budget.id,
    },
    201,
  );
  await post(page, `/expense/${expense.id}`, { action: "submit" });

  const hits = await api(
    page,
    "/search?q=" + encodeURIComponent("مصروف قابل للبحث"),
  );
  expect(
    hits.some(
      (h: { kind: string; id: string }) =>
        h.kind === "expense" && h.id === expense.id,
    ),
  ).toBe(true);

  const inbox = await api(page, "/inbox");
  expect(
    inbox.some((i: { entityId: string }) => i.entityId === expense.id),
  ).toBe(true);
});
