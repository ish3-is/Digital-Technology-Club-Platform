import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import {
  allowed,
  currentTermId,
  hasLiveGrant,
  list,
  notify,
  peopleId,
  record,
  requiredText,
  text,
  write,
  writeSelf,
} from "./helpers";
import { applicationStatusTransitions, isApplicationFinal } from "./types";
import { currentPlacements, ensureProfileInTx } from "./members.service";

export type ApplicationRow = typeof s.membershipApplications.$inferSelect;

export type ApplicationInput = {
  fullName: string;
  studentId: string;
  major?: string;
  email: string;
  phone?: string;
  skills?: string[];
  interests?: string[];
  previousExperience?: string;
  preferredCommitteeId?: string | null;
  alternateCommitteeId?: string | null;
  motivation?: string;
  developmentGoals?: string[];
  availability?: string;
  notes?: string;
  academicTermId?: string;
};

export async function listApplications(
  ctx: Identity,
  filters: {
    status?: s.ApplicationStatus;
    academicTermId?: string;
    query?: string;
    mine?: boolean;
  } = {},
) {
  // A grant only counts while it is live and its term is not closed, so a
  // viewer never sees applications outside a term they can actually act in.
  if (!hasLiveGrant(ctx, "application.view")) return [];
  const termId = filters.academicTermId ?? (await currentTermId().catch(() => null));
  const rows = await db
    .select({
      id: s.membershipApplications.id,
      fullName: s.membershipApplications.fullName,
      studentId: s.membershipApplications.studentId,
      major: s.membershipApplications.major,
      status: s.membershipApplications.status,
      preferredCommitteeId: s.membershipApplications.preferredCommitteeId,
      alternateCommitteeId: s.membershipApplications.alternateCommitteeId,
      skills: s.membershipApplications.skills,
      academicTermId: s.membershipApplications.academicTermId,
      assignedReviewerId: s.membershipApplications.assignedReviewerId,
      convertedUserId: s.membershipApplications.convertedUserId,
      createdAt: s.membershipApplications.createdAt,
      decidedAt: s.membershipApplications.decidedAt,
    })
    .from(s.membershipApplications)
    .where(
      and(
        termId ? eq(s.membershipApplications.academicTermId, termId) : undefined,
        filters.status
          ? eq(s.membershipApplications.status, filters.status)
          : undefined,
        filters.mine ? eq(s.membershipApplications.createdBy, ctx.user.id) : undefined,
        filters.query
          ? sql`strpos(lower(${s.membershipApplications.fullName}),lower(${filters.query}))>0 OR strpos(${s.membershipApplications.studentId},${filters.query})>0`
          : undefined,
      ),
    )
    .orderBy(desc(s.membershipApplications.createdAt));
  // Email, phone and notes stay out of the list projection.
  return rows;
}

export async function getApplication(ctx: Identity, id: string) {
  const [row] = await db
    .select()
    .from(s.membershipApplications)
    .where(eq(s.membershipApplications.id, id));
  if (!row) throw new HttpError(404, "الطلب غير متاح");
  const isOwner = row.createdBy === ctx.user.id;
  const canReview = ctx.grants.some(
    (g) => g.permission === "application.view" && g.active,
  );
  if (!isOwner && !canReview) throw new HttpError(404, "الطلب غير متاح");
  const reviews = canReview
    ? await db
        .select()
        .from(s.applicationReviews)
        .where(eq(s.applicationReviews.applicationId, id))
        .orderBy(desc(s.applicationReviews.createdAt))
    : [];
  return {
    row: {
      ...row,
      // The applicant sees their own record; reviewers see reviewer notes.
      notes: canReview ? row.notes : "",
    },
    reviews,
    canReview,
  };
}

