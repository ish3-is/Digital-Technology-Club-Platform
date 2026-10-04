import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { loginAs, submitLogin, withTransportRetry } from "./auth";

const person = z.object({ id: z.string(), email: z.email(), password: z.string() });
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
const saved = new Map<Actor, Awaited<ReturnType<BrowserContext["cookies"]>>>();

async function login(page: Page, key: Actor) {
  await page.context().clearCookies();
  // Run-wide cache first: this actor may already be signed in from an
  // earlier spec, and the limiter charges for every fresh sign-in.
  if (!saved.get(key)) {
    try {
      await loginAs(page, key);
      saved.set(key, await page.context().cookies());
      return;
    } catch {
      // Fall through to the interactive form below.
    }
  }
  const cached = saved.get(key);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /السلام عليكم|أهلًا بك في فريق النادي/ }),
    ).toBeVisible();
    return;
  }
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(people[key].email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(people[key].password);
  await submitLogin(page);
  await expect(
    page.getByRole("heading", { name: /السلام عليكم|أهلًا بك في فريق النادي/ }),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "لنبدأ رحلتك" }).isVisible()) {
    await page.getByRole("button", { name: "لنبدأ رحلتك" }).click();
    await expect(page.getByRole("heading", { name: /السلام عليكم/ })).toBeVisible();
  }
  saved.set(key, await page.context().cookies());
}

/**
 * A pooled request socket can be recycled by the dev server between calls, which
 * surfaces as a connection-level reset rather than an application error. Retrying
 * once on exactly that transport failure keeps the scenario testing the product
 * instead of the socket; an HTTP response of any status is never retried.
 */

async function get(page: Page, path: string): Promise<any> {
  const response = await withTransportRetry(() => page.request.get(`/api/people/${path}`));
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  return response.json();
}

async function post(page: Page, path: string, data: unknown, status = 200) {
  const response = await withTransportRetry(() =>
    page.request.post(`/api/people/${path}`, {
      headers,
      data,
    }),
  );
  expect(response.status(), `${path} -> ${response.status()}`).toBe(status);
  return response.json();
}

const uniqueSuffix = () => Math.floor(Math.random() * 100000);

test("SCENARIO A — الطلب يُراجع ويُقبل ويتحوّل إلى عضو في دليل الناس", async ({
  page,
}) => {
  await login(page, "member");
  const studentId = `2026${uniqueSuffix()}`;
  const created = await post(
    page,
    "applications",
    {
      fullName: "مقدم طلب للاختبار",
      studentId,
      major: "علوم حاسب",
      email: `applicant${uniqueSuffix()}@example.test`,
      skills: ["برمجة"],
      interests: ["تقنية"],
      motivation: "أريد المساهمة في النادي",
      academicTermId: "test-term",
    },
    201,
  );
  expect(created.status).toBe("submitted");

  // The decision history starts with the applicant's own submission.
  const asApplicant = await get(page, `application/${created.id}`);
  expect(asApplicant.row.status).toBe("submitted");
  expect(asApplicant.reviews).toHaveLength(1);

  await login(page, "approver");
  await post(page, `applications/${created.id}/reviewer`, { reviewerId: people.head.id });
  await post(page, `applications/${created.id}/decide`, {
    decision: "shortlisted",
    reason: "الملف مناسب لتركيز اللجنة",
  });
  await post(page, `applications/${created.id}/decide`, {
    decision: "accepted",
    reason: "اجتاز التقييم بعد المقابلة",
  });
  const reviewed = await get(page, `application/${created.id}`);
  expect(reviewed.row.status).toBe("accepted");
  expect(reviewed.reviews.map((r: any) => r.newStatus)).toEqual([
    "accepted",
    "shortlisted",
    "under_review",
    "submitted",
  ]);

  // Conversion creates the profile, the placement, the role and the plan.
  const converted = await post(page, `applications/${created.id}/convert`, {
    applicationId: created.id,
    userId: people.member.id,
    academicTermId: "test-term",
    committeeId: "test-media",
    clubRole: "member",
    clubRoleReason: "عضوية معتمدة بعد القبول",
  });
  expect(converted.status).toBe("converted");

  const detail = await get(page, `member/${people.member.id}`);
  expect(detail.row.status).toBe("new");
  expect(detail.row.studentId).toBe(studentId);
  expect(detail.placements.some((p: any) => p.committeeId === "test-media")).toBe(true);
  expect(detail.roles[0].clubRole).toBe("member");
  // The plan starts with every stage pending; nothing is pre-completed.
  expect(detail.plan.steps).toHaveLength(11);
  expect(detail.plan.steps.every((s: any) => s.status === "pending")).toBe(true);

  // The member now appears in the directory under their account identity.
  await page.goto("/people?tab=members");
  await expect(page.getByRole("heading", { name: "الأعضاء" })).toBeVisible();
  // The directory is scoped and keyed on the account, not the application name.
  await expect(page.getByRole("heading", { name: "مقدم طلب للاختبار" })).toHaveCount(0);
  const listed = await get(page, "lists");
  const row = listed.members.find((m: any) => m.userId === people.member.id);
  expect(row).toBeTruthy();
  expect(row.status).toBe("new");
  // The scoped card renders the member, reachable from the directory.
  await page.goto(`/people?tab=members&member=${people.member.id}`);
  await expect(page.getByRole("heading", { name: "الهوية والمسار" })).toBeVisible();
});

