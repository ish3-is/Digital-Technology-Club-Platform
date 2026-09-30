import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { db } from "../../db";
import * as s from "../../db/schema";
import { type Identity } from "../services";
import {
  accessWhere,
  grant,
  actorContext,
  live,
  type Connection,
} from "../work/access";
import { getEvent, eventCan, type EventRecord } from "./access";
import { readiness, transitions, stageLabels } from "./model";
import { blockers } from "./engine";
export async function eventOptions(ctx: Identity) {
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
    committees
      .filter((c) => grant(ctx, "event.create", c.id, t.id))
      .map((c) => ({
        termId: t.id,
        termName: t.name,
        committeeId: c.id,
        committeeName: c.name,
      })),
  );
  const people = [];
  if (
    contexts.length ||
    ctx.grants.some((g) => g.permission === "event.manage_team")
  ) {
    const users = await db
      .select({ id: s.user.id, name: s.user.name })
      .from(s.user)
      .where(and(eq(s.user.active, true), eq(s.user.onboarded, true)));
    for (const u of users) {
      const p = await actorContext(u.id);
      const scopes = terms.flatMap((t) =>
        committees
          .filter((c) => grant(p, "event.read", c.id, t.id))
          .map((c) => ({
            termId: t.id,
            committeeId: c.id,
            approve:
              grant(p, "event.approve", c.id, t.id) &&
              grant(p, "approval.review", c.id, t.id),
          })),
      );
      if (scopes.length) people.push({ ...u, scopes });
    }
  }
  return {
    contexts,
    people,
    committees,
    roles: await db.select().from(s.eventRoles),
    playbooks: await db
      .select({
        id: s.eventPlaybooks.id,
        name: s.eventPlaybooks.name,
        version: s.eventPlaybooks.version,
      })
      .from(s.eventPlaybooks)
      .where(eq(s.eventPlaybooks.active, true)),
  };
}
export async function listEvents(ctx: Identity, q = "") {
  await live(ctx);
  return db
    .select({
      id: s.workItems.id,
      title: s.workItems.title,
      status: s.workItems.status,
      startAt: s.workItems.startAt,
      endAt: s.events.endAt,
      eventType: s.events.eventType,
      location: s.events.locationText,
      committeeId: s.workItems.committeeId,
    })
    .from(s.workItems)
    .innerJoin(s.events, eq(s.events.id, s.workItems.id))
    .where(
      and(
        accessWhere(ctx, "event"),
        q ? sql`strpos(lower(${s.workItems.title}),lower(${q}))>0` : sql`true`,
      ),
    )
    .orderBy(desc(s.workItems.startAt));
}
export async function eventActions(
  ctx: Identity,
  e: EventRecord,
  tx: Connection = db,
) {
  const [pending] = await tx
    .select({
      purpose: s.approvalInstances.purpose,
      approver: s.approvalSteps.approverId,
    })
    .from(s.approvalInstances)
    .innerJoin(
      s.approvalSteps,
      eq(s.approvalSteps.instanceId, s.approvalInstances.id),
    )
    .where(
      and(
        eq(s.approvalInstances.workId, e.id),
        eq(s.approvalInstances.status, "pending"),
      ),
    );
  const requirements = await tx
    .select()
    .from(s.eventRequirements)
    .where(
      and(
        eq(s.eventRequirements.eventId, e.id),
        eq(s.eventRequirements.ownerId, ctx.user.id),
        eq(s.eventRequirements.status, "pending"),
      ),
    );
  const risks = await tx
    .select()
    .from(s.eventRisks)
    .where(
      and(
        eq(s.eventRisks.eventId, e.id),
        eq(s.eventRisks.ownerId, ctx.user.id),
        sql`${s.eventRisks.status}<>'closed'`,
      ),
    );
  const actions = [];
  if (
    pending?.approver === ctx.user.id &&
    (await eventCan(ctx, e, "event.approve", tx))
  )
    actions.push(
      pending.purpose === "report"
        ? "راجع التقرير النهائي"
        : "اتخذ قرار اعتماد الفعالية",
    );
  if (requirements.length)
    actions.push(`${requirements.length} متطلبات جاهزية تحتاجك`);
  if (risks.length) actions.push(`${risks.length} مخاطر تحتاج إجراءك`);
  return actions;
}
export async function eventDetail(ctx: Identity, id: string) {
  const e = await getEvent(ctx, id);
  const permissions: Record<string, boolean> = {};
  for (const key of [
    "read",
    "update",
    "submit",
    "approve",
    "cancel",
    "archive",
    "override_stage",
    "manage_team",
    "manage_readiness",
    "manage_attendance",
    "manage_participants",
    "view_budget",
    "manage_budget",
    "manage_files",
  ])
    permissions[key] = await eventCan(ctx, e, `event.${key}`);
  const { plannedBudget, approvedBudget, actualSpend, ...publicEvent } = e;
  const requirements = await db
    .select()
    .from(s.eventRequirements)
    .where(eq(s.eventRequirements.eventId, id));
  const risks = await db
    .select()
    .from(s.eventRisks)
    .where(eq(s.eventRisks.eventId, id));
  const team = await db
    .select({
      id: s.eventTeam.id,
      userId: s.user.id,
      name: s.user.name,
      roleId: s.eventRoles.id,
      role: s.eventRoles.name,
      committeeId: s.eventTeam.committeeId,
      startAt: s.eventTeam.startAt,
      endAt: s.eventTeam.endAt,
    })
    .from(s.eventTeam)
    .innerJoin(s.user, eq(s.user.id, s.eventTeam.userId))
    .innerJoin(s.eventRoles, eq(s.eventRoles.id, s.eventTeam.roleId))
    .where(eq(s.eventTeam.eventId, id));
  const work = await db
    .select()
    .from(s.workItems)
    .where(and(eq(s.workItems.eventId, id), accessWhere(ctx)));
  const dependencies = work.length
    ? await db
        .select({ taskId: s.taskDependencies.taskId })
        .from(s.taskDependencies)
        .innerJoin(
          s.workItems,
          eq(s.workItems.id, s.taskDependencies.blockerId),
        )
        .where(
          and(
            inArray(
              s.taskDependencies.taskId,
              work.map((w) => w.id),
            ),
            sql`${s.workItems.status}<>'completed'`,
          ),
        )
    : [];
  const participants = permissions.manage_participants
    ? await db
        .select({
          id: s.eventParticipants.id,
          name: s.eventParticipants.name,
          email: s.eventParticipants.email,
          phone: s.eventParticipants.phone,
          universityId: s.eventParticipants.universityId,
          major: s.eventParticipants.major,
          source: s.eventParticipants.registrationSource,
          status: s.eventAttendance.status,
          checkInAt: s.eventAttendance.checkInAt,
        })
        .from(s.eventParticipants)
        .innerJoin(
          s.eventAttendance,
          eq(s.eventParticipants.id, s.eventAttendance.participantId),
        )
        .where(eq(s.eventParticipants.eventId, id))
    : permissions.manage_attendance
      ? await db
          .select({
            id: s.eventParticipants.id,
            name: s.eventParticipants.name,
            status: s.eventAttendance.status,
            checkInAt: s.eventAttendance.checkInAt,
          })
          .from(s.eventParticipants)
          .innerJoin(
            s.eventAttendance,
            eq(s.eventParticipants.id, s.eventAttendance.participantId),
          )
          .where(eq(s.eventParticipants.eventId, id))
      : null;
  const attendance = await db
    .select({
      status: s.eventAttendance.status,
      count: sql<number>`count(*)::int`,
    })
    .from(s.eventAttendance)
    .where(eq(s.eventAttendance.eventId, id))
    .groupBy(s.eventAttendance.status);
  const files = (
    await db
      .select({
        id: s.eventFiles.id,
        category: s.eventFiles.category,
        visibility: s.eventFiles.visibility,
        name: s.files.name,
        size: s.files.size,
      })
      .from(s.eventFiles)
      .innerJoin(s.files, eq(s.files.id, s.eventFiles.fileId))
      .where(eq(s.eventFiles.eventId, id))
  ).filter(
    (f) =>
      f.visibility === "team" ||
      (f.visibility === "participants" && permissions.manage_participants) ||
      (f.visibility === "budget" && permissions.view_budget),
  );
  const timeline = await db
    .select()
    .from(s.workEvents)
    .where(inArray(s.workEvents.workId, [id, ...work.map((w) => w.id)]))
    .orderBy(desc(s.workEvents.createdAt))
    .limit(100);
  const approvals = await db
    .select({
      id: s.approvalInstances.id,
      purpose: s.approvalInstances.purpose,
      status: s.approvalInstances.status,
      approverId: s.approvalSteps.approverId,
      name: s.user.name,
      comment: s.approvalSteps.comment,
      requestedBy: s.approvalInstances.requestedBy,
    })
    .from(s.approvalInstances)
    .innerJoin(
      s.approvalSteps,
      eq(s.approvalSteps.instanceId, s.approvalInstances.id),
    )
    .innerJoin(s.user, eq(s.user.id, s.approvalSteps.approverId))
    .where(eq(s.approvalInstances.workId, id));
  const [report] = await db
    .select()
    .from(s.eventReports)
    .where(eq(s.eventReports.eventId, id));
  const next = transitions[e.status] || [];
  const gates: Record<string, string[]> = Object.fromEntries(
    await Promise.all(next.map(async (to) => [to, await blockers(db, e, to)])),
  );
  const term = await db.select().from(s.terms).where(eq(s.terms.id, e.termId));
  return {
    ...publicEvent,
    budget: permissions.view_budget
      ? { plannedBudget, approvedBudget, actualSpend }
      : null,
    permissions,
    closed:
      ["archived", "cancelled"].includes(e.status) ||
      term[0]?.status !== "active",
    requirements,
    readiness: readiness(requirements),
    risks,
    team,
    work: work.map((w) => ({
      ...w,
      blocked: dependencies.some((d) => d.taskId === w.id),
    })),
    participants,
    attendance,
    files,
    timeline,
    approvals,
    report: report || null,
    next,
    gates,
  };
}
