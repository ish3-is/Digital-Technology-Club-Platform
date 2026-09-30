import { and, eq, inArray, sql, asc } from "drizzle-orm";
import { db } from "../../db";
import * as s from "../../db/schema";
import { HttpError, type Identity } from "../services";
import {
  activeTerm,
  grant,
  live,
  actorContext,
  type Connection,
} from "../work/access";
import { emit, createWork } from "../work/engine";
import {
  getEvent,
  eventCan,
  requireEvent,
  eligiblePerson,
  eventOwner,
  type EventRecord,
} from "./access";
import {
  createSchema,
  requirementSchema,
  riskSchema,
  participantSchema,
  reportSchema,
  parseCSV,
  transitions,
  stages,
  stageLabels,
} from "./model";
import { z } from "zod";
const id = () => crypto.randomUUID();
export async function mutateEvent<T>(
  ctx: Identity,
  eventId: string,
  fn: (tx: Connection, e: EventRecord) => Promise<T>,
) {
  const before = await getEvent(ctx, eventId);
  return db.transaction(async (tx) => {
    await activeTerm(before.termId, tx);
    const e = await getEvent(ctx, eventId, tx);
    if (["archived", "cancelled"].includes(e.status))
      throw new HttpError(409, "الفعالية مغلقة");
    return fn(tx, e);
  });
}
async function bump(tx: Connection, e: EventRecord) {
  await tx
    .update(s.workItems)
    .set({ version: e.version + 1, updatedAt: new Date() })
    .where(eq(s.workItems.id, e.id));
}
export async function createEvent(ctx: Identity, input: unknown) {
  const d = createSchema.parse(input);
  await live(ctx);
  return db.transaction(async (tx) => {
    await activeTerm(d.termId, tx);
    if (!grant(ctx, "event.create", d.committeeId, d.termId))
      throw new HttpError(403, "إنشاء الفعالية خارج نطاقك");
    const [committee] = await tx
      .select()
      .from(s.committees)
      .where(eq(s.committees.id, d.committeeId));
    if (!committee?.active) throw new HttpError(422, "اللجنة غير نشطة");
    if (new Date(d.endAt) <= new Date(d.startAt))
      throw new HttpError(422, "النهاية يجب أن تكون بعد البداية");
    await eligiblePerson(d.leadId, d.termId, tx);
    const approver = await eligiblePerson(d.approverId, d.termId, tx);
    if (
      d.approverId === ctx.user.id ||
      d.approverId === d.leadId ||
      !grant(approver, "event.approve", d.committeeId, d.termId) ||
      !grant(approver, "approval.review", d.committeeId, d.termId)
    )
      throw new HttpError(422, "اختر معتمدًا مستقلًا مؤهلًا");
    const [book] = d.playbookId
      ? await tx
          .select()
          .from(s.eventPlaybooks)
          .where(
            and(
              eq(s.eventPlaybooks.id, d.playbookId),
              eq(s.eventPlaybooks.active, true),
            ),
          )
      : [];
    if (d.playbookId && !book) throw new HttpError(422, "القالب غير متاح");
    const [w] = await tx
      .insert(s.workItems)
      .values({
        id: id(),
        kind: "event",
        title: d.title,
        description: d.description,
        termId: d.termId,
        committeeId: d.committeeId,
        createdBy: ctx.user.id,
        status: "idea",
        startAt: new Date(d.startAt),
        dueAt: new Date(d.endAt),
      })
      .returning();
    await tx.insert(s.events).values({
      id: w.id,
      eventType: d.eventType,
      leadId: d.leadId,
      approverId: d.approverId,
      endAt: new Date(d.endAt),
      locationType: d.locationType,
      locationText: d.locationText,
      meetingUrl: d.meetingUrl,
      targetAudience: d.targetAudience,
      capacity: d.capacity,
      registrationUrl: d.registrationUrl,
      plannedBudget: d.plannedBudget,
      reportRequired: d.reportRequired,
      playbookId: book?.id,
      playbookVersion: book?.version,
    });
    await tx.insert(s.eventTeam).values({
      id: id(),
      eventId: w.id,
      userId: d.leadId,
      roleId: "lead",
      committeeId: d.committeeId,
    });
    if (book) {
      for (const r of book.definition.requirements)
        await tx.insert(s.eventRequirements).values({
          id: id(),
          eventId: w.id,
          ...r,
          ownerId: d.leadId,
          dueAt: ["final_report", "archived"].includes(r.gate)
            ? new Date(d.endAt)
            : new Date(d.startAt),
        });
      for (const task of book.definition.tasks)
        await createWork(
          ctx,
          {
            kind: "task",
            title: task.title,
            track: task.category,
            committeeId: d.committeeId,
            termId: d.termId,
            eventId: w.id,
            responsibleId: d.leadId,
            reviewerId: d.approverId,
            dueAt: d.startAt,
          },
          tx,
        );
    }
    await emit(
      tx,
      ctx,
      w,
      "event.created",
      "أنشأ غرفة عمليات الفعالية",
      null,
      { playbook: book?.id, version: book?.version },
      [d.leadId, d.approverId],
    );
    return w;
  });
}
export async function blockers(tx: Connection, e: EventRecord, to: string) {
  const requirements = await tx
    .select()
    .from(s.eventRequirements)
    .where(eq(s.eventRequirements.eventId, e.id));
  const index = stages.indexOf(to as (typeof stages)[number]);
  const reasons = requirements
    .filter(
      (r) =>
        r.required &&
        r.status !== "completed" &&
        stages.indexOf(r.gate as (typeof stages)[number]) <= index,
    )
    .map((r) => r.title);
  if (["ready", "running"].includes(to)) {
    const work = await tx
      .select()
      .from(s.workItems)
      .where(
        and(
          eq(s.workItems.eventId, e.id),
          sql`${s.workItems.kind} in ('task','request') AND ${s.workItems.status} NOT IN ('completed','cancelled','rejected')`,
        ),
      );
    if (work.length)
      reasons.push(`${work.length} مهام أو طلبات مرتبطة لم تكتمل`);
    const risks = await tx
      .select()
      .from(s.eventRisks)
      .where(
        and(
          eq(s.eventRisks.eventId, e.id),
          eq(s.eventRisks.status, "open"),
          eq(s.eventRisks.impact, 3),
        ),
      );
    if (risks.length) reasons.push(`${risks.length} مخاطر مفتوحة عالية الأثر`);
  }
  if (to === "archived" && e.reportRequired) {
    const [r] = await tx
      .select()
      .from(s.eventReports)
      .where(eq(s.eventReports.eventId, e.id));
    if (r?.status !== "approved") reasons.push("التقرير النهائي لم يعتمد");
  }
  return reasons;
}
async function approval(
  tx: Connection,
  ctx: Identity,
  e: EventRecord,
  purpose: string,
) {
  const approver = await actorContext(e.approverId, tx);
  if (
    e.approverId === ctx.user.id ||
    !grant(approver, "event.approve", e.committeeId, e.termId) ||
    !grant(approver, "approval.review", e.committeeId, e.termId)
  )
    throw new HttpError(422, "المعتمد الحالي غير مؤهل أو هو مقدم الطلب");
  const instanceId = id();
  await tx.insert(s.approvalInstances).values({
    id: instanceId,
    workId: e.id,
    requestedBy: ctx.user.id,
    purpose,
  });
  await tx
    .insert(s.approvalSteps)
    .values({ id: id(), instanceId, approverId: e.approverId });
}
export async function transitionEvent(
  ctx: Identity,
  eventId: string,
  input: unknown,
) {
  const d = z
    .object({
      to: z.enum(stages),
      version: z.number().int(),
      reason: z.string().trim().max(1000).optional(),
    })
    .strict()
    .parse(input);
  return mutateEvent(ctx, eventId, async (tx, e) => {
    if (e.version !== d.version)
      throw new HttpError(409, "تغيرت الفعالية؛ حدّث العرض");
    if (d.to !== "cancelled" && !transitions[e.status]?.includes(d.to))
      throw new HttpError(422, "انتقال المرحلة غير مسموح");
    const permission =
      d.to === "cancelled"
        ? "event.cancel"
        : d.to === "archived"
          ? "event.archive"
          : d.to === "pending_approval"
            ? "event.submit"
            : "event.update";
    await requireEvent(ctx, e, permission, tx);
    const reasons = d.to === "cancelled" ? [] : await blockers(tx, e, d.to);
    if (reasons.length) {
      if (
        !d.reason ||
        d.reason.length < 5 ||
        !(await eventCan(ctx, e, "event.override_stage", tx))
      )
        throw new HttpError(409, `لا يمكن الانتقال: ${reasons.join("، ")}`);
      await emit(
        tx,
        ctx,
        e,
        "event.stage_overridden",
        "تجاوز متطلبات المرحلة بسبب موثق",
        { blockers: reasons },
        { reason: d.reason, to: d.to },
      );
    }
    if (d.to === "pending_approval") await approval(tx, ctx, e, "event");
    if (d.to === "cancelled") {
      const pending = await tx
        .select()
        .from(s.approvalInstances)
        .where(
          and(
            eq(s.approvalInstances.workId, e.id),
            eq(s.approvalInstances.status, "pending"),
          ),
        );
      for (const p of pending) {
        await tx
          .update(s.approvalInstances)
          .set({ status: "cancelled", decidedAt: new Date() })
          .where(eq(s.approvalInstances.id, p.id));
        await tx
          .update(s.approvalSteps)
          .set({ decision: "cancelled", decidedAt: new Date() })
          .where(eq(s.approvalSteps.instanceId, p.id));
      }
    }
    await tx
      .update(s.workItems)
      .set({
        status: d.to,
        version: e.version + 1,
        updatedAt: new Date(),
        completedAt: d.to === "archived" ? new Date() : null,
      })
      .where(eq(s.workItems.id, e.id));
    await emit(
      tx,
      ctx,
      e,
      "event.stage_changed",
      `انتقل إلى ${stageLabels[d.to]}`,
      { status: e.status },
      { status: d.to },
      [e.leadId, e.approverId],
    );
    return { ok: true };
  });
}
export async function reviewEvent(
  ctx: Identity,
  eventId: string,
  input: unknown,
) {
  const d = z
    .object({
      decision: z.enum(["approved", "changes_requested", "rejected"]),
      comment: z.string().trim().min(2).max(2000),
      version: z.number().int(),
    })
    .strict()
    .parse(input);
  return mutateEvent(ctx, eventId, async (tx, e) => {
    if (e.version !== d.version) throw new HttpError(409, "تغيرت الفعالية");
    await requireEvent(ctx, e, "event.approve", tx);
    if (!grant(ctx, "approval.review", e.committeeId, e.termId))
      throw new HttpError(403, "لا تملك صلاحية المراجعة");
    const [p] = await tx
      .select()
      .from(s.approvalInstances)
      .where(
        and(
          eq(s.approvalInstances.workId, e.id),
          eq(s.approvalInstances.status, "pending"),
        ),
      );
    const [step] = p
      ? await tx
          .select()
          .from(s.approvalSteps)
          .where(eq(s.approvalSteps.instanceId, p.id))
      : [];
    if (!p || step?.approverId !== ctx.user.id || p.requestedBy === ctx.user.id)
      throw new HttpError(403, "للمعتمد المحدد المستقل فقط");
    await tx
      .update(s.approvalInstances)
      .set({ status: d.decision, decidedAt: new Date() })
      .where(eq(s.approvalInstances.id, p.id));
    await tx
      .update(s.approvalSteps)
      .set({ decision: d.decision, comment: d.comment, decidedAt: new Date() })
      .where(eq(s.approvalSteps.id, step.id));
    if (p.purpose === "report")
      await tx
        .update(s.eventReports)
        .set({ status: d.decision, updatedAt: new Date() })
        .where(eq(s.eventReports.eventId, e.id));
    else
      await tx
        .update(s.workItems)
        .set({
          status:
            d.decision === "approved"
              ? "approved"
              : d.decision === "rejected"
                ? "cancelled"
                : "planning",
        })
        .where(eq(s.workItems.id, e.id));
    await bump(tx, e);
    await emit(
      tx,
      ctx,
      e,
      `event.${p.purpose}_reviewed`,
      d.decision === "approved"
        ? "اعتمد الطلب"
        : d.decision === "rejected"
          ? "رفض الطلب"
          : "طلب تعديلات",
      null,
      { decision: d.decision, comment: d.comment },
      [e.leadId, p.requestedBy],
    );
    return { ok: true };
  });
}
export async function saveRequirement(
  ctx: Identity,
  eventId: string,
  input: unknown,
) {
  const d = requirementSchema.parse(input);
  return mutateEvent(ctx, eventId, async (tx, e) => {
    await requireEvent(ctx, e, "event.manage_readiness", tx);
    if (
      stages.indexOf(d.gate as (typeof stages)[number]) <=
      stages.indexOf(e.status as (typeof stages)[number])
    )
      throw new HttpError(
        409,
        "بنية متطلبات المرحلة السابقة مقفلة؛ أضف متطلبًا لمرحلة لاحقة",
      );
    await eventOwner(d.ownerId, e, tx);
    if (d.id) {
      const [old] = await tx
        .select()
        .from(s.eventRequirements)
        .where(
          and(
            eq(s.eventRequirements.id, d.id),
            eq(s.eventRequirements.eventId, e.id),
          ),
        );
      if (!old) throw new HttpError(404, "المتطلب غير متاح");
      if (
        stages.indexOf(old.gate as (typeof stages)[number]) <=
        stages.indexOf(e.status as (typeof stages)[number])
      )
        throw new HttpError(409, "لا يمكن تغيير متطلب مرحلة تم تجاوزها");
    }
    await tx
      .insert(s.eventRequirements)
      .values({
        ...d,
        id: d.id || id(),
        eventId: e.id,
        dueAt: d.dueAt ? new Date(d.dueAt) : null,
      })
      .onConflictDoUpdate({
        target: s.eventRequirements.id,
        set: { ...d, dueAt: d.dueAt ? new Date(d.dueAt) : null },
      });
    await bump(tx, e);
    await emit(
      tx,
      ctx,
      e,
      "event.requirement_saved",
      "حدّث متطلبات الجاهزية",
      null,
      { title: d.title, status: d.status },
      [d.ownerId],
    );
    return { ok: true };
  });
}
export async function completeRequirement(
  ctx: Identity,
  eventId: string,
  input: unknown,
) {
  const d = z
    .object({
      id: z.string(),
      completed: z.boolean(),
      evidence: z.string().max(2000).default(""),
    })
    .strict()
    .parse(input);
  return mutateEvent(ctx, eventId, async (tx, e) => {
    const [r] = await tx
      .select()
      .from(s.eventRequirements)
      .where(
        and(
          eq(s.eventRequirements.id, d.id),
          eq(s.eventRequirements.eventId, e.id),
        ),
      );
    if (!r) throw new HttpError(404, "المتطلب غير متاح");
    if (r.ownerId !== ctx.user.id)
      await requireEvent(ctx, e, "event.manage_readiness", tx);
    if (
      !d.completed &&
      stages.indexOf(r.gate as (typeof stages)[number]) <=
        stages.indexOf(e.status as (typeof stages)[number])
    )
      throw new HttpError(409, "لا يمكن إلغاء متطلب مرحلة تم تجاوزها");
    await tx
      .update(s.eventRequirements)
      .set({
        status: d.completed ? "completed" : "pending",
        evidence: d.evidence,
      })
      .where(eq(s.eventRequirements.id, r.id));
    await bump(tx, e);
    await emit(
      tx,
      ctx,
      e,
      "event.readiness_changed",
      d.completed ? "أكمل متطلب جاهزية" : "أعاد فتح متطلب",
      null,
      { title: r.title },
      [e.leadId],
    );
    return { ok: true };
  });
}
export async function saveRisk(ctx: Identity, eventId: string, input: unknown) {
  const d = riskSchema.parse(input);
  return mutateEvent(ctx, eventId, async (tx, e) => {
    await requireEvent(ctx, e, "event.update", tx);
    await eventOwner(d.ownerId, e, tx);
    if (d.id) {
      const [r] = await tx
        .select()
        .from(s.eventRisks)
        .where(and(eq(s.eventRisks.id, d.id), eq(s.eventRisks.eventId, e.id)));
      if (!r) throw new HttpError(404, "الخطر غير متاح");
    }
    await tx
      .insert(s.eventRisks)
      .values({ ...d, id: d.id || id(), eventId: e.id })
      .onConflictDoUpdate({ target: s.eventRisks.id, set: d });
    await emit(
      tx,
      ctx,
      e,
      "event.risk_saved",
      "حدّث سجل المخاطر",
      null,
      { title: d.title, status: d.status },
      [d.ownerId],
    );
    return { ok: true };
  });
}
export async function resolveRisk(
  ctx: Identity,
  eventId: string,
  input: unknown,
) {
  const d = z
    .object({
      id: z.string(),
      mitigation: z.string().trim().min(2).max(2000),
      status: z.enum(["mitigating", "closed"]),
    })
    .strict()
    .parse(input);
  return mutateEvent(ctx, eventId, async (tx, e) => {
    const [r] = await tx
      .select()
      .from(s.eventRisks)
      .where(and(eq(s.eventRisks.id, d.id), eq(s.eventRisks.eventId, e.id)));
    if (!r) throw new HttpError(404, "الخطر غير متاح");
    if (r.ownerId !== ctx.user.id)
      await requireEvent(ctx, e, "event.update", tx);
    await tx
      .update(s.eventRisks)
      .set({ mitigation: d.mitigation, status: d.status })
      .where(eq(s.eventRisks.id, r.id));
    await emit(tx, ctx, e, "event.risk_resolved", "وثّق معالجة خطر", null, {
      id: r.id,
      status: d.status,
    });
    return { ok: true };
  });
}
export async function saveTeam(ctx: Identity, eventId: string, input: unknown) {
  const d = z
    .object({
      userId: z.string(),
      roleId: z.string(),
      committeeId: z.string().nullable().optional(),
      startAt: z.iso.datetime({ offset: true }),
      endAt: z.iso.datetime({ offset: true }).nullable().optional(),
    })
    .strict()
    .parse(input);
  return mutateEvent(ctx, eventId, async (tx, e) => {
    await requireEvent(ctx, e, "event.manage_team", tx);
    const p = await eligiblePerson(d.userId, e.termId, tx);
    if (d.committeeId && !grant(p, "event.read", d.committeeId, e.termId))
      throw new HttpError(422, "اللجنة لا تطابق تعيين العضو");
    const [role] = await tx
      .select()
      .from(s.eventRoles)
      .where(eq(s.eventRoles.id, d.roleId));
    if (!role) throw new HttpError(422, "دور الفعالية غير متاح");
    if (d.endAt && new Date(d.endAt) <= new Date(d.startAt))
      throw new HttpError(422, "نهاية التعيين تسبق بدايته");
    if (d.roleId === "lead" && d.userId !== e.leadId)
      throw new HttpError(422, "قائد الفعالية محدد عند الإنشاء");
    await tx
      .insert(s.eventTeam)
      .values({
        ...d,
        id: id(),
        eventId: e.id,
        startAt: new Date(d.startAt),
        endAt: d.endAt ? new Date(d.endAt) : null,
      })
      .onConflictDoUpdate({
        target: [s.eventTeam.eventId, s.eventTeam.userId, s.eventTeam.roleId],
        set: {
          committeeId: d.committeeId,
          startAt: new Date(d.startAt),
          endAt: d.endAt ? new Date(d.endAt) : null,
        },
      });
    await emit(
      tx,
      ctx,
      e,
      "event.team_assigned",
      "حدّث فريق الفعالية",
      null,
      { userId: d.userId, roleId: d.roleId },
      [d.userId],
    );
    return { ok: true };
  });
}
export async function registerParticipants(
  ctx: Identity,
  eventId: string,
  input: unknown,
) {
  const d = z
    .object({
      participants: z.array(participantSchema).max(500).optional(),
      csv: z.string().max(200000).optional(),
    })
    .strict()
    .parse(input);
  let rows: ReturnType<typeof participantSchema.parse>[];
  try {
    rows = d.csv !== undefined ? parseCSV(d.csv) : d.participants || [];
  } catch {
    throw new HttpError(422, "ملف CSV غير صالح؛ تحقق من الأعمدة والقيم");
  }
  if (!rows.length) throw new HttpError(422, "أضف مشاركًا");
  return mutateEvent(ctx, eventId, async (tx, e) => {
    await requireEvent(ctx, e, "event.manage_participants", tx);
    if (
      ![
        "registration_open",
        "preparing",
        "ready",
        "running",
        "evaluation",
      ].includes(e.status)
    )
      throw new HttpError(409, "التسجيل غير متاح في هذه المرحلة");
    if (rows.some((r) => r.status !== "registered"))
      await requireEvent(ctx, e, "event.manage_attendance", tx);
    const existing = await tx
      .select()
      .from(s.eventParticipants)
      .where(eq(s.eventParticipants.eventId, e.id));
    if (e.capacity && existing.length + rows.length > e.capacity)
      throw new HttpError(409, "تجاوز السعة المحددة");
    const emails = new Set(
      existing.map((p) => p.email?.toLowerCase()).filter(Boolean),
    );
    const uids = new Set(existing.map((p) => p.universityId).filter(Boolean));
    for (const r of rows) {
      const email = r.email?.toLowerCase() || null;
      const universityId = r.universityId || null;
      if (
        (email && emails.has(email)) ||
        (universityId && uids.has(universityId))
      )
        throw new HttpError(409, "مشارك مكرر داخل الفعالية");
      if (email) emails.add(email);
      if (universityId) uids.add(universityId);
      const participantId = id();
      await tx.insert(s.eventParticipants).values({
        id: participantId,
        eventId: e.id,
        name: r.name,
        email,
        phone: r.phone,
        universityId,
        major: r.major,
        registrationSource: d.csv !== undefined ? "import" : "manual",
      });
      await tx.insert(s.eventAttendance).values({
        participantId,
        eventId: e.id,
        status: r.status,
        checkInAt: r.status === "present" ? new Date() : null,
        recordedBy: ctx.user.id,
        source: d.csv !== undefined ? "import" : "manual",
      });
    }
    await emit(
      tx,
      ctx,
      e,
      "event.participants_registered",
      "أضاف تسجيلات مشاركين",
      null,
      { count: rows.length },
    );
    return { count: rows.length };
  });
}
export async function recordAttendance(
  ctx: Identity,
  eventId: string,
  input: unknown,
) {
  const d = z
    .object({
      participantId: z.string(),
      status: z.enum(["registered", "present", "absent", "cancelled"]),
    })
    .strict()
    .parse(input);
  return mutateEvent(ctx, eventId, async (tx, e) => {
    await requireEvent(ctx, e, "event.manage_attendance", tx);
    if (
      ![
        "registration_open",
        "preparing",
        "ready",
        "running",
        "evaluation",
      ].includes(e.status)
    )
      throw new HttpError(409, "الحضور مغلق في هذه المرحلة");
    const [p] = await tx
      .select()
      .from(s.eventParticipants)
      .where(
        and(
          eq(s.eventParticipants.id, d.participantId),
          eq(s.eventParticipants.eventId, e.id),
        ),
      );
    if (!p) throw new HttpError(404, "المشارك غير متاح");
    const [before] = await tx
      .select()
      .from(s.eventAttendance)
      .where(eq(s.eventAttendance.participantId, p.id));
    await tx
      .update(s.eventAttendance)
      .set({
        status: d.status,
        checkInAt:
          d.status === "present" ? before.checkInAt || new Date() : null,
        recordedBy: ctx.user.id,
        source: "manual",
        updatedAt: new Date(),
      })
      .where(eq(s.eventAttendance.participantId, p.id));
    await emit(
      tx,
      ctx,
      e,
      "event.attendance_recorded",
      "حدّث الحضور",
      { participantId: p.id, status: before.status },
      { participantId: p.id, status: d.status },
    );
    return { ok: true };
  });
}
export async function saveReport(
  ctx: Identity,
  eventId: string,
  input: unknown,
) {
  const d = reportSchema.parse(input);
  return mutateEvent(ctx, eventId, async (tx, e) => {
    await requireEvent(ctx, e, "event.update", tx);
    if (!["evaluation", "final_report"].includes(e.status))
      throw new HttpError(409, "التقرير متاح بعد التنفيذ");
    const [old] = await tx
      .select()
      .from(s.eventReports)
      .where(eq(s.eventReports.eventId, e.id));
    if (old && ["pending", "approved"].includes(old.status))
      throw new HttpError(409, "التقرير مقدم أو معتمد؛ لا يمكن تعديله");
    await tx
      .insert(s.eventReports)
      .values({ ...d, eventId: e.id, updatedBy: ctx.user.id })
      .onConflictDoUpdate({
        target: s.eventReports.eventId,
        set: {
          ...d,
          status: "draft",
          updatedBy: ctx.user.id,
          updatedAt: new Date(),
        },
      });
    await bump(tx, e);
    await emit(
      tx,
      ctx,
      e,
      "event.report_saved",
      "حفظ التقرير والدروس المستفادة",
    );
    return { ok: true };
  });
}
export async function submitReport(ctx: Identity, eventId: string) {
  return mutateEvent(ctx, eventId, async (tx, e) => {
    await requireEvent(ctx, e, "event.submit", tx);
    if (e.status !== "final_report")
      throw new HttpError(409, "انتقل إلى مرحلة التقرير النهائي");
    const [r] = await tx
      .select()
      .from(s.eventReports)
      .where(eq(s.eventReports.eventId, e.id));
    if (!r || ["pending", "approved"].includes(r.status))
      throw new HttpError(409, "التقرير غير جاهز للتقديم");
    await approval(tx, ctx, e, "report");
    await tx
      .update(s.eventReports)
      .set({ status: "pending" })
      .where(eq(s.eventReports.eventId, e.id));
    await bump(tx, e);
    await emit(
      tx,
      ctx,
      e,
      "event.report_submitted",
      "قدم التقرير للمراجعة",
      null,
      null,
      [e.approverId],
    );
    return { ok: true };
  });
}
export async function updateEvent(
  ctx: Identity,
  eventId: string,
  input: unknown,
) {
  const money = z.number().int().min(0).max(100000000).nullable().optional();
  const d = z
    .object({
      title: z.string().min(2).max(160).optional(),
      description: z.string().max(6000).optional(),
      plannedBudget: money,
      approvedBudget: money,
      actualSpend: money,
      version: z.number().int(),
    })
    .strict()
    .parse(input);
  return mutateEvent(ctx, eventId, async (tx, e) => {
    if (d.version !== e.version) throw new HttpError(409, "تغيرت الفعالية");
    if (d.title !== undefined || d.description !== undefined) {
      await requireEvent(ctx, e, "event.update", tx);
      if (!["idea", "planning"].includes(e.status))
        throw new HttpError(409, "وصف الفعالية مقفل بعد تقديم الاعتماد");
      await tx
        .update(s.workItems)
        .set({ title: d.title, description: d.description })
        .where(eq(s.workItems.id, e.id));
    }
    if (
      d.plannedBudget !== undefined ||
      d.approvedBudget !== undefined ||
      d.actualSpend !== undefined
    ) {
      await requireEvent(ctx, e, "event.manage_budget", tx);
      const [report] = await tx
        .select()
        .from(s.eventReports)
        .where(eq(s.eventReports.eventId, e.id));
      if (report && ["pending", "approved"].includes(report.status))
        throw new HttpError(
          409,
          "الميزانية مقفلة مع التقرير المقدم أو المعتمد",
        );
      await tx
        .update(s.events)
        .set({
          plannedBudget: d.plannedBudget,
          approvedBudget: d.approvedBudget,
          actualSpend: d.actualSpend,
        })
        .where(eq(s.events.id, e.id));
    }
    await bump(tx, e);
    await emit(tx, ctx, e, "event.updated", "حدّث بيانات الفعالية", null, d);
    return { ok: true };
  });
}