// This scenario drives all eleven onboarding steps through the UI, and each
// step reloads the page so the panel reflects server state. In the dev server
// that is roughly 30s per step, which overruns the suite-wide 240s budget.
// The assertions are unchanged; only the wall-clock allowance grows.
test("SCENARIO B — التأهيل والإرشاد وشارة عضو منطلق", async ({ page }) => {

  await login(page, "approver");
  // Make sure a plan exists for the member.
  await post(
    page,
    "onboarding/start",
    {
      userId: people.member.id,
      academicTermId: "test-term",
    },
    201,
  );
  const plan = await get(page, `plan?member=${people.member.id}`);
  expect(plan.steps).toHaveLength(11);

  // A mentor is assigned through the API surface the UI uses.
  // The approver is onboarded; the seeded committee head is intentionally not.
  const mentorship = await post(
    page,
    "mentoring/assign",
    {
      mentorId: people.approver.id,
      menteeId: people.member.id,
      academicTermId: "test-term",
      notes: "متابعة أول ثلاثين يومًا",
    },
    201,
  );
  expect(mentorship.status).toBe("active");

  // A member cannot mentor themselves.
  await post(
    page,
    "mentoring/assign",
    { mentorId: people.member.id, menteeId: people.member.id, academicTermId: "test-term" },
    422,
  );

  // Drive the pipeline through the visible People UI.
  await page.goto(`/people?tab=onboarding&member=${people.member.id}`);
  await expect(page.getByRole("heading", { name: "التأهيل" })).toBeVisible();

  // Drive the pipeline through the visible People UI, one recorded step at a time.
  //
  // Each step used to cost an API read, a full page navigation, a submit and a
  // poll for the button to disappear — roughly four round-trips per step, which
  // is what pushed this scenario past its budget. Completing a step already
  // re-renders the panel with the next pending step, so the loop can work from
  // the DOM and wait on the step's own response instead.
  for (let guard = 0; guard < 20; guard += 1) {
    const form = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: /^إتمام: / }) })
      .first();
    if ((await form.count()) === 0) break;

    const step = (await form.getByRole("button", { name: /^إتمام: / }).textContent())!;
    // Anchor on this step specifically: a positional locator would re-resolve
    // onto the next step's form the moment this one disappears.
    const completed = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: step }) });
    await form.getByLabel("سبب الإتمام").fill("إجراء موثق للاختبار الآلي");

    // Wait on the request that records the step rather than a fixed delay.
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/people/steps/") &&
          r.request().method() === "POST",
      ),
      completed.getByRole("button", { name: step }).click(),
    ]);
    expect(response.status(), `complete step ${step}`).toBe(200);

    // The completed step's form must be gone before the next one is read.
    await expect(completed).toHaveCount(0);
  }

  const done = await get(page, `plan?member=${people.member.id}`);
  expect(done.plan.status).toBe("completed");
  expect(done.progress.percent).toBe(100);
  expect(done.challenge.completedSteps).toBe(done.challenge.totalSteps);

  // Finishing the pipeline earns the launching badge from its own rule.
  const badges = await get(page, `xp?member=${people.member.id}`);
  expect(badges).toBeTruthy();
  const detail = await get(page, `member/${people.member.id}`);
  expect(detail.row.status).toBe("active");
  expect(detail.badges.map((b: any) => b.badgeKey)).toContain("launching_member");

  // XP and impact are source-backed, never invented.
  const totals = detail.totals;
  expect(totals.xp).toBeGreaterThan(0);
  expect(totals.impact).toBeGreaterThan(0);
  expect(totals.level.name).toBeTruthy();
});

