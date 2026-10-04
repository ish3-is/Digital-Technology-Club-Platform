import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import type { Connection } from "@/lib/work/access";
import {
  currentTermId,
  notify,
  peopleId,
  record,
  requiredText,
  visibleMemberIds,
  write,
} from "./helpers";
import { xpLevelFor } from "./types";

export type Metric = typeof s.contributionRules.$inferSelect["metric"];

/**
 * Seeds badge and contribution rule definitions. Both are configuration, not UI
 * logic: the challenge and the level ladder both read from these rows.
 */
export async function seedPeopleConfiguration() {
  const badges: (typeof s.badgeDefinitions.$inferInsert)[] = [
    { key: "finisher", name: "منجز", description: "أتم عددًا من المهام المسندة", icon: "check", rule: { type: "completed_tasks", threshold: 10, unit: "مهمة" } },
    { key: "initiator", name: "مبادر", description: "أطلق مبادرة موثقة داخل النادي", icon: "sparkles", rule: { type: "initiatives_owned", threshold: 1, unit: "مبادرة" } },
    { key: "team_leader", name: "قائد فريق", description: "قاد فعالية أو اجتماعًا", icon: "flag", rule: { type: "event_organized", threshold: 1, unit: "فعالية" } },
    { key: "impact_maker", name: "صانع أثر", description: "ساهم بساعات تطوعية معتمدة", icon: "target", rule: { type: "volunteer_hours", threshold: 20, unit: "ساعة" } },
    { key: "organization_star", name: "نجم التنظيم", description: "حضر عددًا من الفعاليات", icon: "calendar", rule: { type: "event_participation", threshold: 5, unit: "فعالية" } },
    { key: "media_star", name: "نجم الإعلام", description: "شارك في التغطية الإعلامية", icon: "camera", rule: { type: "event_participation", threshold: 3, unit: "فعالية" } },
    { key: "tech_star", name: "نجم التقنية", description: "أكمل عددًا من أعمال التقنية", icon: "cpu", rule: { type: "completed_tasks", threshold: 20, unit: "مهمة" } },
    { key: "launching_member", name: "عضو منطلق 🚀", description: "أتم تحدي أول ثلاثين يومًا", icon: "rocket", rule: { type: "onboarding_completed", threshold: 1, unit: "مسار" } },
  ];
  for (const badge of badges)
    await db.insert(s.badgeDefinitions).values(badge).onConflictDoNothing();
  const rules: (typeof s.contributionRules.$inferInsert)[] = [
    { key: "task_completion", name: "إتمام مهمة", description: "نقاط عند إتمام مهمة مسندة", metric: "completed_tasks", threshold: 1, xpPoints: 10, impactPoints: 2 },
    { key: "event_participation", name: "مشاركة فعالية", description: "نقاط عند المشاركة في فعالية", metric: "event_participation", threshold: 1, xpPoints: 15, impactPoints: 3 },
    { key: "event_organized", name: "تنظيم فعالية", description: "نقاط عند قيادة فعالية", metric: "event_organized", threshold: 1, xpPoints: 40, impactPoints: 15 },
    { key: "onboarding_completion", name: "إتمام التأهيل", description: "نقاط عند إكمال مسار التأهيل", metric: "onboarding_completed", threshold: 1, xpPoints: 50, impactPoints: 10 },
    { key: "volunteer_hours", name: "ساعة تطوعية", description: "نقاط لكل ساعة تطوعية معتمدة", metric: "volunteer_hours", threshold: 1, xpPoints: 5, impactPoints: 5 },
    { key: "meetings_attended", name: "حضور اجتماع", description: "نقاط عند حضور اجتماع", metric: "meetings_attended", threshold: 1, xpPoints: 5, impactPoints: 1 },
  ];
  for (const rule of rules)
    await db.insert(s.contributionRules).values(rule).onConflictDoNothing();
}