export async function createApplication(ctx: Identity, input: ApplicationInput) {
  const academicTermId = input.academicTermId ?? (await currentTermId());
  const payload = {
    fullName: requiredText(input.fullName, 3, 120, "الاسم"),
    studentId: requiredText(input.studentId, 4, 30, "الرقم الجامعي"),
    email: requiredText(input.email, 5, 200, "البريد الإلكتروني"),
    major: text(input.major ?? "", 120, "التخصص"),
    phone: text(input.phone ?? "", 40, "رقم الجوال"),
    skills: list(input.skills),
    interests: list(input.interests),
    previousExperience: text(input.previousExperience ?? "", 4000, "الخبرات"),
    motivation: text(input.motivation ?? "", 4000, "سبب الانضمام"),
    developmentGoals: list(input.developmentGoals),
    availability: text(input.availability ?? "", 500, "الوقت المتاح"),
    preferredCommitteeId: input.preferredCommitteeId ?? null,
    alternateCommitteeId: input.alternateCommitteeId ?? null,
  };
  return writeSelf(ctx, { academicTermId, committeeId: null }, async (tx) => {
    if (
      payload.preferredCommitteeId &&
      payload.preferredCommitteeId === payload.alternateCommitteeId
    )
      throw new HttpError(422, "اللجنة المفضلة والبديلة يجب أن تختلفا");
    const [dupe] = await tx
      .select({ id: s.membershipApplications.id })
      .from(s.membershipApplications)
      .where(
        and(
          eq(s.membershipApplications.studentId, payload.studentId),
          eq(s.membershipApplications.academicTermId, academicTermId),
          sql`${s.membershipApplications.status} not in ('rejected','converted')`,
        ),
      );
    if (dupe)
      throw new HttpError(409, "يوجد طلب فعال لهذا الرقم الجامعي في الفصل الحالي");
    const [row] = await tx
      .insert(s.membershipApplications)
      .values({
        ...payload,
        notes: text(input.notes ?? "", 4000, "الملاحظات"),
        academicTermId,
        createdBy: ctx.user.id,
      })
      .returning();
    await tx.insert(s.applicationReviews).values({
      id: peopleId(),
      applicationId: row.id,
      reviewerId: ctx.user.id,
      previousStatus: "none",
      newStatus: "submitted",
      decision: "note",
      reason: "تسجيل الطلب",
    });
    await record(tx, ctx, {
      action: "application.submitted",
      entityType: "application",
      entityId: row.id,
      metadata: { status: row.status },
    });
    return row;
  });
}

export async function assignReviewer(
  ctx: Identity,
  id: string,
  reviewerId: string,
) {
  const termId = await currentTermId();
  return write(ctx, { academicTermId: termId, committeeId: null }, "application.review", async (tx) => {
    const [before] = await tx
      .select()
      .from(s.membershipApplications)
      .where(eq(s.membershipApplications.id, id))
      .for("update");
    if (!before) throw new HttpError(404, "الطلب غير متاح");
    if (isApplicationFinal(before.status))
      throw new HttpError(409, "لا يمكن إسناد طلب في حالة نهائية");
    const [reviewer] = await tx
      .select({ id: s.user.id })
      .from(s.user)
      .where(eq(s.user.id, reviewerId));
    if (!reviewer) throw new HttpError(422, "المراجع غير متاح");
    const [row] = await tx
      .update(s.membershipApplications)
      .set({ assignedReviewerId: reviewerId, updatedAt: new Date() })
      .where(eq(s.membershipApplications.id, id))
      .returning();
    const nextStatus =
      before.status === "submitted" ? "under_review" : before.status;
    if (nextStatus !== before.status)
      await tx
        .update(s.membershipApplications)
        .set({ status: nextStatus })
        .where(eq(s.membershipApplications.id, id));
    await tx.insert(s.applicationReviews).values({
      id: peopleId(),
      applicationId: id,
      reviewerId: ctx.user.id,
      previousStatus: before.status,
      newStatus: nextStatus,
      decision: "assigned",
      reason: `إسناد المراجعة إلى ${reviewerId}`,
    });
    await record(tx, ctx, {
      action: "application.assigned",
      entityType: "application",
      entityId: id,
      metadata: { reviewerId, from: before.status, to: nextStatus },
    });
    await notify(
      tx,
      reviewerId,
      "طلب انضمام ينتظر مراجعتك",
      "أُسند إليك طلب جديد للمراجعة في مساحة الناس.",
    );
    return { ...row, status: nextStatus };
  });
}

