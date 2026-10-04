import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { getWork } from "@/lib/work/access";
import {
  currentTermId,
  hasLiveGrant,
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

export async function requestTransfer(
  ctx: Identity,
  input: {
    userId: string;
    toCommitteeId: string;
    reason: string;
    notes?: string;
    academicTermId?: string;
  },
) {
  const academicTermId = input.academicTermId ?? (await currentTermId());
  const reason = requiredText(input.reason, 10, 1000, "سبب النقل");
  const self = input.userId === ctx.user.id;
  return writeSelf(ctx, { academicTermId, committeeId: null }, async (tx) => {
    const [committee] = await tx
      .select({ id: s.committees.id, active: s.committees.active })
      .from(s.committees)
      .where(eq(s.committees.id, input.toCommitteeId));
    if (!committee?.active) throw new HttpError(422, "اللجنة الهدف غير متاحة");
    const [open] = await tx
      .select()
      .from(s.transferRequests)
      .where(
        and(
          eq(s.transferRequests.userId, input.userId),
          eq(s.transferRequests.status, "requested"),
        ),
      );
    if (open) throw new HttpError(409, "يوجد طلب نقل قيد المراجعة");
    const placements = await currentPlacements([input.userId], tx);
    const from = placements[0]?.committeeId ?? null;
    if (from === input.toCommitteeId)
      throw new HttpError(409, "أنت بالفعل في هذه اللجنة");
    const [row] = await tx
      .insert(s.transferRequests)
      .values({
        id: peopleId(),
        userId: input.userId,
        fromCommitteeId: from,
        toCommitteeId: input.toCommitteeId,
        reason,
        notes: text(input.notes ?? "", 2000, "ملاحظات"),
        requestedBy: ctx.user.id,
      })
      .returning();
    await record(tx, ctx, {
      action: "transfer.requested",
      entityType: "transfer_request",
      entityId: row.id,
      memberId: input.userId,
      committeeId: from,
      metadata: { from, to: input.toCommitteeId, reason, self },
    });
    if (self)
      await notify(
        tx,
        input.userId,
        "تم تسجيل طلب النقل",
        "طلبك للنقل قيد المراجعة. ستظهر النتيجة في ملفك.",
      );
    return row;
  });
}

/**
 * Approving a transfer closes the current placement row and opens a new one;
 * the previous committee stays in history untouched.
 */
export async function decideTransfer(
  ctx: Identity,
  id: string,
  decision: "approved" | "rejected",
  notes: string,
) {
  const academicTermId = await currentTermId();
  const clean = requiredText(notes, 3, 1000, "ملاحظة القرار");
  return write(ctx, { academicTermId, committeeId: null }, "transfer.approve", async (tx) => {
    const [before] = await tx
      .select()
      .from(s.transferRequests)
      .where(eq(s.transferRequests.id, id))
      .for("update");
    if (!before) throw new HttpError(404, "طلب النقل غير متاح");
    if (before.status !== "requested")
      throw new HttpError(409, "اتُّخذ قرار على هذا الطلب بالفعل");
    const now = new Date();
    const [row] = await tx
      .update(s.transferRequests)
      .set({
        status: decision,
        reviewedBy: ctx.user.id,
        decisionNotes: clean,
        decidedAt: now,
        effectiveAt: decision === "approved" ? now : null,
      })
      .where(eq(s.transferRequests.id, id))
      .returning();
    if (decision === "approved") {
      const [current] = await tx
        .select()
        .from(s.memberCommitteeHistory)
        .where(
          and(
            eq(s.memberCommitteeHistory.userId, before.userId),
            sql`${s.memberCommitteeHistory.endAt} IS NULL`,
          ),
        )
        .for("update");
      if (current)
        await tx
          .update(s.memberCommitteeHistory)
          .set({ endAt: now })
          .where(eq(s.memberCommitteeHistory.id, current.id));
      await tx.insert(s.memberCommitteeHistory).values({
        id: peopleId(),
        userId: before.userId,
        committeeId: before.toCommitteeId,
        academicTermId,
        assignmentType: "permanent",
        reason: `نقل معتمد: ${before.reason}`,
        placedBy: ctx.user.id,
        startAt: now,
      });
      // The placement itself changed, so it belongs on the timeline too.
      await record(tx, ctx, {
        action: "placement.changed",
        entityType: "member",
        entityId: before.userId,
        memberId: before.userId,
        committeeId: before.toCommitteeId,
        metadata: { from: before.fromCommitteeId, to: before.toCommitteeId, via: "transfer" },
      });
      await tx.insert(s.handovers).values({
        id: peopleId(),
        userId: before.userId,
        kind: "committee_transfer",
        committeeId: before.fromCommitteeId,
        notes: `تسليم مرتبط بالنقل: ${clean}`,
        createdBy: ctx.user.id,
      });
    }
    await record(tx, ctx, {
      action: `transfer.${decision}`,
      entityType: "transfer_request",
      entityId: id,
      memberId: before.userId,
      committeeId: before.toCommitteeId,
      metadata: { from: before.fromCommitteeId, to: before.toCommitteeId, notes: clean },
    });
    await notify(
      tx,
      before.userId,
      decision === "approved" ? "تم اعتماد النقل" : "لم يُعتمد النقل",
      decision === "approved"
        ? "نُقل عضوك إلى اللجنة الجديدة. راجع سجل اللجان في ملفك."
        : `لم يُعتمد طلب النقل. السبب: ${clean}`,
    );
    return row;
  });
}

export async function getTransfer(ctx: Identity, id: string) {
  const [row] = await db
    .select()
    .from(s.transferRequests)
    .where(eq(s.transferRequests.id, id));
  if (!row) throw new HttpError(404, "طلب النقل غير متاح");
  const visible = await visibleMemberIds(ctx);
  if (!visible.all && !visible.ids.includes(row.userId))
    throw new HttpError(404, "طلب النقل غير متاح");
  return row;
}

export async function listHandovers(
  ctx: Identity,
  filters: { userId?: string; status?: s.HandoverStatus } = {},
) {
  if (!hasLiveGrant(ctx, "handover.view")) return [];
  const rows = await db
    .select()
    .from(s.handovers)
    .where(
      and(
        filters.userId ? eq(s.handovers.userId, filters.userId) : undefined,
        filters.status ? eq(s.handovers.status, filters.status) : undefined,
      ),
    )
    .orderBy(desc(s.handovers.createdAt));
  return rows;
}

export async function createHandover(
  ctx: Identity,
  input: {
    userId: string;
    kind: "role_change" | "committee_transfer" | "exit";
    committeeId?: string | null;
    successorId?: string | null;
    academicTermId: string;
    activeTasks?: string;
    activeEvents?: string;
    files?: string;
    resources?: string;
    notes?: string;
  },
) {
  return write(
    ctx,
    { academicTermId: input.academicTermId, committeeId: input.committeeId ?? null },
    "handover.manage",
    async (tx) => {
      const [row] = await tx
        .insert(s.handovers)
        .values({
          id: peopleId(),
          userId: input.userId,
          kind: input.kind,
          committeeId: input.committeeId ?? null,
          successorId: input.successorId ?? null,
          activeTasks: text(input.activeTasks ?? "", 4000, "المهام النشطة"),
          activeEvents: text(input.activeEvents ?? "", 4000, "الفعاليات النشطة"),
          files: text(input.files ?? "", 4000, "الملفات"),
          resources: text(input.resources ?? "", 4000, "الموارد"),
          notes: text(input.notes ?? "", 4000, "ملاحظات التسليم"),
          createdBy: ctx.user.id,
        })
        .returning();
      await record(tx, ctx, {
        action: "handover.created",
        entityType: "handover",
        entityId: row.id,
        memberId: input.userId,
        committeeId: input.committeeId ?? null,
        metadata: { kind: input.kind },
      });
      if (input.successorId)
        await notify(
          tx,
          input.successorId,
          "مهمة تسليم جديدة",
          "أُسندت إليك مسؤوليات تسليم. راجع التفاصيل في ملف العضو.",
        );
      return row;
    },
  );
}

export async function updateHandover(
  ctx: Identity,
  id: string,
  input: {
    responsibilities?: string;
    activeTasks?: string;
    pendingDecisions?: string;
    activeEvents?: string;
    files?: string;
    resources?: string;
    notes?: string;
    complete?: boolean;
  },
) {
  const academicTermId = await currentTermId();
  return write(ctx, { academicTermId, committeeId: null }, "handover.manage", async (tx) => {
    const [before] = await tx
      .select()
      .from(s.handovers)
      .where(eq(s.handovers.id, id))
      .for("update");
    if (!before) throw new HttpError(404, "التسليم غير متاح");
    if (before.status === "completed" && !input.complete)
      throw new HttpError(409, "التسليم المكتمل لا يعدّل دون سجل جديد");
    if (input.complete && !input.responsibilities && !before.responsibilities)
      throw new HttpError(422, "وثّق المسؤوليات قبل إتمام التسليم");
    const [row] = await tx
      .update(s.handovers)
      .set({
        responsibilities: input.responsibilities ?? undefined,
        activeTasks: input.activeTasks ?? undefined,
        pendingDecisions: input.pendingDecisions ?? undefined,
        activeEvents: input.activeEvents ?? undefined,
        files: input.files ?? undefined,
        resources: input.resources ?? undefined,
        notes: input.notes ?? undefined,
        status: input.complete ? "completed" : undefined,
        completedAt: input.complete ? new Date() : undefined,
      })
      .where(eq(s.handovers.id, id))
      .returning();
    await record(tx, ctx, {
      action: input.complete ? "handover.completed" : "handover.updated",
      entityType: "handover",
      entityId: id,
      memberId: before.userId,
      metadata: { kind: before.kind },
    });
    return row;
  });
}

/**
 * Direct committee placement after acceptance. The previous placement row is
 * closed, so committee history is preserved rather than rewritten.
 */
export async function placeInCommittee(
  ctx: Identity,
  input: {
    userId: string;
    committeeId: string;
    academicTermId: string;
    assignmentType?: "permanent" | "temporary" | "collaboration";
    reason?: string;
  },
) {
  const reason = text(input.reason ?? "", 1000, "سبب التوزيع");
  return write(
    ctx,
    { academicTermId: input.academicTermId, committeeId: input.committeeId },
    "committee_assignment.manage",
    async (tx) => {
      const [committee] = await tx
        .select({ id: s.committees.id, active: s.committees.active })
        .from(s.committees)
        .where(eq(s.committees.id, input.committeeId));
      if (!committee?.active) throw new HttpError(422, "اللجنة غير متاحة");
      const [account] = await tx
        .select({ id: s.user.id })
        .from(s.user)
        .where(and(eq(s.user.id, input.userId), eq(s.user.active, true)));
      if (!account) throw new HttpError(422, "العضو غير متاح");
      const [current] = await tx
        .select()
        .from(s.memberCommitteeHistory)
        .where(
          and(
            eq(s.memberCommitteeHistory.userId, input.userId),
            sql`${s.memberCommitteeHistory.endAt} IS NULL`,
          ),
        )
        .for("update");
      if (current?.committeeId === input.committeeId && current.assignmentType === (input.assignmentType ?? "permanent"))
        throw new HttpError(409, "العضو موزع بالفعل في هذه اللجنة بنفس النوع");
      const now = new Date();
      if (current) {
        if (current.assignmentType === "temporary" || current.assignmentType === "collaboration") {
          // A temporary assignment simply closes; permanent placement moves.
          await tx
            .update(s.memberCommitteeHistory)
            .set({ endAt: now })
            .where(eq(s.memberCommitteeHistory.id, current.id));
        } else
          throw new HttpError(409, "استخدم طلب نقل لتغيير اللجنة الدائمة");
      }
      const [row] = await tx
        .insert(s.memberCommitteeHistory)
        .values({
          id: peopleId(),
          userId: input.userId,
          committeeId: input.committeeId,
          academicTermId: input.academicTermId,
          assignmentType: input.assignmentType ?? "permanent",
          reason: reason || "توزيع إداري",
          placedBy: ctx.user.id,
          startAt: now,
        })
        .returning();
      await record(tx, ctx, {
        action: "placement.changed",
        entityType: "member",
        entityId: input.userId,
        memberId: input.userId,
        committeeId: input.committeeId,
        metadata: {
          from: current?.committeeId ?? null,
          to: input.committeeId,
          type: input.assignmentType ?? "permanent",
          reason,
        },
      });
      await notify(
        tx,
        input.userId,
        "تحديث توزيعك",
        `تم تسجيل توزيعك في لجنة جديدة وفق قرار إداري.`,
      );
      return row;
    },
  );
}

export type OffboardReason =
  | "resignation"
  | "inactivity"
  | "graduation"
  | "administrative"
  | "term_end";

export const offboardReasonLabels: Record<OffboardReason, string> = {
  resignation: "استقالة",
  inactivity: "خروج بسبب عدم النشاط",
  graduation: "تخرج",
  administrative: "إجراء إداري",
  term_end: "انتقال بين الفصول",
};

const offboardStatus: Record<OffboardReason, s.MemberStatus> = {
  resignation: "withdrawn",
  inactivity: "inactive",
  graduation: "archived",
  administrative: "archived",
  term_end: "inactive",
};

/**
 * Offboarding archives or transitions the member; it never deletes the record and
 * never silently drops assignments. Open work is reported back to the caller.
 */
export async function offboardMember(
  ctx: Identity,
  input: {
    userId: string;
    reason: OffboardReason;
    note: string;
    academicTermId: string;
    reassignOpenWork: boolean;
  },
) {
  const note = requiredText(input.note, 10, 2000, "سبب الخروج");
  return write(
    ctx,
    { academicTermId: input.academicTermId, committeeId: null },
    "member.archive",
    async (tx) => {
      const [profile] = await tx
        .select()
        .from(s.memberProfiles)
        .where(eq(s.memberProfiles.userId, input.userId))
        .for("update");
      if (!profile) throw new HttpError(404, "ملف العضو غير موجود");
      const next = offboardStatus[input.reason];
      if (profile.status === next)
        throw new HttpError(409, "العضو في الحالة المطلوبة بالفعل");
      const openAssignments = await tx
        .select({
          id: s.workAssignments.id,
          workId: s.workAssignments.workId,
          title: s.workItems.title,
          role: s.workAssignments.role,
        })
        .from(s.workAssignments)
        .innerJoin(s.workItems, eq(s.workItems.id, s.workAssignments.workId))
        .where(
          and(
            eq(s.workAssignments.userId, input.userId),
            sql`${s.workItems.status} not in ('completed','cancelled','archived','rejected')`,
          ),
        );
      if (openAssignments.length && !input.reassignOpenWork)
        return {
          blocked: true as const,
          openWork: openAssignments.map((a) => ({
            workId: a.workId,
            title: a.title,
            role: a.role,
          })),
          message: `يوجد ${openAssignments.length} عملًا مفتوحًا. أعد توزيعها أو أكّد المتابعة قبل الإخراج.`,
        };
      const now = new Date();
      await tx
        .update(s.memberProfiles)
        .set({
          status: next,
          statusReason: `${offboardReasonLabels[input.reason]}: ${note}`,
          updatedAt: now,
        })
        .where(eq(s.memberProfiles.userId, input.userId));
      await tx.insert(s.memberStatusHistory).values({
        id: peopleId(),
        userId: input.userId,
        previousStatus: profile.status,
        newStatus: next,
        reason: note,
        changedBy: ctx.user.id,
      });
      // Placement history is closed, never removed.
      await tx
        .update(s.memberCommitteeHistory)
        .set({ endAt: now })
        .where(
          and(
            eq(s.memberCommitteeHistory.userId, input.userId),
            sql`${s.memberCommitteeHistory.endAt} IS NULL`,
          ),
        );
      await tx
        .update(s.memberRoleHistory)
        .set({ endAt: now })
        .where(
          and(
            eq(s.memberRoleHistory.userId, input.userId),
            sql`${s.memberRoleHistory.endAt} IS NULL`,
          ),
        );
      await tx
        .update(s.mentorAssignments)
        .set({ status: "ended", endedAt: now })
        .where(
          and(
            eq(s.mentorAssignments.mentorId, input.userId),
            eq(s.mentorAssignments.status, "active"),
          ),
        );
      // Elevated access ends with the membership; the account itself survives.
      await tx
        .update(s.assignments)
        .set({ active: false, endAt: now })
        .where(and(eq(s.assignments.userId, input.userId), eq(s.assignments.active, true)));
      await tx.insert(s.handovers).values({
        id: peopleId(),
        userId: input.userId,
        kind: "exit",
        notes: `خروج: ${note}`,
        createdBy: ctx.user.id,
      });
      await record(tx, ctx, {
        action: "member.offboarded",
        entityType: "member",
        entityId: input.userId,
        memberId: input.userId,
        metadata: { reason: input.reason, from: profile.status, to: next, note },
      });
      await notify(
        tx,
        input.userId,
        "تحديث حالة العضوية",
        "سُجّل تحديث حالة عضويتك. ملفك محفوظ كسجل مؤسسي.",
      );
      return { blocked: false as const, status: next, openWork: [] };
    },
  );
}

/** Live committee work the member still holds, surfaced during offboarding. */
export async function openWorkFor(userId: string) {
  const rows = await db
    .select({
      id: s.workItems.id,
      title: s.workItems.title,
      kind: s.workItems.kind,
      status: s.workItems.status,
      role: s.workAssignments.role,
      dueAt: s.workItems.dueAt,
    })
    .from(s.workAssignments)
    .innerJoin(s.workItems, eq(s.workItems.id, s.workAssignments.workId))
    .where(
      and(
        eq(s.workAssignments.userId, userId),
        sql`${s.workItems.status} not in ('completed','cancelled','archived','rejected')`,
      ),
    );
  return rows;
}

export async function getWorkForUser(ctx: Identity, workId: string, userId: string) {
  await getWork(ctx, workId);
  return { workId, userId };
}

export { currentPlacements };
