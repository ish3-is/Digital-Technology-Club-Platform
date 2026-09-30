import { and, eq, inArray, or, desc, asc, sql } from "drizzle-orm";
import { db } from "../../db";
import * as s from "../../db/schema";
import { HttpError, type Identity } from "../services";
import {
  accessWhere,
  getWork,
  grant,
  editable,
  actorContext,
  canReadPerson,
  live,
  type Work,
} from "./access";
import { kinds, type Kind, overdue, urgency, transitionMap } from "./model";
export async function listWork(ctx: Identity, kind?: Kind, query = "") {
  await live(ctx);
  const rows = await db
    .select()
    .from(s.workItems)
    .where(
      and(
        accessWhere(ctx, kind),
        ...(query
          ? [sql`strpos(lower(${s.workItems.title}),lower(${query}))>0`]
          : []),
      ),
    )
    .orderBy(desc(s.workItems.updatedAt), asc(s.workItems.id));
  const ids = rows.map((w) => w.id);
  const decisionIds = rows
    .filter((w) => w.kind === "decision")
    .map((w) => w.id);
  const decisionRows = decisionIds.length
    ? await db
        .select({
          id: s.decisions.id,
          meetingId: s.decisions.meetingId,
          date: s.decisions.decisionDate,
          decider: s.user.name,
        })
        .from(s.decisions)
        .innerJoin(s.user, eq(s.user.id, s.decisions.decidedBy))
        .where(inArray(s.decisions.id, decisionIds))
    : [];
  const linkedTasks = decisionIds.length
    ? await db
        .select({
          decisionId: s.taskSources.decisionId,
          title: s.workItems.title,
          status: s.workItems.status,
        })
        .from(s.taskSources)
        .innerJoin(s.workItems, eq(s.workItems.id, s.taskSources.taskId))
        .where(
          and(
            inArray(s.taskSources.decisionId, decisionIds),
            accessWhere(ctx, "task"),
          ),
        )
    : [];
  const people = ids.length
    ? await db
        .select({
          workId: s.workAssignments.workId,
          userId: s.user.id,
          name: s.user.name,
          role: s.workAssignments.role,
          response: s.workAssignments.response,
        })
        .from(s.workAssignments)
        .innerJoin(s.user, eq(s.user.id, s.workAssignments.userId))
        .where(inArray(s.workAssignments.workId, ids))
    : [];
  return rows.map((w) => ({
    ...w,
    overdue: overdue(w),
    decisionSummary: (() => {
      const d = decisionRows.find((d) => d.id === w.id);
      return d
        ? {
            ...d,
            meeting: rows.find((m) => m.id === d.meetingId)?.title || null,
            tasks: linkedTasks.filter((t) => t.decisionId === w.id),
          }
        : null;
    })(),
    assignments: people.filter((p) => p.workId === w.id),
  }));
}
export async function workOptions(ctx: Identity) {
  await live(ctx);
  const terms = await db
    .select()
    .from(s.terms)
    .where(eq(s.terms.status, "active"));
  const committees = await db
    .select({ id: s.committees.id, name: s.committees.name })
    .from(s.committees)
    .where(eq(s.committees.active, true));
  const contexts = terms.flatMap((t) =>
    [
      ...committees.map((c) => ({
        committeeId: c.id,
        committeeName: c.name,
        termId: t.id,
        termName: t.name,
      })),
      {
        committeeId: null,
        committeeName: "عمل على مستوى النادي",
        termId: t.id,
        termName: t.name,
      },
    ]
      .map((c) => ({
        ...c,
        canAssignTask: grant(
          ctx,
          "task.assign",
          c.committeeId,
          c.termId,
          ctx.user.id,
        ),
        create: kinds.filter((k) =>
          grant(ctx, `${k}.create`, c.committeeId, c.termId, ctx.user.id),
        ),
      }))
      .filter((c) => c.create.length),
  );
  const users = await db
    .select({ id: s.user.id, name: s.user.name })
    .from(s.user)
    .where(eq(s.user.active, true));
  const people = [];
  for (const u of users) {
    const person = await actorContext(u.id);
    const scopes = contexts
      .map((c) => ({
        ...c,
        permissions: [
          "task.read",
          "task.review",
          "request.complete",
          "approval.review",
          "meeting.read",
        ].filter((p) => grant(person, p, c.committeeId, c.termId, u.id)),
      }))
      .filter((c) => c.permissions.length);
    if (scopes.length) people.push({ ...u, scopes });
  }
  return {
    contexts,
    people,
    receivingCommittees: contexts.some((c) => c.create.includes("request"))
      ? committees
      : [],
  };
}
export async function detail(ctx: Identity, id: string) {
  const w = await getWork(ctx, id);
  const [term] = await db
    .select()
    .from(s.terms)
    .where(eq(s.terms.id, w.termId));
  const assignments = await db
    .select({
      id: s.workAssignments.id,
      userId: s.user.id,
      name: s.user.name,
      role: s.workAssignments.role,
      response: s.workAssignments.response,
    })
    .from(s.workAssignments)
    .innerJoin(s.user, eq(s.user.id, s.workAssignments.userId))
    .where(eq(s.workAssignments.workId, id));
  const [task] =
    w.kind === "task"
      ? await db.select().from(s.tasks).where(eq(s.tasks.id, id))
      : [];
  const [request] =
    w.kind === "request"
      ? await db.select().from(s.requests).where(eq(s.requests.id, id))
      : [];
  const [meeting] =
    w.kind === "meeting"
      ? await db.select().from(s.meetings).where(eq(s.meetings.id, id))
      : [];
  const [decision] =
    w.kind === "decision"
      ? await db
          .select({
            meetingId: s.decisions.meetingId,
            decidedBy: s.decisions.decidedBy,
            decisionDate: s.decisions.decisionDate,
            deciderName: s.user.name,
          })
          .from(s.decisions)
          .innerJoin(s.user, eq(s.user.id, s.decisions.decidedBy))
          .where(eq(s.decisions.id, id))
      : [];
  const comments = await db
    .select({
      id: s.comments.id,
      body: s.comments.body,
      createdAt: s.comments.createdAt,
      author: s.user.name,
    })
    .from(s.comments)
    .innerJoin(s.user, eq(s.user.id, s.comments.authorId))
    .where(eq(s.comments.workId, id))
    .orderBy(asc(s.comments.createdAt));
  const timeline = await db
    .select()
    .from(s.workEvents)
    .where(eq(s.workEvents.workId, id))
    .orderBy(desc(s.workEvents.createdAt));
  const files = await db
    .select({
      id: s.attachments.id,
      name: s.files.name,
      size: s.files.size,
      mime: s.files.mime,
    })
    .from(s.attachments)
    .innerJoin(s.files, eq(s.files.id, s.attachments.fileId))
    .where(eq(s.attachments.workId, id));
  const blockers = await db
    .select({
      id: s.workItems.id,
      title: s.workItems.title,
      status: s.workItems.status,
    })
    .from(s.taskDependencies)
    .innerJoin(s.workItems, eq(s.workItems.id, s.taskDependencies.blockerId))
    .where(and(eq(s.taskDependencies.taskId, id), accessWhere(ctx, "task")));
  const unblocks = await db
    .select({
      id: s.workItems.id,
      title: s.workItems.title,
      status: s.workItems.status,
    })
    .from(s.taskDependencies)
    .innerJoin(s.workItems, eq(s.workItems.id, s.taskDependencies.taskId))
    .where(and(eq(s.taskDependencies.blockerId, id), accessWhere(ctx, "task")));
  const blockedCount = await db
    .select({ id: s.taskDependencies.blockerId })
    .from(s.taskDependencies)
    .innerJoin(s.workItems, eq(s.workItems.id, s.taskDependencies.blockerId))
    .where(
      and(
        eq(s.taskDependencies.taskId, id),
        sql`${s.workItems.status}<>'completed'`,
      ),
    );
  const linkedTasks = await db
    .select({
      id: s.workItems.id,
      title: s.workItems.title,
      status: s.workItems.status,
    })
    .from(s.taskSources)
    .innerJoin(s.workItems, eq(s.workItems.id, s.taskSources.taskId))
    .where(
      and(
        or(eq(s.taskSources.requestId, id), eq(s.taskSources.decisionId, id)),
        accessWhere(ctx, "task"),
      ),
    );
  const meetingDecisions =
    w.kind === "meeting"
      ? await db
          .select({
            id: s.workItems.id,
            title: s.workItems.title,
            status: s.workItems.status,
          })
          .from(s.decisions)
          .innerJoin(s.workItems, eq(s.workItems.id, s.decisions.id))
          .where(
            and(eq(s.decisions.meetingId, id), accessWhere(ctx, "decision")),
          )
      : [];
  const approvals = await db
    .select({
      id: s.approvalInstances.id,
      status: s.approvalInstances.status,
      approverId: s.approvalSteps.approverId,
      approverName: s.user.name,
      decision: s.approvalSteps.decision,
      comment: s.approvalSteps.comment,
      decidedAt: s.approvalSteps.decidedAt,
      requestedBy: s.approvalInstances.requestedBy,
    })
    .from(s.approvalInstances)
    .innerJoin(
      s.approvalSteps,
      eq(s.approvalSteps.instanceId, s.approvalInstances.id),
    )
    .innerJoin(s.user, eq(s.user.id, s.approvalSteps.approverId))
    .where(eq(s.approvalInstances.workId, id))
    .orderBy(desc(s.approvalInstances.createdAt));
  const people = [];
  const users = await db
    .select({ id: s.user.id, name: s.user.name })
    .from(s.user)
    .where(eq(s.user.active, true));
  for (const u of users) if (await canReadPerson(u.id, w)) people.push(u);
  const canEdit = term?.status === "active" && (await editable(ctx, w));
  let transitions = canEdit ? transitionMap[w.kind]?.[w.status] || [] : [];
  if (w.kind === "request")
    transitions = (transitionMap.request[w.status] || []).filter((to) =>
      to === "cancelled"
        ? ctx.user.id === w.createdBy ||
          grant(ctx, "request.update", request!.receivingCommitteeId, w.termId)
        : grant(
            ctx,
            to === "received" || to === "rejected"
              ? "request.accept"
              : "request.update",
            request!.receivingCommitteeId,
            w.termId,
          ),
    );
  if (w.kind === "decision")
    transitions = grant(ctx, "decision.create", w.committeeId, w.termId)
      ? transitionMap.decision[w.status] || []
      : [];
  if (
    assignments.some((a) => a.userId === ctx.user.id && a.role === "reviewer")
  )
    transitions = transitions.filter((t) => t !== "review");
  if (
    w.kind === "task" &&
    ["completed", "cancelled"].includes(w.status) &&
    !grant(ctx, "task.update", w.committeeId, w.termId)
  )
    transitions = [];
  const open = term?.status === "active";
  const canReview =
    open &&
    approvals.some(
      (a) =>
        a.status === "pending" &&
        a.approverId === ctx.user.id &&
        a.requestedBy !== ctx.user.id,
    ) &&
    grant(ctx, "approval.review", w.committeeId, w.termId) &&
    grant(
      ctx,
      w.kind === "task" ? "task.review" : "request.complete",
      w.committeeId,
      w.termId,
    );
  const sourceCommittee = request?.receivingCommitteeId || w.committeeId;
  let parentMeeting: { id: string; title: string } | null = null;
  let parentEvent: { id: string; title: string } | null = null;
  if (w.eventId) {
    try {
      const { getEvent } = await import("../events/access");
      const parent = await getEvent(ctx, w.eventId);
      parentEvent = { id: parent.id, title: parent.title };
    } catch {}
  }
  if (decision) {
    try {
      const parent = await getWork(ctx, decision.meetingId);
      parentMeeting = { id: parent.id, title: parent.title };
    } catch {}
  }
  return {
    ...w,
    task,
    request,
    meeting,
    decision,
    parentMeeting,
    parentEvent,
    assignments,
    comments,
    timeline,
    files,
    blockers,
    unblocks,
    blockedCount: blockedCount.length,
    linkedTasks,
    meetingDecisions,
    approvals,
    people,
    overdue: overdue(w),
    transitions: open ? transitions : [],
    canEdit,
    canComment:
      open &&
      !["completed", "cancelled", "rejected", "revoked"].includes(w.status),
    canReview,
    canOverride:
      open && grant(ctx, "task.override_dependency", w.committeeId, w.termId),
    canDependency:
      open &&
      w.kind === "task" &&
      w.status !== "completed" &&
      grant(ctx, "task.update", w.committeeId, w.termId),
    canAssign:
      open &&
      w.status !== "review" &&
      (w.kind === "task"
        ? grant(ctx, "task.assign", w.committeeId, w.termId)
        : w.kind === "meeting"
          ? grant(ctx, "meeting.update", w.committeeId, w.termId)
          : w.kind === "request"
            ? grant(ctx, "request.update", sourceCommittee, w.termId)
            : false),
    canLink:
      open &&
      ["request", "decision"].includes(w.kind) &&
      grant(ctx, "task.create", sourceCommittee, w.termId) &&
      (w.kind !== "request" ||
        grant(ctx, "request.update", sourceCommittee, w.termId)),
    canDecision:
      open &&
      w.kind === "meeting" &&
      w.status !== "cancelled" &&
      grant(ctx, "decision.create", w.committeeId, w.termId),
    invitation:
      open && w.status === "scheduled"
        ? assignments.find(
            (a) => a.role === "attendee" && a.userId === ctx.user.id,
          )
        : undefined,
  };
}
export async function inbox(ctx: Identity) {
  const work = await listWork(ctx);
  const openTerms = new Set(
    (await db.select().from(s.terms).where(eq(s.terms.status, "active"))).map(
      (t) => t.id,
    ),
  );
  const pending = await db
    .select({
      workId: s.approvalInstances.workId,
      approverId: s.approvalSteps.approverId,
    })
    .from(s.approvalInstances)
    .innerJoin(
      s.approvalSteps,
      eq(s.approvalSteps.instanceId, s.approvalInstances.id),
    )
    .where(
      and(
        eq(s.approvalInstances.status, "pending"),
        eq(s.approvalSteps.approverId, ctx.user.id),
      ),
    );
  const requests = await db.select().from(s.requests);
  const mentions = await db
    .select({ id: s.mentions.id, workId: s.comments.workId })
    .from(s.mentions)
    .innerJoin(s.comments, eq(s.comments.id, s.mentions.commentId))
    .where(
      and(
        eq(s.mentions.userId, ctx.user.id),
        sql`${s.mentions.acknowledgedAt} IS NULL`,
      ),
    );
  const result = [];
  for (const w of work) {
    if (!openTerms.has(w.termId)) continue;
    let action = "";
    let mentionId: string | undefined;
    if (
      pending.some((p) => p.workId === w.id) &&
      grant(ctx, "approval.review", w.committeeId, w.termId) &&
      grant(
        ctx,
        w.kind === "task" ? "task.review" : "request.complete",
        w.committeeId,
        w.termId,
      )
    )
      action = "اتخذ قرار المراجعة";
    else if (
      w.kind === "task" &&
      ["not_started", "in_progress"].includes(w.status) &&
      w.assignments.some(
        (a) =>
          a.userId === ctx.user.id &&
          ["responsible", "participant"].includes(a.role),
      )
    )
      action = "تابع المهمة المسندة إليك";
    else if (
      w.kind === "request" &&
      w.status === "new" &&
      grant(
        ctx,
        "request.accept",
        requests.find((r) => r.id === w.id)!.receivingCommitteeId,
        w.termId,
      )
    )
      action = "استلم الطلب الوارد إلى لجنتك";
    else if (
      w.kind === "request" &&
      ["received", "in_progress"].includes(w.status) &&
      w.assignments.some(
        (a) => a.userId === ctx.user.id && a.role === "responsible",
      )
    )
      action = "نفّذ الطلب أو اطلب مراجعته";
    else if (
      w.kind === "meeting" &&
      w.status === "scheduled" &&
      w.assignments.some(
        (a) =>
          a.userId === ctx.user.id &&
          a.role === "attendee" &&
          a.response === "pending",
      )
    )
      action = "ردّ على دعوة الاجتماع";
    const mention = mentions.find((m) => m.workId === w.id);
    if (w.kind === "event" && !["archived", "cancelled"].includes(w.status)) {
      const { getEvent } = await import("../events/access");
      const { eventActions } = await import("../events/queries");
      action = (await eventActions(ctx, await getEvent(ctx, w.id))).join(" · ");
    }
    if (mention) {
      mentionId = mention.id;
      if (!action) action = "اطلع على الإشارة وأكد قراءتها";
    }
    if (action) result.push({ ...w, ...urgency(w), action, mentionId });
  }
  return result.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}
export async function search(ctx: Identity, query: string) {
  if (query.trim().length < 2) return [];
  return (await listWork(ctx, undefined, query.trim()))
    .slice(0, 30)
    .map((w) => ({ id: w.id, title: w.title, kind: w.kind, status: w.status }));
}