export async function addReviewNote(ctx: Identity, id: string, reason: string) {
  const termId = await currentTermId();
  const clean = requiredText(reason, 3, 2000, "ملاحظة المراجعة");
  return write(ctx, { academicTermId: termId, committeeId: null }, "application.review", async (tx) => {
    const [before] = await tx
      .select()
      .from(s.membershipApplications)
      .where(eq(s.membershipApplications.id, id));
    if (!before) throw new HttpError(404, "الطلب غير متاح");
    if (isApplicationFinal(before.status))
      throw new HttpError(409, "الطلب في حالة نهائية");
    await tx.insert(s.applicationReviews).values({
      id: peopleId(),
      applicationId: id,
      reviewerId: ctx.user.id,
      previousStatus: before.status,
      newStatus: before.status,
      decision: "note",
      reason: clean,
    });
    await record(tx, ctx, {
      action: "application.note",
      entityType: "application",
      entityId: id,
      metadata: { reason: clean },
    });
    return { ok: true };
  });
}

const decisionToStatus = {
  shortlisted: "shortlisted",
  accepted: "accepted",
  rejected: "rejected",
  waitlisted: "waitlisted",
} as const;

export type ApplicationDecision = keyof typeof decisionToStatus;

/**
 * A decision appends to the review log and moves the application along a declared
 * transition. History is never rewritten: the previous state is kept on the row.
 */
export async function decideApplication(
  ctx: Identity,
  id: string,
  decision: ApplicationDecision,
  reason: string,
) {
  const termId = await currentTermId();
  const clean = requiredText(reason, 5, 2000, "سبب القرار");
  return write(ctx, { academicTermId: termId, committeeId: null }, "application.decide", async (tx) => {
    const [before] = await tx
      .select()
      .from(s.membershipApplications)
      .where(eq(s.membershipApplications.id, id))
      .for("update");
    if (!before) throw new HttpError(404, "الطلب غير متاح");
    if (isApplicationFinal(before.status))
      throw new HttpError(409, "اتُّخذ قرار نهائي على هذا الطلب");
    const next = decisionToStatus[decision];
    if (!applicationStatusTransitions[before.status].includes(next))
      throw new HttpError(409, "انتقال حالة الطلب غير مسموح من الحالة الحالية");
    const [row] = await tx
      .update(s.membershipApplications)
      .set({
        status: next,
        decidedAt: next === "rejected" ? new Date() : before.decidedAt,
        updatedAt: new Date(),
      })
      .where(eq(s.membershipApplications.id, id))
      .returning();
    await tx.insert(s.applicationReviews).values({
      id: peopleId(),
      applicationId: id,
      reviewerId: ctx.user.id,
      previousStatus: before.status,
      newStatus: next,
      decision,
      reason: clean,
    });
    await record(tx, ctx, {
      action: `application.${decision}`,
      entityType: "application",
      entityId: id,
      metadata: { from: before.status, to: next, reason: clean },
    });
    await notify(
      tx,
      before.createdBy,
      "تحديث طلب الانضمام",
      `تغيّرت حالة طلبك إلى «${next}». التفاصيل في مساحة الطلبات.`,
    );
    return row;
  });
}

export type ConversionInput = {
  applicationId: string;
  userId: string;
  academicTermId: string;
  committeeId?: string | null;
  clubRole?: string;
  clubRoleReason?: string;
  joinedAt?: Date;
};

/**
 * Converts an accepted application into a real member: the account gets a
 * profile, a placement, an onboarding plan, and a role — all in one transaction.
 */
