/**
 * Onboarding funnel progression for the demo dataset.
 *
 * The base seed creates one applicant who converts into a member and stops
 * there, so the funnel shows a single stage and nothing downstream. This adds
 * the minimum additional progression to make the funnel legible, and it does so
 * through the real services — the same work engine, onboarding and attendance
 * paths the application uses — so the derived funnel reflects a genuine
 * lifecycle rather than inserted rows.
 *
 * It reuses existing demo members; no new person is invented. Every step is
 * idempotent: a re-run finds the records and skips them.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import * as s from "../src/db/schema";
import * as access from "../src/lib/work/access";
import * as workEngine from "../src/lib/work/engine";
import * as onboarding from "../src/lib/people/onboarding.service";
import * as events from "../src/lib/events/engine";
import { demoEmail } from "../src/lib/demo/dataset";

const MARKER = "مسار التأهيل التجريبي";

export type FunnelSeedConfig = {
  /** Existing demo member slugs, each already created by the base seed. */
  members: { firstTask: string; thirtyDay: string; firstEvent: string };
  committeeId: string;
  termId: string;
  /** A completed event, so attendance can be recorded against it. */
  eventId: string | null;
  log: (message: string) => void;
};

/**
 * Walks each member to the stage the demo wants to show, in order, so no stage
 * is reached without the ones before it.
 */
export async function seedFunnelProgression(config: FunnelSeedConfig): Promise<void> {
  const leader = await access.actorContext(await leaderId());

  const ladder: { slug: string; stage: "first_task" | "thirty_day" | "first_event"; offset: number }[] = [
    { slug: config.members.firstTask, stage: "first_task", offset: -20 },
    { slug: config.members.thirtyDay, stage: "thirty_day", offset: -38 },
    { slug: config.members.firstEvent, stage: "first_event", offset: -11 },
  ];

  let done = 0;
  for (const step of ladder) {
    if (!step.slug) continue;
    const memberId = await userId(step.slug);
    if (!memberId) continue;

    // The member must have an application, or the funnel cannot count them at
    // any stage. The application is submitted, shortlisted and accepted through
    // the real service, then linked to the existing account.
    await ensureApplication(leader, memberId, step.slug, config);

    // --- first task: created and completed through the work engine --------
    const taskTitle = `${MARKER}: أول مهمة — ${step.slug}`;
    const [existing] = await db
      .select({ id: s.workItems.id })
      .from(s.workItems)
      .where(and(eq(s.workItems.title, taskTitle), eq(s.workItems.createdBy, leader.user.id)));
    let taskId = existing?.id;
    if (!taskId) {
      const created = await workEngine
        .createWork(leader, {
          kind: "task",
          title: taskTitle,
          description: "سجل عرض تجريبي — بيانات غير رسمية.",
          committeeId: config.committeeId,
          termId: config.termId,
          responsibleId: memberId,
          reviewerId: await reviewerId(),
          startAt: new Date(Date.now() + step.offset * 86_400_000).toISOString(),
          dueAt: new Date(Date.now() + (step.offset + 10) * 86_400_000).toISOString(),
        })
        .catch((e) => {
          config.log(`تعذر إنشاء مهمة القمع: ${(e as Error).message}`);
          return null;
        });
      if (created) {
        taskId = created.id;
        // Drive it through the real transition map so the status and the
        // completion date are genuine rather than inserted.
        const running = await workEngine
          .transition(leader, created.id, "in_progress", created.version)
          .catch(() => null);
        // A task completes through reviewer approval, which is the real path.
        const reviewing = running
          ? await workEngine
              .transition(leader, created.id, "review", running.version)
              .catch(() => null)
          : null;
        if (reviewing) await approveAsReviewer(created.id, reviewing.version, config);
      }
    }
    if (!taskId) continue;

    // A task left mid-flight by an interrupted run is resumed through the same
    // review path, so a re-run always reaches a settled state.
    await settleTask(leader, taskId, config);
    done++;

    // A converted profile starts as `new`; the domain activates it only when the
    // onboarding plan completes, so activation is walked last for every member.
    // Members without a task of their own have nothing further to walk.
    if (step.stage === "first_task") continue;

    // --- thirty-day completion: a real onboarding plan --------------------
    if (step.stage === "thirty_day") {
      const plan = await onboarding
        .startOnboarding(leader, { userId: memberId, academicTermId: config.termId })
        .catch(() => null);
      if (!plan) continue;
      const steps = await db
        .select({ id: s.onboardingSteps.id, status: s.onboardingSteps.status })
        .from(s.onboardingSteps)
        .where(eq(s.onboardingSteps.planId, plan.id));
      for (const row of steps) {
        if (row.status === "completed") continue;
        await onboarding
          .completeStep(leader, row.id, {
            note: "إكمال تجريبي لمسار التأهيل",
            linkedWorkId: taskId,
          })
          .catch((e) => config.log(`تعذر إكمال خطوة التأهيل: ${(e as Error).message}`));
      }
      continue;
    }

    // --- first event: attendance marked through the event engine -----------
    if (step.stage === "first_event" && config.eventId) {
      // `eventAttendance` has a composite key, so the lookup filters in memory
      // rather than through a column conjunction drizzle cannot type here.
      const existing = await db
        .select()
        .from(s.eventAttendance)
        .where(eq(s.eventAttendance.eventId, config.eventId))
        .then((rows) => rows.filter((r) => r.participantId === memberId));
      if (existing.length === 0)
        await events
          .recordAttendance(leader, config.eventId, {
            participantId: memberId,
            status: "present",
          })
          .catch((e) => config.log(`تعذر تسجيل الحضور: ${(e as Error).message}`));
    }
  }
  config.log(`قمع التأهيل: ${done} مسارات تجريبية`);
}