/** Real, source-backed counts. Every metric reads actual rows, never a stored total. */
export async function memberMetrics(userId: string, conn: Connection = db) {
  const [completedTasks] = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(s.workAssignments)
    .innerJoin(s.workItems, eq(s.workItems.id, s.workAssignments.workId))
    .where(
      and(
        eq(s.workAssignments.userId, userId),
        inArray(s.workAssignments.role, ["responsible", "participant"]),
        eq(s.workItems.kind, "task"),
        eq(s.workItems.status, "completed"),
      ),
    );
  const [organized] = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(s.events)
    .where(eq(s.events.leadId, userId));
  const [participated] = await conn
    .select({ count: sql<number>`count(distinct ${s.eventAttendance.eventId})::int` })
    .from(s.eventAttendance)
    .innerJoin(s.eventParticipants, eq(s.eventParticipants.id, s.eventAttendance.participantId))
    .where(
      and(
        eq(s.eventParticipants.email, sql`(SELECT email FROM users WHERE id = ${userId})`),
        eq(s.eventAttendance.status, "present"),
      ),
    );
  const [hours] = await conn
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${s.volunteerHourEntries.hours}),0)::int`,
    })
    .from(s.volunteerHourEntries)
    .where(
      and(
        eq(s.volunteerHourEntries.memberId, userId),
        eq(s.volunteerHourEntries.status, "approved"),
      ),
    );
  const [onboarding] = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(s.onboardingPlans)
    .where(
      and(
        eq(s.onboardingPlans.userId, userId),
        eq(s.onboardingPlans.status, "completed"),
      ),
    );
  const [initiatives] = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(s.initiatives)
    .where(eq(s.initiatives.ownerUserId, userId));
  const [meetings] = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(s.workAssignments)
    .innerJoin(s.workItems, eq(s.workItems.id, s.workAssignments.workId))
    .where(
      and(
        eq(s.workAssignments.userId, userId),
        eq(s.workItems.kind, "meeting"),
        inArray(s.workAssignments.role, ["attendee", "responsible"]),
      ),
    );
  return {
    completed_tasks: completedTasks?.count ?? 0,
    event_organized: organized?.count ?? 0,
    event_participation: participated?.count ?? 0,
    volunteer_hours: hours?.total ?? 0,
    volunteer_entries: hours?.count ?? 0,
    onboarding_completed: onboarding?.count ?? 0,
    initiatives_owned: initiatives?.count ?? 0,
    meetings_attended: meetings?.count ?? 0,
  };
}

const ruleFor = (rows: typeof s.contributionRules.$inferSelect[], metric: string) =>
  rows.find((r) => r.metric === metric && r.active);

/**
 * Writes the XP and impact transactions implied by a real event. Both are
 * recorded with their source, reason and rule, so a total is always explainable.
 */
export async function grantContribution(
  tx: Connection,
  ctx: Identity,
  memberId: string,
  metric: Metric,
  sourceId: string,
  reason?: string,
  multiplier = 1,
) {
  const rules = await tx
    .select()
    .from(s.contributionRules)
    .where(eq(s.contributionRules.active, true));
  const rule = ruleFor(rules, metric);
  if (!rule) return { xp: null, impact: null, rule: null };
  const description = reason ?? rule.description;
  // Volunteer hours are the one metric that scales with a quantity.
  const xp = rule.xpPoints * Math.max(1, multiplier);
  const impact = rule.impactPoints * Math.max(1, multiplier);
  if (xp)
    await tx.insert(s.xpTransactions).values({
      id: peopleId(),
      memberId,
      points: xp,
      sourceType: metric,
      sourceId,
      reason: description,
      ruleKey: rule.key,
      createdBy: ctx.user.id,
    });
  if (impact)
    await tx.insert(s.impactTransactions).values({
      id: peopleId(),
      memberId,
      points: impact,
      sourceType: metric,
      sourceId,
      reason: description,
      ruleKey: rule.key,
      createdBy: ctx.user.id,
    });
  return { xp, impact, rule: rule.key };
}

export async function adjustPoints(
  ctx: Identity,
  input: {
    memberId: string;
    kind: "xp" | "impact";
    points: number;
    reason: string;
    academicTermId: string;
    committeeId?: string | null;
  },
) {
  const reason = requiredText(input.reason, 5, 500, "سبب التعديل");
  if (!Number.isInteger(input.points) || input.points === 0)
    throw new HttpError(422, "النقاط عدد صحيح غير صفري");
  return write(
    ctx,
    { academicTermId: input.academicTermId, committeeId: input.committeeId ?? null },
    input.kind === "xp" ? "xp.adjust" : "impact.adjust",
    async (tx) => {
      const table = input.kind === "xp" ? s.xpTransactions : s.impactTransactions;
      const [row] = await tx
        .insert(table)
        .values({
          id: peopleId(),
          memberId: input.memberId,
          points: input.points,
          sourceType: "manual",
          reason,
          ruleKey: "manual_adjustment",
          automatic: false,
          createdBy: ctx.user.id,
        })
        .returning();
      await record(tx, ctx, {
        action: `${input.kind}.adjusted`,
        entityType: input.kind === "xp" ? "xp_transaction" : "impact_transaction",
        entityId: row.id,
        memberId: input.memberId,
        committeeId: input.committeeId ?? null,
        metadata: { points: input.points, reason },
      });
      await notify(
        tx,
        input.memberId,
        input.kind === "xp" ? "تعديل نقاط الخبرة" : "تعديل نقاط الأثر",
        `سُجّل تعديل يدوي بقيمة ${input.points} نقطة. السبب مسجل في السجل.`,
      );
      return row;
    },
  );
}

export async function totalsFor(memberId: string, conn: Connection = db) {
  const [xp] = await conn
    .select({ total: sql<number>`coalesce(sum(${s.xpTransactions.points}),0)::int` })
    .from(s.xpTransactions)
    .where(eq(s.xpTransactions.memberId, memberId));
  const [impact] = await conn
    .select({ total: sql<number>`coalesce(sum(${s.impactTransactions.points}),0)::int` })
    .from(s.impactTransactions)
    .where(eq(s.impactTransactions.memberId, memberId));
  const total = xp?.total ?? 0;
  return { xp: total, impact: impact?.total ?? 0, level: xpLevelFor(total) };
}

export async function listTransactions(
  ctx: Identity,
  memberId: string,
  kind: "xp" | "impact",
) {
  const table = kind === "xp" ? s.xpTransactions : s.impactTransactions;
  return db
    .select()
    .from(table)
    .where(eq(table.memberId, memberId))
    .orderBy(desc(table.createdAt));
}

/**
 * Awards every badge whose explicit rule is now satisfied. One-time badges are
 * guarded by a partial unique index; nothing is awarded without a rule hit.
 */
export async function evaluateBadges(tx: Connection, ctx: Identity, memberId: string) {
  const metrics = await memberMetrics(memberId, tx);
  const definitions = await tx
    .select()
    .from(s.badgeDefinitions)
    .where(eq(s.badgeDefinitions.active, true));
  const existing = await tx
    .select()
    .from(s.memberBadges)
    .where(and(eq(s.memberBadges.memberId, memberId), sql`${s.memberBadges.revokedAt} IS NULL`));
  const awarded: string[] = [];
  for (const definition of definitions) {
    const value = metrics[definition.rule.type as keyof typeof metrics] ?? 0;
    if (value < definition.rule.threshold) continue;
    if (!definition.repeatable && existing.some((b) => b.badgeKey === definition.key))
      continue;
    const [row] = await tx
      .insert(s.memberBadges)
      .values({
        id: peopleId(),
        memberId,
        badgeKey: definition.key,
        reason: `${value} ${definition.rule.unit}؛ الحد ${definition.rule.threshold}`,
        awardedBy: ctx.user.id,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) continue;
    awarded.push(definition.name);
    await record(tx, ctx, {
      action: "badge.awarded",
      entityType: "member_badge",
      entityId: row.id,
      memberId,
      metadata: { badgeKey: definition.key, rule: definition.rule, value },
    });
    await notify(
      tx,
      memberId,
      "شارة جديدة",
      `منحت لك شارة «${definition.name}» بعد استيفاء شرطها المسجل.`,
    );
  }
  return awarded;
}

export async function awardBadge(
  ctx: Identity,
  input: { memberId: string; badgeKey: string; reason: string; academicTermId: string; committeeId?: string | null },
) {
  const reason = requiredText(input.reason, 5, 500, "سبب المنح");
  return write(
    ctx,
    { academicTermId: input.academicTermId, committeeId: input.committeeId ?? null },
    "badge.award",
    async (tx) => {
      const [definition] = await tx
        .select()
        .from(s.badgeDefinitions)
        .where(eq(s.badgeDefinitions.key, input.badgeKey));
      if (!definition) throw new HttpError(422, "الشارة غير معرّفة");
      if (!definition.active) throw new HttpError(409, "الشارة غير نشطة");
      const [row] = await tx
        .insert(s.memberBadges)
        .values({
          id: peopleId(),
          memberId: input.memberId,
          badgeKey: input.badgeKey,
          reason,
          awardedBy: ctx.user.id,
        })
        .onConflictDoNothing()
        .returning();
      if (!row)
        throw new HttpError(409, "الشارة ممنوحة مسبقًا ولا تُكرر");
      await record(tx, ctx, {
        action: "badge.awarded",
        entityType: "member_badge",
        entityId: row.id,
        memberId: input.memberId,
        metadata: { badgeKey: input.badgeKey, reason, manual: true },
      });
      await notify(tx, input.memberId, "شارة جديدة", `منحت لك شارة «${definition.name}».`);
      return row;
    },
  );
}

export async function revokeBadge(
  ctx: Identity,
  id: string,
  reason: string,
  academicTermId: string,
) {
  const clean = requiredText(reason, 5, 500, "سبب السحب");
  return write(ctx, { academicTermId, committeeId: null }, "badge.award", async (tx) => {
    const [before] = await tx
      .select()
      .from(s.memberBadges)
      .where(eq(s.memberBadges.id, id))
      .for("update");
    if (!before) throw new HttpError(404, "الشارة غير متاحة");
    if (before.revokedAt) throw new HttpError(409, "سُحبت الشارة مسبقًا");
    const [row] = await tx
      .update(s.memberBadges)
      .set({ revokedAt: new Date(), revokeReason: clean })
      .where(eq(s.memberBadges.id, id))
      .returning();
    await record(tx, ctx, {
      action: "badge.revoked",
      entityType: "member_badge",
      entityId: id,
      memberId: before.memberId,
      metadata: { badgeKey: before.badgeKey, reason: clean },
    });
    await notify(tx, before.memberId, "سحب شارة", `سُحبت شارة «${before.badgeKey}». السبب: ${clean}`);
    return row;
  });
}

export async function listBadges(memberId: string) {
  return db
    .select({
      id: s.memberBadges.id,
      badgeKey: s.memberBadges.badgeKey,
      reason: s.memberBadges.reason,
      awardedAt: s.memberBadges.awardedAt,
      revokedAt: s.memberBadges.revokedAt,
      name: s.badgeDefinitions.name,
      description: s.badgeDefinitions.description,
      icon: s.badgeDefinitions.icon,
      rule: s.badgeDefinitions.rule,
    })
    .from(s.memberBadges)
    .innerJoin(s.badgeDefinitions, eq(s.badgeDefinitions.key, s.memberBadges.badgeKey))
    .where(eq(s.memberBadges.memberId, memberId))
    .orderBy(desc(s.memberBadges.awardedAt));
}

export async function badgeDefinitions() {
  return db
    .select()
    .from(s.badgeDefinitions)
    .where(eq(s.badgeDefinitions.active, true))
    .orderBy(s.badgeDefinitions.name);
}

/**
 * The Contribution Passport aggregates real activity by referencing the source
 * systems; it stores no duplicated contribution records of its own.
 */
export async function passport(ctx: Identity, memberId: string) {
  const visible = await visibleMemberIds(ctx);
  if (!visible.all && !visible.ids.includes(memberId))
    throw new HttpError(404, "العضو غير متاح ضمن نطاقك");
  const metrics = await memberMetrics(memberId);
  const totals = await totalsFor(memberId);
  const achievements = await db
    .select({
      id: s.achievements.id,
      title: s.achievements.title,
      description: s.achievements.description,
      category: s.achievements.category,
      achievedAt: s.achievements.achievedAt,
      verificationStatus: s.achievements.verificationStatus,
      visibility: s.achievements.visibility,
    })
    .from(s.achievements)
    .where(eq(s.achievements.memberId, memberId))
    .orderBy(desc(s.achievements.achievedAt));
  const work = await db
    .select({
      id: s.workItems.id,
      title: s.workItems.title,
      kind: s.workItems.kind,
      status: s.workItems.status,
      role: s.workAssignments.role,
      completedAt: s.workItems.completedAt,
      dueAt: s.workItems.dueAt,
    })
    .from(s.workAssignments)
    .innerJoin(s.workItems, eq(s.workItems.id, s.workAssignments.workId))
    .where(eq(s.workAssignments.userId, memberId))
    .orderBy(desc(s.workItems.updatedAt))
    .limit(50);
  const attendance = await db
    .select({
      eventId: s.eventAttendance.eventId,
      status: s.eventAttendance.status,
      title: s.workItems.title,
      startAt: s.workItems.startAt,
    })
    .from(s.eventAttendance)
    .innerJoin(s.eventParticipants, eq(s.eventParticipants.id, s.eventAttendance.participantId))
    .innerJoin(s.workItems, eq(s.workItems.id, s.eventAttendance.eventId))
    .where(
      sql`${s.eventParticipants.email} = (SELECT email FROM users WHERE id = ${memberId})`,
    )
    .orderBy(desc(s.workItems.startAt))
    .limit(50);
  const hours = await db
    .select()
    .from(s.volunteerHourEntries)
    .where(eq(s.volunteerHourEntries.memberId, memberId))
    .orderBy(desc(s.volunteerHourEntries.date));
  const badges = await listBadges(memberId);
  const initiatives = await db
    .select({
      id: s.initiatives.id,
      title: s.initiatives.title,
      status: s.initiatives.status,
    })
    .from(s.initiatives)
    .where(eq(s.initiatives.ownerUserId, memberId));
  return {
    memberId,
    metrics,
    totals,
    badges,
    achievements,
    work,
    attendance,
    hours: {
      entries: hours,
      approved: hours.filter((h) => h.status === "approved").reduce((sum, h) => sum + h.hours, 0),
      pending: hours.filter((h) => h.status === "pending").length,
    },
    initiatives,
    explanation:
      "كل رقم هنا محسوب من سجلات موجودة فعليًا في النظام؛ لا توجد قيم افتراضية أو تقديرية.",
  };
}

export async function memberTimeline(ctx: Identity, memberId: string, limit = 60) {
  const visible = await visibleMemberIds(ctx);
  if (!visible.all && !visible.ids.includes(memberId))
    throw new HttpError(404, "العضو غير متاح ضمن نطاقك");
  const rows = await db
    .select()
    .from(s.peopleEvents)
    .where(eq(s.peopleEvents.memberId, memberId))
    .orderBy(desc(s.peopleEvents.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: r.metadata,
    createdAt: r.createdAt,
  }));
}

export async function achievementOptions(ctx: Identity) {
  const visible = await visibleMemberIds(ctx);
  if (!visible.all && !visible.ids.length) return [];
  return db
    .select({ id: s.user.id, name: s.user.name })
    .from(s.user)
    .where(
      and(
        eq(s.user.active, true),
        visible.all ? undefined : inArray(s.user.id, visible.ids),
      ),
    )
    .orderBy(s.user.name);
}

export async function termOrThrow() {
  return currentTermId();
}