export async function convertToMember(ctx: Identity, input: ConversionInput) {
  const reason = text(input.clubRoleReason ?? "قبول طلب انضمام", 500);
  return write(
    ctx,
    { academicTermId: input.academicTermId, committeeId: input.committeeId ?? null },
    "member.create",
    async (tx) => {
      const [application] = await tx
        .select()
        .from(s.membershipApplications)
        .where(eq(s.membershipApplications.id, input.applicationId))
        .for("update");
      if (!application) throw new HttpError(404, "الطلب غير متاح");
      if (application.status !== "accepted")
        throw new HttpError(409, "لا يمكن الدمج قبل قبول الطلب");
      if (application.convertedUserId)
        throw new HttpError(409, "أُدمج هذا الطلب مسبقًا");
      const [account] = await tx
        .select({ id: s.user.id, active: s.user.active })
        .from(s.user)
        .where(eq(s.user.id, input.userId))
        .for("update");
      if (!account?.active) throw new HttpError(422, "الحساب غير متاح للدمج");
      const joinedAt = input.joinedAt ?? new Date();
      await ensureProfileInTx(tx, input.userId);
      await tx
        .update(s.memberProfiles)
        .set({
          studentId: application.studentId,
          major: application.major || null,
          skills: application.skills,
          interests: application.interests,
          developmentGoals: application.developmentGoals,
          previousExperience: application.previousExperience,
          motivation: application.motivation,
          availability: application.availability,
          preferredAreas: application.preferredCommitteeId
            ? [application.preferredCommitteeId]
            : [],
          joinedAt,
          status: "new",
          statusReason: "أُدمج من طلب انضمام مقبول",
          updatedAt: new Date(),
        })
        .where(eq(s.memberProfiles.userId, input.userId));
      await tx.insert(s.memberStatusHistory).values({
        id: peopleId(),
        userId: input.userId,
        previousStatus: null,
        newStatus: "new",
        reason: "دمج من طلب انضمام",
        changedBy: ctx.user.id,
      });
      if (input.committeeId) {
        const [existing] = await tx
          .select({ id: s.memberCommitteeHistory.id })
          .from(s.memberCommitteeHistory)
          .where(
            and(
              eq(s.memberCommitteeHistory.userId, input.userId),
              sql`${s.memberCommitteeHistory.endAt} IS NULL`,
            ),
          );
        if (!existing)
          await tx.insert(s.memberCommitteeHistory).values({
            id: peopleId(),
            userId: input.userId,
            committeeId: input.committeeId,
            academicTermId: input.academicTermId,
            assignmentType: "permanent",
            reason: "توزيع أولي بعد القبول",
            placedBy: ctx.user.id,
            startAt: joinedAt,
          });
      }
      await tx
        .insert(s.memberRoleHistory)
        .values({
          id: peopleId(),
          userId: input.userId,
          clubRole: input.clubRole ?? "member",
          committeeId: input.committeeId ?? null,
          academicTermId: input.academicTermId,
          reason,
          assignedBy: ctx.user.id,
          startAt: joinedAt,
        })
        .onConflictDoNothing();
      const { createPlan } = await import("./onboarding.service");
      await createPlan(
        ctx,
        tx,
        { userId: input.userId, academicTermId: input.academicTermId },
      );
      const [row] = await tx
        .update(s.membershipApplications)
        .set({
          status: "converted",
          convertedUserId: input.userId,
          updatedAt: new Date(),
        })
        .where(eq(s.membershipApplications.id, input.applicationId))
        .returning();
      await record(tx, ctx, {
        action: "application.converted",
        entityType: "application",
        entityId: input.applicationId,
        memberId: input.userId,
        committeeId: input.committeeId ?? null,
        metadata: { userId: input.userId, previousStatus: "accepted", to: "converted" },
      });
      await notify(
        tx,
        input.userId,
        "أهلًا بك عضوًا في النادي",
        "تم اعتماد عضويتك. راجع خطوات التأهيل في ملفك.",
      );
      return row;
    },
  );
}

export async function listTransfers(
  ctx: Identity,
  filters: { status?: s.TransferStatus; userId?: string } = {},
) {
  if (!hasLiveGrant(ctx, "transfer.view")) return [];
  const rows = await db
    .select()
    .from(s.transferRequests)
    .where(
      and(
        filters.status ? eq(s.transferRequests.status, filters.status) : undefined,
        filters.userId ? eq(s.transferRequests.userId, filters.userId) : undefined,
      ),
    )
    .orderBy(desc(s.transferRequests.createdAt));
  return rows;
}

export { currentPlacements };