test("SCENARIO C — ساعات تطوعية تُعتمد من مستقل وتُحدّث جواز المساهمة", async ({
  page,
}) => {
  await login(page, "member");
  const entry = await post(
    page,
    "hours",
    {
      memberId: people.member.id,
      sourceType: "workshop",
      activityTitle: "ورشة تنظيم الحضور",
      date: new Date("2026-09-05").toISOString(),
      hours: 4,
      notes: "أربع ساعات موثقة",
    },
    201,
  );
  expect(entry.status).toBe("pending");

  // Self-approval is impossible even with direct API access.
  await post(
    page,
    `hours/${entry.id}/decide`,
    { decision: "approved", reason: "اعتماد ذاتي" },
    403,
  );

  const before = await get(page, `passport/${people.member.id}`);
  await login(page, "supervisor");
  const decision = await post(page, `hours/${entry.id}/decide`, {
    decision: "approved",
    reason: "مطابق لسجل الورشة",
  });
  expect(decision.row.status).toBe("approved");
  expect(decision.contribution.xp).toBe(20);
  expect(decision.contribution.impact).toBe(20);

  const after = await get(page, `passport/${people.member.id}`);
  expect(after.hours.approved).toBe(before.hours.approved + 4);
  expect(after.totals.xp).toBe(before.totals.xp + 20);
  expect(after.totals.impact).toBe(before.totals.impact + 20);

  // Every transaction carries a source, a reason and the rule that produced it.
  const ledger = await get(page, `xp?member=${people.member.id}`);
  const hoursEntry = ledger.transactions.find(
    (t: any) => t.sourceType === "volunteer_hours" && t.sourceId === entry.id,
  );
  expect(hoursEntry).toBeTruthy();
  expect(hoursEntry.reason).toContain("ورشة تنظيم الحضور");
  expect(hoursEntry.ruleKey).toBe("volunteer_hours");
  expect(hoursEntry.points).toBe(20);
});