/** Resolves a demo slug to its account id via its demo address. */
async function userId(slug: string): Promise<string | null> {
  const [row] = await db
    .select({ id: s.user.id })
    .from(s.user)
    .where(eq(s.user.email, demoEmail(slug)));
  return row?.id ?? null;
}

/**
 * Ensures a demo member has a membership application tied to their account.
 *
 * `createApplication` records a request from a prospective member; the service
 * also links an application to an account when one is converted. Reusing the
 * existing demo accounts avoids inventing new people.
 */
async function ensureApplication(
  ctx: Awaited<ReturnType<typeof access.actorContext>>,
  memberId: string,
  slug: string,
  config: FunnelSeedConfig,
): Promise<void> {
  const [existing] = await db
    .select({ id: s.membershipApplications.id })
    .from(s.membershipApplications)
    .where(eq(s.membershipApplications.convertedUserId, memberId));
  if (existing) return;
  const people = await import("../src/lib/people/applications.service");
  const application = await people
    .createApplication(ctx, {
      fullName: `عضو قمع تجريبي (${slug})`,
      studentId: `demo-funnel-${slug}`,
      email: demoEmail(slug),
      skills: ["تنظيم"],
      interests: ["تقنية"],
      motivation: "سجل عرض تجريبي — بيانات غير رسمية.",
      academicTermId: config.termId,
    })
    .catch(() => null);
  if (!application) return;
  await people.decideApplication(ctx, application.id, "shortlisted", "ملف تجريبي").catch(() => null);
  await people.decideApplication(ctx, application.id, "accepted", "قبول تجريبي").catch(() => null);
  await people.convertToMember(ctx, {
    applicationId: application.id,
    userId: memberId,
    academicTermId: config.termId,
    committeeId: config.committeeId,
    clubRole: "member",
    clubRoleReason: "عضوية عرض تجريبي",
  }).catch(() => null);
}

/**
 * Drives a task to a settled state.
 *
 * Creation and the move to review belong to the owner; the approval belongs to
 * the assigned reviewer, which is exactly the separation the work engine
 * enforces. A task interrupted mid-flight is resumed rather than abandoned.
 */
async function settleTask(
  leader: Awaited<ReturnType<typeof access.actorContext>>,
  taskId: string,
  config: FunnelSeedConfig,
): Promise<void> {
  const [current] = await db
    .select()
    .from(s.workItems)
    .where(eq(s.workItems.id, taskId));
  if (!current || current.status === "completed") return;
  let version = current.version;
  if (current.status === "in_progress") {
    const reviewing = await workEngine
      .transition(leader, taskId, "review", version)
      .catch(() => null);
    if (!reviewing) return;
    version = reviewing.version;
  }
  if (current.status === "review") await approveAsReviewer(taskId, version, config);
}

/** The approval must be made by the reviewer the step was assigned to. */
async function approveAsReviewer(
  taskId: string,
  version: number,
  config: FunnelSeedConfig,
): Promise<void> {
  const reviewerUserId = await reviewerId();
  if (!reviewerUserId) return;
  const reviewer = await access.actorContext(reviewerUserId).catch(() => null);
  if (!reviewer) return;
  await workEngine
    .review(reviewer, taskId, "approved", "اعتماد عرض تجريبي", version)
    .catch((e) => config.log(`تعذر اعتماد المهمة: ${(e as Error).message}`));
}

/** A reviewer distinct from every task owner in the ladder. */
async function reviewerId(): Promise<string | undefined> {
  const [row] = await db
    .select({ id: s.user.id })
    .from(s.user)
    .where(eq(s.user.email, demoEmail("digital-head")));
  return row?.id;
}

/** The club leader, who owns the funnel records for the demo. */
async function leaderId(): Promise<string> {
  const [row] = await db
    .select({ id: s.user.id })
    .from(s.user)
    .where(eq(s.user.email, demoEmail("leader")));
  if (!row) throw new Error("حساب قائد النادي التجريبي غير موجود");
  return row.id;
}