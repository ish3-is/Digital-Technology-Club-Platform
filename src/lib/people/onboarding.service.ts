import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import type { Connection } from "@/lib/work/access";
import {
  allowed,
  currentTermId,
  hasLiveGrant,
  notify,
  peopleId,
  record,
  requiredText,
  text,
  write,
  writeSelf,
} from "./helpers";
import { onboardingStages, thirtyDayChallenge } from "./types";

/**
 * Creates the onboarding plan for a member from the shared stage definition.
 * Steps are always seeded pending: nothing is ever marked done automatically.
 */
export async function createPlan(
  ctx: Identity,
  tx: Connection,
  input: { userId: string; academicTermId: string },
) {
  const [existing] = await tx
    .select()
    .from(s.onboardingPlans)
    .where(
      and(
        eq(s.onboardingPlans.userId, input.userId),
        eq(s.onboardingPlans.academicTermId, input.academicTermId),
      ),
    );
  if (existing) return existing;
  const [plan] = await tx
    .insert(s.onboardingPlans)
    .values({
      id: peopleId(),
      userId: input.userId,
      academicTermId: input.academicTermId,
      createdBy: ctx.user.id,
    })
    .returning();
  const startedAt = new Date();
  for (const stage of onboardingStages)
    await tx.insert(s.onboardingSteps).values({
      id: peopleId(),
      planId: plan.id,
      stepKey: stage.key,
      title: stage.title,
      position: stage.position,
      ownerId: input.userId,
      dueAt: new Date(startedAt.getTime() + stage.offsetDays * 86400000),
    });
  await record(tx, ctx, {
    action: "onboarding.started",
    entityType: "onboarding_plan",
    entityId: plan.id,
    memberId: input.userId,
    metadata: { steps: onboardingStages.length },
  });
  return plan;
}

export async function startOnboarding(
  ctx: Identity,
  input: { userId: string; academicTermId: string },
) {
  return write(ctx, { academicTermId: input.academicTermId, committeeId: null }, "onboarding.manage", (tx) =>
    createPlan(ctx, tx, input),
  );
}

export async function getPlan(ctx: Identity, userId: string, academicTermId?: string) {
  const termId = academicTermId ?? (await currentTermId());
  const [plan] = await db
    .select()
    .from(s.onboardingPlans)
    .where(
      and(
        eq(s.onboardingPlans.userId, userId),
        eq(s.onboardingPlans.academicTermId, termId),
      ),
    );
  if (!plan) throw new HttpError(404, "لا يوجد مسار تأهيل لهذا العضو في الفصل الحالي");
  const steps = await db
    .select()
    .from(s.onboardingSteps)
    .where(eq(s.onboardingSteps.planId, plan.id))
    .orderBy(asc(s.onboardingSteps.createdAt));
  const [mentor] = await db
    .select()
    .from(s.mentorAssignments)
    .where(
      and(
        eq(s.mentorAssignments.menteeId, userId),
        eq(s.mentorAssignments.status, "active"),
      ),
    );
  const completed = steps.filter((x) => x.status === "completed").length;
  const total = steps.length;
  return {
    plan,
    steps,
    mentor: mentor ?? null,
    progress: {
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
      explanation: `${completed} من ${total} مرحلة مكتملة؛ لا تُغلق مرحلة دون تنفيذ مسجّل`,
    },
    challenge: {
      key: thirtyDayChallenge.key,
      name: thirtyDayChallenge.name,
      badgeKey: thirtyDayChallenge.badgeKey,
      steps: thirtyDayChallenge.steps.map((stage) => ({
        key: stage.key,
        title: stage.title,
        completed: steps.find((x) => x.stepKey === stage.key)?.status === "completed",
      })),
      completedSteps: thirtyDayChallenge.steps.filter(
        (stage) => steps.find((x) => x.stepKey === stage.key)?.status === "completed",
      ).length,
      totalSteps: thirtyDayChallenge.steps.length,
    },
  };
}

