import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import {
  allowed,
  currentTermId,
  isManager,
  isSupervisor,
  notify,
  peopleId,
  record,
  requiredText,
  text,
  visibleMemberIds,
  write,
  writeSelf,
} from "./helpers";
import { currentPlacements } from "./members.service";

export type AchievementRow = typeof s.achievements.$inferSelect;

/** Achievements are filtered by who issued them and who may see them. */
export async function listAchievements(
  ctx: Identity,
  filters: { memberId?: string; verificationStatus?: s.AchievementVerification } = {},
) {
  const visible = await visibleMemberIds(ctx);
  const rows = await db
    .select({
      id: s.achievements.id,
      memberId: s.achievements.memberId,
      title: s.achievements.title,
      description: s.achievements.description,
      category: s.achievements.category,
      achievedAt: s.achievements.achievedAt,
      issuerId: s.achievements.issuerId,
      visibility: s.achievements.visibility,
      verificationStatus: s.achievements.verificationStatus,
      evidenceId: s.achievements.evidenceId,
      createdAt: s.achievements.createdAt,
    })
    .from(s.achievements)
    .where(
      and(
        filters.memberId ? eq(s.achievements.memberId, filters.memberId) : undefined,
        filters.verificationStatus
          ? eq(s.achievements.verificationStatus, filters.verificationStatus)
          : undefined,
      ),
    )
    .orderBy(desc(s.achievements.achievedAt));
  const result = [];
  for (const row of rows) {
    if (!visible.all && !visible.ids.includes(row.memberId)) continue;
    if (row.visibility === "management") {
      const placements = await currentPlacements([row.memberId]);
      if (!isManager(ctx, placements[0]?.committeeId ?? null) && row.memberId !== ctx.user.id)
        continue;
    }
    result.push(row);
  }
  return result;
}

export async function createAchievement(
  ctx: Identity,
  input: {
    memberId: string;
    title: string;
    description?: string;
    category: s.AchievementCategory;
    achievedAt: Date;
    visibility: "management" | "committee" | "members";
    evidenceId?: string | null;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    academicTermId?: string;
  },
) {
  const academicTermId = input.academicTermId ?? (await currentTermId());
  const title = requiredText(input.title, 3, 200, "عنوان الإنجاز");
  if (input.achievedAt > new Date()) throw new HttpError(422, "تاريخ الإنجاز مستقبلي");
  return write(ctx, { academicTermId, committeeId: null }, "achievement.create", async (tx) => {
    const [account] = await tx
      .select({ id: s.user.id })
      .from(s.user)
      .where(eq(s.user.id, input.memberId));
    if (!account) throw new HttpError(422, "العضو غير متاح");
    if (input.evidenceId) {
      const [evidence] = await tx
        .select({ id: s.evidence.id })
        .from(s.evidence)
        .where(eq(s.evidence.id, input.evidenceId));
      if (!evidence) throw new HttpError(422, "الدليل غير متاح");
    }
    const [row] = await tx
      .insert(s.achievements)
      .values({
        id: peopleId(),
        memberId: input.memberId,
        title,
        description: text(input.description ?? "", 4000, "الوصف"),
        category: input.category,
        achievedAt: input.achievedAt,
        issuerId: ctx.user.id,
        visibility: input.visibility,
        evidenceId: input.evidenceId ?? null,
        sourceEntityType: input.sourceEntityType ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
      })
      .returning();
    await record(tx, ctx, {
      action: "achievement.created",
      entityType: "achievement",
      entityId: row.id,
      memberId: input.memberId,
      metadata: { category: input.category, visibility: input.visibility },
    });
    await notify(
      tx,
      input.memberId,
      "تسجيل إنجاز جديد",
      `سُجّل الإنجاز «${title}» وبانتظار التحقق.`,
    );
    return row;
  });
}

/**
 * Verification is independent of creation: the issuer cannot verify their own
 * record, mirroring the evidence.verify separation from Phase 4.
 */
export async function verifyAchievement(
  ctx: Identity,
  id: string,
  decision: "verified" | "rejected",
  reason: string,
) {
  const academicTermId = await currentTermId();
  const clean = requiredText(reason, 3, 1000, "سبب القرار");
  return write(ctx, { academicTermId, committeeId: null }, "achievement.verify", async (tx) => {
    const [before] = await tx
      .select()
      .from(s.achievements)
      .where(eq(s.achievements.id, id))
      .for("update");
    if (!before) throw new HttpError(404, "الإنجاز غير متاح");
    if (before.verificationStatus !== "unreviewed")
      throw new HttpError(409, "تم التحقق من هذا الإنجاز بالفعل");
    if (before.issuerId === ctx.user.id)
      throw new HttpError(403, "التحقق يحتاج شخصًا مستقلًا عن مُصدِر الإنجاز");
    if (decision === "rejected" && clean.length < 5)
      throw new HttpError(422, "يلزم سبب واضح لرفض الإنجاز");
    const [row] = await tx
      .update(s.achievements)
      .set({ verificationStatus: decision })
      .where(eq(s.achievements.id, id))
      .returning();
    await record(tx, ctx, {
      action: `achievement.${decision}`,
      entityType: "achievement",
      entityId: id,
      memberId: before.memberId,
      metadata: { from: "unreviewed", to: decision, reason: clean },
    });
    await notify(
      tx,
      before.memberId,
      decision === "verified" ? "تم توثيق إنجازك" : "لم يُوثَّق الإنجاز",
      decision === "verified"
        ? `أصبح الإنجاز «${before.title}» موثقًا.`
        : `لم يُوثَّق «${before.title}». السبب: ${clean}`,
    );
    return row;
  });
}

