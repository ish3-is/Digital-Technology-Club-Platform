import { and, eq, ne, inArray, sql, desc, asc } from "drizzle-orm";
import { db } from "../../db";
import * as s from "../../db/schema";
import { HttpError, type Identity } from "../services";
import { createSchema, stateLabels, transitionMap, type Kind } from "./model";
import {
  getWork,
  activeTerm,
  grant,
  editable,
  live,
  actorContext,
  canReadPerson,
  accessWhere,
  type Connection,
  type Work,
} from "./access";
const id = () => crypto.randomUUID();
export async function emit(
  tx: Connection,
  ctx: Identity,
  w: Work,
  action: string,
  label: string,
  before: unknown = null,
  after: unknown = null,
  recipients: string[] = [],
) {
  await tx.insert(s.workEvents).values({
    id: id(),
    workId: w.id,
    actorId: ctx.user.id,
    action,
    label: `${ctx.user.name}: ${label}`,
  });
  // Personal activity avoids leaking private cross-committee work through the foundation feed.
  await tx.insert(s.activities).values({
    id: id(),
    actorId: ctx.user.id,
    ownerId: ctx.user.id,
    action,
    entityType: w.kind,
    entityId: w.id,
    metadata: { label },
  });
  await tx.insert(s.auditLogs).values({
    id: id(),
    actorId: ctx.user.id,
    action,
    entityType: w.kind,
    entityId: w.id,
    previousValue: before,
    newValue: after,
    sessionId: ctx.sessionId,
  });
  for (const userId of new Set(recipients))
    if (await canReadPerson(userId, w, tx))
      await tx.insert(s.notifications).values({
        id: id(),
        userId,
        title: label,
        body: w.title,
        workId: w.id,
      });
}
async function peopleOn(tx: Connection, workId: string) {
  return (
    await tx
      .select()
      .from(s.workAssignments)
      .where(eq(s.workAssignments.workId, workId))
  ).map((x) => x.userId);
}
async function ensurePerson(
  tx: Connection,
  w: Work,
  userId: string,
  permission?: string,
  committeeId = w.committeeId,
) {
  if (!(await canReadPerson(userId, w, tx)))
    throw new HttpError(422, "الشخص المحدد لا يحق له الاطلاع على هذا العنصر");
  const ctx = await actorContext(userId, tx);
  if (permission && !grant(ctx, permission, committeeId, w.termId, w.createdBy))
    throw new HttpError(422, "المراجع لا يملك صلاحية الاعتماد في هذا النطاق");
  return ctx;
}
export async function createWork(
  ctx: Identity,
  input: unknown,
  connection?: Connection,
) {
  const data = createSchema.parse(input);
  if (data.kind === "event")
    throw new HttpError(422, "أنشئ الفعالية من غرفة العمليات");
  await live(ctx, connection || db);
  const run = async (tx: Connection) => {
    await activeTerm(data.termId, tx);
    let committeeId = data.committeeId || null;
    let eventId = data.eventId || null;
    let inheritedEvent = false;
    let source: Work | undefined;
    if (data.sourceId) {
      source = await getWork(ctx, data.sourceId, tx);
      eventId = source.eventId;
      inheritedEvent = true;
      if (
        data.kind !== "task" ||
        !["request", "decision"].includes(source.kind) ||
        source.termId !== data.termId
      )
        throw new HttpError(422, "مصدر المهمة غير صالح");
      if (source.kind === "request") {
        const [req] = await tx
          .select()
          .from(s.requests)
          .where(eq(s.requests.id, source.id));
        committeeId = req.receivingCommitteeId;
        if (!grant(ctx, "request.update", committeeId, source.termId))
          throw new HttpError(403, "لا يمكنك تحويل هذا الطلب");
      } else committeeId = source.committeeId;
    }
    if (data.kind === "decision") {
      if (!data.meetingId) throw new HttpError(422, "الاجتماع مطلوب");
      const meeting = await getWork(ctx, data.meetingId, tx);
      if (
        meeting.kind !== "meeting" ||
        meeting.status === "cancelled" ||
        meeting.termId !== data.termId
      )
        throw new HttpError(422, "الاجتماع غير متاح لتسجيل قرار");
      committeeId = meeting.committeeId;
      eventId = meeting.eventId;
      inheritedEvent = true;
    }
    if (eventId) {
      const { getEvent } = await import("../events/access");
      const event = inheritedEvent
        ? (
            await tx
              .select()
              .from(s.workItems)
              .where(
                and(eq(s.workItems.id, eventId), eq(s.workItems.kind, "event")),
              )
          )[0]
        : await getEvent(ctx, eventId, tx);
      if (
        !event ||
        event.termId !== data.termId ||
        ["archived", "cancelled"].includes(event.status)
      )
        throw new HttpError(422, "سياق الفعالية غير متاح");
    }
    if (
      !grant(ctx, `${data.kind}.create`, committeeId, data.termId, ctx.user.id)
    )
      throw new HttpError(403, "لا تملك صلاحية الإنشاء في هذا النطاق");
    if (committeeId) {
      const [c] = await tx
        .select()
        .from(s.committees)
        .where(eq(s.committees.id, committeeId));
      if (!c?.active) throw new HttpError(422, "اللجنة غير نشطة");
    }
    if (data.kind === "request") {
      if (
        !committeeId ||
        !data.receivingCommitteeId ||
        committeeId === data.receivingCommitteeId
      )
        throw new HttpError(422, "حدد لجنتين مختلفتين");
      const [c] = await tx
        .select()
        .from(s.committees)
        .where(eq(s.committees.id, data.receivingCommitteeId));
      if (!c?.active) throw new HttpError(422, "اللجنة المستلمة غير متاحة");
    }
    if (
      data.kind === "meeting" &&
      (!data.startAt ||
        !data.endAt ||
        new Date(data.endAt) <= new Date(data.startAt))
    )
      throw new HttpError(422, "حدد بداية الاجتماع ونهايته بصورة صحيحة");
    if (
      data.startAt &&
      data.dueAt &&
      new Date(data.dueAt) < new Date(data.startAt)
    )
      throw new HttpError(422, "الموعد يسبق البداية");
    const [w] = await tx
      .insert(s.workItems)
      .values({
        id: id(),
        kind: data.kind,
        eventId,
        track: data.track,
        title: data.title,
        description: data.description,
        committeeId,
        termId: data.termId,
        priority: data.priority,
        status: {
          task: "not_started",
          request: "new",
          meeting: "scheduled",
          decision: "recorded",
          event: "idea",
        }[data.kind],
        createdBy: ctx.user.id,
        startAt: data.startAt ? new Date(data.startAt) : null,
        dueAt:
          data.kind === "meeting"
            ? new Date(data.startAt!)
            : data.dueAt
              ? new Date(data.dueAt)
              : null,
      })
      .returning();
    if (data.kind === "task") await tx.insert(s.tasks).values({ id: w.id });
    if (data.kind === "request")
      await tx
        .insert(s.requests)
        .values({ id: w.id, receivingCommitteeId: data.receivingCommitteeId! });
    if (data.kind === "meeting")
      await tx.insert(s.meetings).values({
        id: w.id,
        endAt: new Date(data.endAt!),
        location: data.location,
        agenda: data.agenda,
      });
    if (data.kind === "decision")
      await tx.insert(s.decisions).values({
        id: w.id,
        meetingId: data.meetingId!,
        decidedBy: ctx.user.id,
      });
    if (source)
      await tx.insert(s.taskSources).values({
        taskId: w.id,
        requestId: source.kind === "request" ? source.id : null,
        decisionId: source.kind === "decision" ? source.id : null,
      });
    if (data.kind === "task") {
      const responsible = data.responsibleId || ctx.user.id;
      if (
        responsible !== ctx.user.id &&
        !grant(ctx, "task.assign", committeeId, w.termId)
      )
        throw new HttpError(403, "لا تملك صلاحية تعيين الآخرين");
      if (!data.reviewerId || data.reviewerId === responsible)
        throw new HttpError(422, "حدد مراجعًا مختلفًا عن المسؤول");
      for (const [userId, role] of [
        [responsible, "responsible"],
        [data.reviewerId, "reviewer"],
        ...data.participantIds.map((p) => [p, "participant"]),
      ]) {
        await ensurePerson(
          tx,
          w,
          userId,
          role === "reviewer" ? "task.review" : undefined,
        );
        if (role === "reviewer")
          await ensurePerson(tx, w, userId, "approval.review");
        if (
          role === "participant" &&
          !grant(ctx, "task.assign", committeeId, w.termId)
        )
          throw new HttpError(403, "لا تملك صلاحية تعيين المشاركين");
        await tx
          .insert(s.workAssignments)
          .values({ id: id(), workId: w.id, userId, role })
          .onConflictDoNothing();
      }
    }
    if (data.kind === "request") {
      const reviewer = data.reviewerId || ctx.user.id;
      await ensurePerson(tx, w, reviewer, "request.complete", committeeId);
      await ensurePerson(tx, w, reviewer, "approval.review", committeeId);
      await tx
        .insert(s.workAssignments)
        .values({ id: id(), workId: w.id, userId: reviewer, role: "reviewer" });
    }
    if (data.kind === "meeting")
      for (const userId of new Set(data.attendeeIds)) {
        await ensurePerson(tx, w, userId);
        await tx
          .insert(s.workAssignments)
          .values({ id: id(), workId: w.id, userId, role: "attendee" });
      }
    const recipients = await peopleOn(tx, w.id);
    if (data.kind === "request") {
      const users = await tx
        .select({ id: s.user.id })
        .from(s.user)
        .where(eq(s.user.active, true));
      for (const u of users) {
        const person = await actorContext(u.id, tx);
        if (
          grant(person, "request.accept", data.receivingCommitteeId!, w.termId)
        )
          recipients.push(u.id);
      }
    }
    await emit(
      tx,
      ctx,
      w,
      `${w.kind}.created`,
      "أنشأ عنصر العمل",
      null,
      { title: w.title, status: w.status },
      recipients,
    );
    if (source)
      await emit(tx, ctx, source, "task.linked", "أنشأ مهمة مرتبطة", null, {
        taskId: w.id,
      });
    return w;
  };
  return connection ? run(connection) : db.transaction(run);
}
// All work mutations acquire the term lock first. This serializes dependency graph edits
// and transitions within a term, including across multiple PostgreSQL application workers.
async function mutate<T>(
  ctx: Identity,
  workId: string,
  fn: (tx: Connection, w: Work) => Promise<T>,
) {
  const visible = await getWork(ctx, workId);
  if (visible.kind === "event")
    throw new HttpError(422, "استخدم إجراءات غرفة عمليات الفعالية");
  return db.transaction(async (tx) => {
    await activeTerm(visible.termId, tx);
    const w = await getWork(ctx, workId, tx);
    return fn(tx, w);
  });
}
function version(w: Work, expected: number) {
  if (w.version !== expected)
    throw new HttpError(409, "تغير العنصر منذ فتحه. حدّث العرض وأعد المحاولة");
}
export async function transition(
  ctx: Identity,
  workId: string,
  to: string,
  expectedVersion: number,
) {
  return mutate(ctx, workId, async (tx, w) => {
    version(w, expectedVersion);
    if (!transitionMap[w.kind]?.[w.status]?.includes(to))
      throw new HttpError(422, "انتقال الحالة غير مسموح");
    if (w.kind === "task") {
      if (!(await editable(ctx, w, tx)))
        throw new HttpError(403, "لا يمكنك تغيير هذه المهمة");
      if (
        ["completed", "cancelled"].includes(w.status) &&
        !grant(ctx, "task.update", w.committeeId, w.termId)
      )
        throw new HttpError(403, "إعادة الفتح متاحة لمسؤول اللجنة");
    }
    if (w.kind === "request") {
      const [r] = await tx
        .select()
        .from(s.requests)
        .where(eq(s.requests.id, w.id));
      const sending =
        grant(ctx, "request.create", w.committeeId, w.termId, w.createdBy) &&
        w.createdBy === ctx.user.id;
      const receiving = grant(
        ctx,
        to === "received" || to === "rejected"
          ? "request.accept"
          : "request.update",
        r.receivingCommitteeId,
        w.termId,
      );
      if (!(to === "cancelled" ? sending || receiving : receiving))
        throw new HttpError(403, "الإجراء يتطلب صلاحية اللجنة المستلمة");
      if (to === "received") {
        await tx
          .insert(s.workAssignments)
          .values({
            id: id(),
            workId: w.id,
            userId: ctx.user.id,
            role: "responsible",
          })
          .onConflictDoNothing();
      }
    }
    if (
      (w.kind === "meeting" &&
        !grant(ctx, "meeting.update", w.committeeId, w.termId, w.createdBy)) ||
      (w.kind === "decision" &&
        !grant(ctx, "decision.create", w.committeeId, w.termId, w.createdBy))
    )
      throw new HttpError(403, "لا تملك صلاحية تغيير هذا العنصر");
    if (to === "review") {
      const [reviewer] = await tx
        .select()
        .from(s.workAssignments)
        .where(
          and(
            eq(s.workAssignments.workId, w.id),
            eq(s.workAssignments.role, "reviewer"),
          ),
        );
      if (!reviewer) throw new HttpError(422, "عيّن مراجعًا أولًا");
      if (reviewer.userId === ctx.user.id)
        throw new HttpError(422, "المراجع لا يطلب اعتماد عمله بنفسه");
      await ensurePerson(
        tx,
        w,
        reviewer.userId,
        w.kind === "task" ? "task.review" : "request.complete",
      );
      await ensurePerson(tx, w, reviewer.userId, "approval.review");
      const approvalId = id();
      await tx
        .insert(s.approvalInstances)
        .values({ id: approvalId, workId: w.id, requestedBy: ctx.user.id });
      await tx.insert(s.approvalSteps).values({
        id: id(),
        instanceId: approvalId,
        approverId: reviewer.userId,
      });
    }
    if (w.status === "review") {
      const pending = await tx
        .select()
        .from(s.approvalInstances)
        .where(
          and(
            eq(s.approvalInstances.workId, w.id),
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
    const [after] = await tx
      .update(s.workItems)
      .set({
        status: to,
        version: w.version + 1,
        updatedAt: new Date(),
        completedAt: null,
      })
      .where(eq(s.workItems.id, w.id))
      .returning();
    if (w.kind === "task" && w.status === "completed")
      await tx.update(s.tasks).set({ progress: 0 }).where(eq(s.tasks.id, w.id));
    await emit(
      tx,
      ctx,
      w,
      `${w.kind}.status_changed`,
      `غيّر الحالة إلى «${stateLabels[to]}»`,
      { status: w.status },
      { status: to },
      await peopleOn(tx, w.id),
    );
    return after;
  });
}
export async function review(
  ctx: Identity,
  workId: string,
  decision: "approved" | "rejected" | "changes_requested",
  comment: string,
  expectedVersion: number,
  overrideReason?: string,
) {
  return mutate(ctx, workId, async (tx, w) => {
    version(w, expectedVersion);
    if (w.status !== "review") throw new HttpError(409, "لا يوجد اعتماد معلق");
    const [instance] = await tx
      .select()
      .from(s.approvalInstances)
      .where(
        and(
          eq(s.approvalInstances.workId, w.id),
          eq(s.approvalInstances.status, "pending"),
        ),
      );
    if (!instance) throw new HttpError(409, "الاعتماد غير متاح");
    const [step] = await tx
      .select()
      .from(s.approvalSteps)
      .where(
        and(
          eq(s.approvalSteps.instanceId, instance.id),
          eq(s.approvalSteps.approverId, ctx.user.id),
          eq(s.approvalSteps.decision, "pending"),
        ),
      );
    if (
      !step ||
      instance.requestedBy === ctx.user.id ||
      !grant(ctx, "approval.review", w.committeeId, w.termId) ||
      !grant(
        ctx,
        w.kind === "task" ? "task.review" : "request.complete",
        w.committeeId,
        w.termId,
      )
    )
      throw new HttpError(403, "القرار للمراجع المحدد فقط");
    if (decision !== "approved" && !comment.trim())
      throw new HttpError(422, "سبب القرار مطلوب");
    if (decision === "approved" && w.kind === "task") {
      const blockers = await tx
        .select({ id: s.workItems.id, status: s.workItems.status })
        .from(s.taskDependencies)
        .innerJoin(
          s.workItems,
          eq(s.workItems.id, s.taskDependencies.blockerId),
        )
        .where(
          and(
            eq(s.taskDependencies.taskId, w.id),
            ne(s.workItems.status, "completed"),
          ),
        );
      if (blockers.length) {
        if (!overrideReason?.trim())
          throw new HttpError(
            409,
            "هذه المهمة متوقفة: توجد اعتمادية غير مكتملة",
          );
        if (!grant(ctx, "task.override_dependency", w.committeeId, w.termId))
          throw new HttpError(403, "تجاوز الاعتمادية يحتاج صلاحية صريحة");
        await emit(
          tx,
          ctx,
          w,
          "task.dependency_overridden",
          "تجاوز اعتماديات المهمة بسبب موثق",
          { blockers: blockers.map((b) => b.id) },
          { reason: overrideReason },
        );
      }
    }
    const next =
      decision === "approved"
        ? "completed"
        : decision === "rejected" && w.kind === "request"
          ? "rejected"
          : "in_progress";
    await tx
      .update(s.approvalInstances)
      .set({ status: decision, decidedAt: new Date() })
      .where(eq(s.approvalInstances.id, instance.id));
    await tx
      .update(s.approvalSteps)
      .set({ decision, comment, decidedAt: new Date() })
      .where(eq(s.approvalSteps.id, step.id));
    const [after] = await tx
      .update(s.workItems)
      .set({
        status: next,
        version: w.version + 1,
        updatedAt: new Date(),
        completedAt: next === "completed" ? new Date() : null,
      })
      .where(eq(s.workItems.id, w.id))
      .returning();
    if (w.kind === "task" && next === "completed")
      await tx
        .update(s.tasks)
        .set({ progress: 100 })
        .where(eq(s.tasks.id, w.id));
    await emit(
      tx,
      ctx,
      w,
      "approval.decided",
      `سجّل قرار المراجعة: ${stateLabels[decision]}`,
      { status: w.status },
      { status: next, decision, comment },
      await peopleOn(tx, w.id),
    );
    return after;
  });
}
export async function dependency(
  ctx: Identity,
  workId: string,
  blockerId: string,
  remove = false,
) {
  return mutate(ctx, workId, async (tx, w) => {
    if (
      w.kind !== "task" ||
      !grant(ctx, "task.update", w.committeeId, w.termId)
    )
      throw new HttpError(403, "لا يمكنك تعديل الاعتماديات");
    const blocker = await getWork(ctx, blockerId, tx);
    if (
      blocker.kind !== "task" ||
      blocker.termId !== w.termId ||
      blocker.id === w.id
    )
      throw new HttpError(422, "اعتمادية غير صالحة");
    if (w.status === "completed")
      throw new HttpError(409, "أعد فتح المهمة قبل تغيير الاعتماديات");
    if (remove)
      await tx
        .delete(s.taskDependencies)
        .where(
          and(
            eq(s.taskDependencies.taskId, w.id),
            eq(s.taskDependencies.blockerId, blocker.id),
          ),
        );
    else {
      const edges = await tx.select().from(s.taskDependencies);
      const seen = new Set<string>();
      const queue = [blocker.id];
      while (queue.length) {
        const current = queue.pop()!;
        if (current === w.id)
          throw new HttpError(422, "لا يمكن إنشاء اعتماديات دائرية");
        if (seen.has(current)) continue;
        seen.add(current);
        queue.push(
          ...edges.filter((e) => e.taskId === current).map((e) => e.blockerId),
        );
      }
      await tx
        .insert(s.taskDependencies)
        .values({ taskId: w.id, blockerId: blocker.id })
        .onConflictDoNothing();
    }
    await tx
      .update(s.workItems)
      .set({ version: w.version + 1, updatedAt: new Date() })
      .where(eq(s.workItems.id, w.id));
    await emit(
      tx,
      ctx,
      w,
      "task.dependency_changed",
      remove ? "أزال اعتمادية" : "أضاف اعتمادية إلزامية",
      null,
      { blockerId, remove },
    );
    return { ok: true };
  });
}
export async function assign(
  ctx: Identity,
  workId: string,
  userId: string,
  role: "responsible" | "participant" | "reviewer" | "attendee",
) {
  return mutate(ctx, workId, async (tx, w) => {
    const permission =
      w.kind === "task"
        ? "task.assign"
        : w.kind === "meeting"
          ? "meeting.update"
          : "request.update";
    let committeeId = w.committeeId;
    if (w.kind === "request" && role !== "reviewer") {
      const [r] = await tx
        .select()
        .from(s.requests)
        .where(eq(s.requests.id, w.id));
      committeeId = r.receivingCommitteeId;
    }
    if (
      !grant(
        ctx,
        role === "reviewer" && w.kind === "request"
          ? "request.complete"
          : permission,
        committeeId,
        w.termId,
      ) ||
      w.status === "review"
    )
      throw new HttpError(403, "لا يمكنك تعديل التعيين الآن");
    if (
      w.kind === "decision" ||
      (w.kind === "meeting" && role !== "attendee") ||
      (w.kind !== "meeting" && role === "attendee")
    )
      throw new HttpError(422, "نوع التعيين غير صالح");
    await ensurePerson(
      tx,
      w,
      userId,
      role === "reviewer"
        ? w.kind === "task"
          ? "task.review"
          : "request.complete"
        : undefined,
    );
    if (role === "reviewer") {
      await ensurePerson(tx, w, userId, "approval.review");
      const [lead] = await tx
        .select()
        .from(s.workAssignments)
        .where(
          and(
            eq(s.workAssignments.workId, w.id),
            eq(s.workAssignments.role, "responsible"),
          ),
        );
      if (lead?.userId === userId)
        throw new HttpError(422, "المراجع يجب أن يختلف عن المسؤول");
    }
    if (role === "responsible") {
      const [reviewer] = await tx
        .select()
        .from(s.workAssignments)
        .where(
          and(
            eq(s.workAssignments.workId, w.id),
            eq(s.workAssignments.role, "reviewer"),
          ),
        );
      if (reviewer?.userId === userId)
        throw new HttpError(422, "المسؤول يجب أن يختلف عن المراجع");
    }
    if (["responsible", "reviewer"].includes(role))
      await tx
        .delete(s.workAssignments)
        .where(
          and(
            eq(s.workAssignments.workId, w.id),
            eq(s.workAssignments.role, role),
          ),
        );
    await tx
      .insert(s.workAssignments)
      .values({ id: id(), workId: w.id, userId, role })
      .onConflictDoNothing();
    await tx
      .update(s.workItems)
      .set({ version: w.version + 1, updatedAt: new Date() })
      .where(eq(s.workItems.id, w.id));
    await emit(
      tx,
      ctx,
      w,
      "work.assigned",
      "حدّث تعيين أعضاء العمل",
      null,
      { userId, role },
      [userId],
    );
    return { ok: true };
  });
}
export async function addComment(
  ctx: Identity,
  workId: string,
  body: string,
  userIds: string[],
) {
  return mutate(ctx, workId, async (tx, w) => {
    if (["completed", "cancelled", "rejected", "revoked"].includes(w.status))
      throw new HttpError(409, "التعليقات مغلقة بعد إغلاق العنصر");
    for (const userId of userIds) await ensurePerson(tx, w, userId);
    const commentId = id();
    await tx
      .insert(s.comments)
      .values({ id: commentId, workId: w.id, authorId: ctx.user.id, body });
    for (const userId of new Set(userIds))
      await tx.insert(s.mentions).values({ id: id(), commentId, userId });
    await emit(
      tx,
      ctx,
      w,
      "work.commented",
      "أضاف تعليقًا",
      null,
      { commentId },
      userIds,
    );
    return { id: commentId };
  });
}
export async function acknowledge(ctx: Identity, mentionId: string) {
  const [mention] = await db
    .select({ workId: s.comments.workId })
    .from(s.mentions)
    .innerJoin(s.comments, eq(s.comments.id, s.mentions.commentId))
    .where(
      and(eq(s.mentions.id, mentionId), eq(s.mentions.userId, ctx.user.id)),
    );
  if (!mention) throw new HttpError(404, "الإشارة غير متاحة");
  return mutate(ctx, mention.workId, async (tx, w) => {
    await tx
      .update(s.mentions)
      .set({ acknowledgedAt: new Date() })
      .where(eq(s.mentions.id, mentionId));
    await emit(tx, ctx, w, "mention.acknowledged", "اطلع على الإشارة");
    return { ok: true };
  });
}
export async function respondInvitation(
  ctx: Identity,
  workId: string,
  response: "accepted" | "declined",
) {
  return mutate(ctx, workId, async (tx, w) => {
    if (w.kind !== "meeting" || w.status !== "scheduled")
      throw new HttpError(409, "الدعوة غير متاحة");
    const rows = await tx
      .update(s.workAssignments)
      .set({ response })
      .where(
        and(
          eq(s.workAssignments.workId, w.id),
          eq(s.workAssignments.userId, ctx.user.id),
          eq(s.workAssignments.role, "attendee"),
        ),
      )
      .returning();
    if (!rows.length) throw new HttpError(403, "الدعوة ليست موجهة لك");
    await emit(
      tx,
      ctx,
      w,
      "meeting.responded",
      response === "accepted" ? "أكد حضور الاجتماع" : "اعتذر عن الاجتماع",
    );
    return { ok: true };
  });
}
export async function updateDetails(
  ctx: Identity,
  workId: string,
  input: {
    title?: string;
    description?: string;
    progress?: number;
    notes?: string;
    version: number;
  },
) {
  return mutate(ctx, workId, async (tx, w) => {
    version(w, input.version);
    if (
      !(await editable(ctx, w, tx)) ||
      ["completed", "cancelled", "rejected", "review"].includes(w.status)
    )
      throw new HttpError(403, "التعديل غير متاح الآن");
    if (input.progress !== undefined) {
      if (w.kind !== "task" || input.progress === 100)
        throw new HttpError(422, "الإكمال يتم بالاعتماد فقط");
      await tx
        .update(s.tasks)
        .set({ progress: input.progress })
        .where(eq(s.tasks.id, w.id));
    }
    if (input.notes !== undefined) {
      if (w.kind !== "meeting") throw new HttpError(422, "المحضر للاجتماع فقط");
      await tx
        .update(s.meetings)
        .set({ notes: input.notes })
        .where(eq(s.meetings.id, w.id));
    }
    const [after] = await tx
      .update(s.workItems)
      .set({
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        version: w.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(s.workItems.id, w.id))
      .returning();
    await emit(
      tx,
      ctx,
      w,
      "work.updated",
      "حدّث تفاصيل العمل",
      { title: w.title, description: w.description },
      input,
    );
    return after;
  });
}
export { mutate };