/**
 * A step closes only with a recorded action: a completion note, or a linked
 * work item or event that justifies it. This is the guard against fake progress.
 */
export async function completeStep(
  ctx: Identity,
  stepId: string,
  input: {
    note: string;
    linkedWorkId?: string | null;
    linkedEventId?: string | null;
  },
) {
  const [step] = await db
    .select()
    .from(s.onboardingSteps)
    .where(eq(s.onboardingSteps.id, stepId));
  if (!step) throw new HttpError(404, "مرحلة التأهيل غير متاحة");
  const [plan] = await db
    .select()
    .from(s.onboardingPlans)
    .where(eq(s.onboardingPlans.id, step.planId));
  if (!plan) throw new HttpError(404, "مسار التأهيل غير متاح");
  const self = plan.userId === ctx.user.id;
  const manages = allowed(ctx, "onboarding.manage", {
    academicTermId: plan.academicTermId,
    committeeId: null,
  });
  if (!self && !manages) throw new HttpError(403, "لا تملك صلاحية إتمام هذه المرحلة");
  const note = requiredText(input.note, 5, 1000, "سبب الإتمام");
  if (!input.linkedWorkId && !input.linkedEventId && !manages)
    throw new HttpError(422, "اربط مهمة أو فعالية موثقة تبرر الإتمام");
  const run = async (tx: Parameters<Parameters<typeof write>[3]>[0]) => {
    const [before] = await tx
      .select()
      .from(s.onboardingSteps)
      .where(eq(s.onboardingSteps.id, stepId))
      .for("update");
    if (before.status === "completed")
      throw new HttpError(409, "المرحلة مكتملة بالفعل");
    if (before.status === "skipped") throw new HttpError(409, "المرحلة متخطاة بقرار");
    const [row] = await tx
      .update(s.onboardingSteps)
      .set({
        status: "completed",
        completedAt: new Date(),
        completionNote: note,
        linkedWorkId: input.linkedWorkId ?? before.linkedWorkId,
        linkedEventId: input.linkedEventId ?? before.linkedEventId,
        completedBy: ctx.user.id,
      })
      .where(eq(s.onboardingSteps.id, stepId))
      .returning();
    const remaining = await tx
      .select()
      .from(s.onboardingSteps)
      .where(and(eq(s.onboardingSteps.planId, plan.id), eq(s.onboardingSteps.status, "pending")));
    if (!remaining.length) {
      await tx
        .update(s.onboardingPlans)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(s.onboardingPlans.id, plan.id));
      const [profile] = await tx
        .select()
        .from(s.memberProfiles)
        .where(eq(s.memberProfiles.userId, plan.userId))
        .for("update");
      if (profile && profile.status === "new")
        await tx
          .update(s.memberProfiles)
          .set({ status: "active", statusReason: "اكتمال مسار التأهيل" })
          .where(eq(s.memberProfiles.userId, plan.userId));
      await record(tx, ctx, {
        action: "onboarding.completed",
        entityType: "onboarding_plan",
        entityId: plan.id,
        memberId: plan.userId,
        metadata: { steps: onboardingStages.length },
      });
      const { grantContribution } = await import("./contribution.service");
      await grantContribution(tx, ctx, plan.userId, "onboarding_completed", plan.id);
      const { evaluateBadges } = await import("./contribution.service");
      await evaluateBadges(tx, ctx, plan.userId);
      await notify(
        tx,
        plan.userId,
        "اكتمل مسار التأهيل",
        "أتممت كل مراحل التأهيل. تحقّق من شاراتك ومسارك.",
      );
    } else
      await record(tx, ctx, {
        action: "onboarding.step_completed",
        entityType: "onboarding_step",
        entityId: stepId,
        memberId: plan.userId,
        metadata: { stepKey: before.stepKey, note },
      });
    return row;
  };
  return manages
    ? write(ctx, { academicTermId: plan.academicTermId, committeeId: null }, "onboarding.manage", run)
    : writeSelf(ctx, { academicTermId: plan.academicTermId, committeeId: null }, run);
}