export async function assignMentor(
  ctx: Identity,
  input: {
    mentorId: string;
    menteeId: string;
    academicTermId: string;
    followUpAt?: Date | null;
    notes?: string;
  },
) {
  const notes = text(input.notes ?? "", 2000, "ملاحظات الإرشاد");
  return write(
    ctx,
    { academicTermId: input.academicTermId, committeeId: null },
    "mentor.assign",
    async (tx) => {
      if (input.mentorId === input.menteeId)
        throw new HttpError(422, "لا يمكن إسناد الإرشاد إلى النفس");
      for (const id of [input.mentorId, input.menteeId]) {
        const [account] = await tx
          .select({ id: s.user.id, onboarded: s.user.onboarded })
          .from(s.user)
          .where(and(eq(s.user.id, id), eq(s.user.active, true)));
        if (!account?.onboarded) throw new HttpError(422, "الحساب غير جاهز للإرشاد");
      }
      const [open] = await tx
        .select()
        .from(s.mentorAssignments)
        .where(
          and(
            eq(s.mentorAssignments.menteeId, input.menteeId),
            eq(s.mentorAssignments.status, "active"),
          ),
        );
      if (open) throw new HttpError(409, "يوجد إرشاد نشط لهذا العضو");
      const [row] = await tx
        .insert(s.mentorAssignments)
        .values({
          id: peopleId(),
          mentorId: input.mentorId,
          menteeId: input.menteeId,
          academicTermId: input.academicTermId,
          notes,
          followUpAt: input.followUpAt ?? null,
          assignedBy: ctx.user.id,
        })
        .returning();
      await record(tx, ctx, {
        action: "mentor.assigned",
        entityType: "mentor_assignment",
        entityId: row.id,
        memberId: input.menteeId,
        metadata: { mentorId: input.mentorId },
      });
      await notify(
        tx,
        input.mentorId,
        "إرشاد جديد",
        "أُسند إليك عضو جديد للإرشاد. راجع ملفه وابدأ المتابعة.",
      );
      await notify(
        tx,
        input.menteeId,
        "تم إسناد مرشد لك",
        "سيتواصل معك مرشدك. راجع خطة الإرشاد في ملفك.",
      );
      return row;
    },
  );
}

export async function updateMentor(
  ctx: Identity,
  id: string,
  input: {
    status?: "active" | "completed" | "ended";
    followUpAt?: Date | null;
    notes?: string;
  },
) {
  const academicTermId = await currentTermId();
  return write(ctx, { academicTermId, committeeId: null }, "mentor.update", async (tx) => {
    const [before] = await tx
      .select()
      .from(s.mentorAssignments)
      .where(eq(s.mentorAssignments.id, id))
      .for("update");
    if (!before) throw new HttpError(404, "الإرشاد غير متاح");
    const self =
      before.mentorId === ctx.user.id || before.menteeId === ctx.user.id;
    if (self && input.status === "active")
      throw new HttpError(422, "لا يعيد الإرشاد حالة مغلقة دون صلاحية إشراف");
    const [row] = await tx
      .update(s.mentorAssignments)
      .set({
        status: input.status ?? undefined,
        followUpAt: input.followUpAt ?? undefined,
        notes: input.notes ?? undefined,
        endedAt:
          input.status && input.status !== "active" ? new Date() : undefined,
      })
      .where(eq(s.mentorAssignments.id, id))
      .returning();
    await record(tx, ctx, {
      action: "mentor.updated",
      entityType: "mentor_assignment",
      entityId: id,
      memberId: before.menteeId,
      metadata: { from: before.status, to: row.status },
    });
    if (input.status && input.status !== "active")
      await notify(
        tx,
        before.menteeId,
        "تحديث الإرشاد",
        `أُغلق إرشادك بحالة «${input.status}».`,
      );
    return row;
  });
}