test("SCENARIO D — الخصوصية: العضو يرى نفسه، ولجنة أخرى لا تراه", async ({
  page,
}) => {
  await login(page, "member");
  // A member reads their own record and their own contact number.
  const own = await get(page, `member/${people.member.id}`);
  expect(own.view.private).toBe(true);
  expect(own.view.profile.phone).toBeTruthy();

  // A member cannot read somebody else's private fields through the API.
  const other = await page.request.get(`/api/people/member/${people.head.id}`);
  if (other.status() === 200) {
    const body = await other.json();
    // Visible through the shared committee, but the phone stays withheld.
    expect(body.view.profile.phone).toBeNull();
  }

  // The committee head sees its scoped members; the list never leaks contact data.
  await login(page, "head");
  const scoped = await get(page, "lists");
  expect(scoped.members.length).toBeGreaterThan(0);
  for (const row of scoped.members) {
    expect(row.phone).toBeNull();
    expect(row.managementNotes).toBeNull();
    expect(row.statusReason).toBeNull();
  }

  // The supervisor is not a member manager: no edit, no placement, no point edits.
  await login(page, "supervisor");
  const options = await get(page, "options");
  expect(options.permissions.memberView).toBe(true);
  expect(options.permissions.memberUpdate).toBe(false);
  expect(options.permissions.memberArchive).toBe(false);
  expect(options.permissions.placementManage).toBe(false);
  expect(options.permissions.xpAdjust).toBe(false);
  expect(options.permissions.impactAdjust).toBe(false);

  await post(
    page,
    `member/${people.member.id}/status`,
    { status: "archived", reason: "محاولة أرشفة بلا صلاحية" },
    403,
  );
  await post(
    page,
    "points/adjust",
    {
      memberId: people.member.id,
      kind: "impact",
      points: 999,
      reason: "تعديل بلا صلاحية",
      academicTermId: "test-term",
    },
    403,
  );
  await post(
    page,
    "placement/assign",
    {
      userId: people.member.id,
      committeeId: "test-media",
      academicTermId: "test-term",
      assignmentType: "permanent",
    },
    403,
  );

  // Private notes are not exposed in the directory projection.
  await page.goto("/people?tab=members");
  await expect(page.getByText("0500000001")).toHaveCount(0);
});

test("SCENARIO E — النقل والتسليم يحفظان سجل اللجان", async ({ page }) => {
  await login(page, "member");
  const request = await post(
    page,
    "transfers",
    {
      userId: people.member.id,
      toCommitteeId: "test-private",
      reason: "أريد العمل في اللجنة الأخرى",
      notes: "طلب تجريبي",
    },
    201,
  );
  expect(request.status).toBe("requested");
  expect(request.fromCommitteeId).toBe("test-media");

  // A member cannot approve their own transfer.
  await post(
    page,
    `transfers/${request.id}/decide`,
    { decision: "approved", notes: "اعتماد ذاتي" },
    403,
  );

  await login(page, "supervisor");
  const decided = await post(page, `transfers/${request.id}/decide`, {
    decision: "approved",
    notes: "مقبول بعد مراجعة الاحتياج",
  });
  expect(decided.status).toBe("approved");

  // History is preserved: the old committee stays on record, closed.
  await login(page, "approver");
  const detail = await get(page, `member/${people.member.id}`);
  const old = detail.placements.find((p: any) => p.committeeId === "test-media");
  const next = detail.placements.find((p: any) => p.committeeId === "test-private");
  expect(old.endAt).not.toBeNull();
  expect(next.endAt).toBeNull();
  expect(detail.placements.length).toBeGreaterThanOrEqual(2);

  // An approved transfer opens a handover that must be documented to close.
  const handover = detail.handovers.find(
    (h: any) => h.kind === "committee_transfer" && h.status === "pending",
  );
  expect(handover).toBeTruthy();
  await post(
    page,
    `handovers/${handover.id}/update`,
    { complete: true },
    422,
  );
  const closed = await post(page, `handovers/${handover.id}/update`, {
    responsibilities: "ملفات الحضور ولوحة المتابعة",
    complete: true,
  });
  expect(closed.status).toBe("completed");

  // The role history and the timeline both recorded the transition.
  expect(detail.roles.length).toBeGreaterThan(0);
  // The transfer is on the timeline under its own action, not as a placement edit.
  expect(detail.timeline.some((t: any) => t.action === "transfer.approved")).toBe(true);
  expect(detail.timeline.some((t: any) => t.action === "placement.changed")).toBe(true);
});