export async function updateStep(
  ctx: Identity,
  stepId: string,
  input: { ownerId?: string | null; dueAt?: Date | null; status?: "pending" | "in_progress" | "skipped"; note?: string },
) {
  const [step] = await db.select().from(s.onboardingSteps).where(eq(s.onboardingSteps.id, stepId));
  if (!step) throw new HttpError(404, "مرحلة التأهيل غير متاحة");
  const [plan] = await db.select().from(s.onboardingPlans).where(eq(s.onboardingPlans.id, step.planId));
  if (!plan) throw new HttpError(404, "مسار التأهيل غير متاح");
  return write(ctx, { academicTermId: plan.academicTermId, committeeId: null }, "onboarding.manage", async (tx) => {
    const [before] = await tx.select().from(s.onboardingSteps).where(eq(s.onboardingSteps.id, stepId)).for("update");
    if (before.status === "completed")
      throw new HttpError(409, "المرحلة المكتملة لا تعود للخلف دون سجل جديد");
    if (input.status === "skipped" && !input.note)
      throw new HttpError(422, "يلزم سبب لتخطي المرحلة");
    const [row] = await tx
      .update(s.onboardingSteps)
      .set({
        ownerId: input.ownerId ?? undefined,
        dueAt: input.dueAt ?? undefined,
        status: input.status ?? undefined,
        completionNote: input.note ?? undefined,
      })
      .where(eq(s.onboardingSteps.id, stepId))
      .returning();
    await record(tx, ctx, {
      action: "onboarding.step_updated",
      entityType: "onboarding_step",
      entityId: stepId,
      memberId: plan.userId,
      metadata: { from: before.status, to: row.status },
    });
    if (input.ownerId)
      await notify(tx, input.ownerId, "مرحلة تأهيل مسندة إليك", `أُسندت إليك مرحلة: ${before.title}`);
    return row;
  });
}

export async function listPlans(
  ctx: Identity,
  filters: { academicTermId?: string; status?: "in_progress" | "completed" | "cancelled" } = {},
) {
  if (!hasLiveGrant(ctx, "onboarding.view")) return [];
  const termId = filters.academicTermId ?? (await currentTermId().catch(() => null));
  const plans = await db
    .select({
      id: s.onboardingPlans.id,
      userId: s.onboardingPlans.userId,
      name: s.user.name,
      status: s.onboardingPlans.status,
      startedAt: s.onboardingPlans.startedAt,
      completedAt: s.onboardingPlans.completedAt,
    })
    .from(s.onboardingPlans)
    .innerJoin(s.user, eq(s.user.id, s.onboardingPlans.userId))
    .where(
      and(
        termId ? eq(s.onboardingPlans.academicTermId, termId) : undefined,
        filters.status ? eq(s.onboardingPlans.status, filters.status) : undefined,
      ),
    )
    .orderBy(desc(s.onboardingPlans.startedAt));
  if (plans.length) {
    const steps = await db
      .select()
      .from(s.onboardingSteps)
      .where(
        sql`${s.onboardingSteps.planId} IN (${sql.join(plans.map((p) => sql`${p.id}`), sql`, `)})`,
      );
    return plans.map((p) => {
      const mine = steps.filter((x) => x.planId === p.id);
      const completed = mine.filter((x) => x.status === "completed").length;
      return {
        ...p,
        total: mine.length,
        completed,
        percent: mine.length ? Math.round((completed / mine.length) * 100) : 0,
      };
    });
  }
  return [];
}

export async function planSummary(ctx: Identity, userId: string) {
  const termId = await currentTermId().catch(() => null);
  if (!termId) return null;
  return getPlan(ctx, userId, termId).catch(() => null);
}