export async function listMentorAssignments(
  ctx: Identity,
  filters: { mentorId?: string; menteeId?: string; status?: s.MentorStatus } = {},
) {
  const visible = await visibleMemberIds(ctx);
  if (!visible.all && !visible.ids.length) return [];
  const rows = await db
    .select({
      id: s.mentorAssignments.id,
      mentorId: s.mentorAssignments.mentorId,
      menteeId: s.mentorAssignments.menteeId,
      academicTermId: s.mentorAssignments.academicTermId,
      status: s.mentorAssignments.status,
      notes: s.mentorAssignments.notes,
      followUpAt: s.mentorAssignments.followUpAt,
      createdAt: s.mentorAssignments.createdAt,
      endedAt: s.mentorAssignments.endedAt,
    })
    .from(s.mentorAssignments)
    .where(
      and(
        filters.mentorId ? eq(s.mentorAssignments.mentorId, filters.mentorId) : undefined,
        filters.menteeId ? eq(s.mentorAssignments.menteeId, filters.menteeId) : undefined,
        filters.status ? eq(s.mentorAssignments.status, filters.status) : undefined,
        visible.all
          ? undefined
          : or(
              eq(s.mentorAssignments.mentorId, ctx.user.id),
              eq(s.mentorAssignments.menteeId, ctx.user.id),
              sql`${s.mentorAssignments.menteeId} IN (${sql.join(visible.ids.map((id) => sql`${id}`), sql`, `)})`,
            ),
      ),
    )
    .orderBy(desc(s.mentorAssignments.createdAt));
  return rows;
}

/**
 * A member's "وش عليك اليوم؟" — derived only from real pending work, never invented.
 */
export async function todayFor(memberId: string, userId: string) {
  const now = new Date();
  const assignments = await db
    .select({
      id: s.workItems.id,
      title: s.workItems.title,
      kind: s.workItems.kind,
      status: s.workItems.status,
      dueAt: s.workItems.dueAt,
      role: s.workAssignments.role,
    })
    .from(s.workAssignments)
    .innerJoin(s.workItems, eq(s.workItems.id, s.workAssignments.workId))
    .where(
      and(
        eq(s.workAssignments.userId, userId),
        inArrayOpen(s.workItems.status),
        or(
          inArrayRoles(s.workAssignments.role),
          eq(s.workItems.createdBy, userId),
        ),
      ),
    )
    .orderBy(s.workItems.dueAt);
  const steps = await db
    .select({
      id: s.onboardingSteps.id,
      title: s.onboardingSteps.title,
      status: s.onboardingSteps.status,
      dueAt: s.onboardingSteps.dueAt,
      planId: s.onboardingSteps.planId,
    })
    .from(s.onboardingSteps)
    .innerJoin(s.onboardingPlans, eq(s.onboardingPlans.id, s.onboardingSteps.planId))
    .where(
      and(
        eq(s.onboardingPlans.userId, userId),
        eq(s.onboardingPlans.status, "in_progress"),
        or(
          eq(s.onboardingSteps.status, "pending"),
          eq(s.onboardingSteps.status, "in_progress"),
        ),
      ),
    )
    .orderBy(s.onboardingSteps.dueAt);
  const mentorships = await db
    .select({
      id: s.mentorAssignments.id,
      menteeId: s.mentorAssignments.menteeId,
      followUpAt: s.mentorAssignments.followUpAt,
    })
    .from(s.mentorAssignments)
    .where(
      and(
        eq(s.mentorAssignments.mentorId, userId),
        eq(s.mentorAssignments.status, "active"),
      ),
    );
  const hours = await db
    .select({ id: s.volunteerHourEntries.id, status: s.volunteerHourEntries.status })
    .from(s.volunteerHourEntries)
    .where(
      and(
        eq(s.volunteerHourEntries.memberId, userId),
        eq(s.volunteerHourEntries.status, "pending"),
      ),
    );
  return {
    tasks: assignments.filter((a) => a.kind === "task" && a.dueAt && a.dueAt >= now),
    requests: assignments.filter((a) => a.kind === "request" && a.status !== "completed"),
    meetings: assignments.filter((a) => a.kind === "meeting" && a.status === "scheduled"),
    events: assignments.filter((a) => a.kind === "event"),
    onboardingSteps: steps.filter((x) => x.dueAt && x.dueAt >= new Date(now.getTime() - 7 * 86400000)),
    mentorships,
    pendingHours: hours,
    explanation:
      "مستمدة من مهامك وطلباتك ومراحل تأهيلك وإرشادك المسجّلة فعليًا.",
  };
}

const openStatuses = ["not_started", "in_progress", "review", "new", "received", "scheduled", "preparing", "ready", "running", "evaluation", "final_report", "idea", "planning", "pending_approval", "registration_open"];
const inArrayOpen = (column: typeof s.workItems.status) =>
  sql`${column} IN (${sql.join(openStatuses.map((x) => sql`${x}`), sql`, `)})`;
const inArrayRoles = (column: typeof s.workAssignments.role) =>
  sql`${column} IN ('responsible','participant','attendee')`;

export { isSupervisor };
