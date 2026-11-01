import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { permits } from "@/lib/policy";
import { HttpError, type Identity } from "@/lib/services";
import { actorContext, grant } from "@/lib/work/access";

export type CommitteeFormationInput = {
  name: string;
  description?: string;
  memberIds: string[];
  headId?: string | null;
  approverIds: string[];
};

function demandManagement(ctx: Identity) {
  if (!permits(ctx.grants, "committee.form"))
    throw new HttpError(403, "تشكيل اللجان متاح لقيادة النادي فقط");
}

async function activeTerm() {
  const [term] = await db
    .select({ id: s.terms.id, name: s.terms.name })
    .from(s.terms)
    .where(eq(s.terms.status, "active"));
  if (!term) throw new HttpError(409, "لا يوجد فصل أكاديمي نشط لتشكيل اللجنة");
  return term;
}

export async function committeeFormationOptions(
  ctx: Identity,
  committeeId?: string,
) {
  demandManagement(ctx);
  const term = await activeTerm();
  const people = await db
    .select({ id: s.user.id, name: s.user.name })
    .from(s.user)
    .innerJoin(s.memberProfiles, eq(s.memberProfiles.userId, s.user.id))
    .where(eq(s.user.active, true))
    .orderBy(s.user.name);
  const activeUsers = await db
    .select({ id: s.user.id, name: s.user.name })
    .from(s.user)
    .where(eq(s.user.active, true))
    .orderBy(s.user.name);

  const exactPreferred = activeUsers.filter(
    (person) => person.name.includes("عمار") || person.name.includes("إياد"),
  );
  const approverPool = exactPreferred.length ? exactPreferred : activeUsers;
  const approvers = [] as { id: string; name: string; preferred: boolean }[];
  for (const person of approverPool) {
    const candidate = await actorContext(person.id);
    if (
      grant(candidate, "approval.review", committeeId ?? null, term.id) &&
      grant(candidate, "task.review", committeeId ?? null, term.id)
    )
      approvers.push({
        ...person,
        preferred:
          person.name.includes("عمار") || person.name.includes("إياد"),
      });
  }

  let formation: {
    memberIds: string[];
    headId: string | null;
    approverIds: string[];
  } | null = null;
  if (committeeId) {
    const [memberRows, approverRows] = await Promise.all([
      db
        .select({ userId: s.assignments.userId, roleId: s.assignments.roleId })
        .from(s.assignments)
        .where(
          and(
            eq(s.assignments.committeeId, committeeId),
            eq(s.assignments.termId, term.id),
            eq(s.assignments.active, true),
            inArray(s.assignments.roleId, ["committee_head", "committee_member"]),
          ),
        ),
      db
        .select({ userId: s.committeeApprovers.userId })
        .from(s.committeeApprovers)
        .where(eq(s.committeeApprovers.committeeId, committeeId)),
    ]);
    formation = {
      memberIds: [...new Set(memberRows.map((row) => row.userId))],
      headId:
        memberRows.find((row) => row.roleId === "committee_head")?.userId ??
        null,
      approverIds: approverRows.map((row) => row.userId),
    };
  }
  return { term, people, approvers, formation };
}

async function syncFormation(
  ctx: Identity,
  committeeId: string,
  termId: string,
  input: CommitteeFormationInput,
) {
  const memberIds = [...new Set(input.memberIds)];
  const headId = input.headId || null;
  if (headId && !memberIds.includes(headId)) memberIds.push(headId);
  if (!memberIds.length)
    throw new HttpError(422, "اختر عضوًا واحدًا على الأقل للجنة");
  const approverIds = [...new Set(input.approverIds)];
  if (!approverIds.length)
    throw new HttpError(422, "اختر عمار أو إياد لاعتماد أعمال اللجنة");

  const activePeople = await db
    .select({ id: s.user.id })
    .from(s.user)
    .where(and(eq(s.user.active, true), inArray(s.user.id, memberIds)));
  if (activePeople.length !== memberIds.length)
    throw new HttpError(422, "أحد أعضاء اللجنة غير متاح");
  for (const approverId of approverIds) {
    const candidate = await actorContext(approverId);
    if (
      !grant(candidate, "approval.review", committeeId, termId) ||
      !grant(candidate, "task.review", committeeId, termId)
    )
      throw new HttpError(422, "المعتمد المختار لا يملك صلاحية الاعتماد");
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(s.assignments)
      .set({ active: false, endAt: now })
      .where(
        and(
          eq(s.assignments.committeeId, committeeId),
          eq(s.assignments.termId, termId),
          eq(s.assignments.active, true),
          inArray(s.assignments.roleId, ["committee_head", "committee_member"]),
        ),
      );
    await tx
      .update(s.memberCommitteeHistory)
      .set({ endAt: now })
      .where(
        and(
          eq(s.memberCommitteeHistory.committeeId, committeeId),
          eq(s.memberCommitteeHistory.academicTermId, termId),
          eq(s.memberCommitteeHistory.assignmentType, "collaboration"),
          isNull(s.memberCommitteeHistory.endAt),
        ),
      );

    await tx.insert(s.assignments).values(
      memberIds.map((userId) => ({
        id: crypto.randomUUID(),
        userId,
        roleId: userId === headId ? "committee_head" : "committee_member",
        committeeId,
        termId,
        scope: "committee",
        startAt: now,
      })),
    );

    const permanent = await tx
      .select({ userId: s.memberCommitteeHistory.userId })
      .from(s.memberCommitteeHistory)
      .where(
        and(
          eq(s.memberCommitteeHistory.committeeId, committeeId),
          eq(s.memberCommitteeHistory.academicTermId, termId),
          eq(s.memberCommitteeHistory.assignmentType, "permanent"),
          isNull(s.memberCommitteeHistory.endAt),
          inArray(s.memberCommitteeHistory.userId, memberIds),
        ),
      );
    const permanentIds = new Set(permanent.map((row) => row.userId));
    const collaborationIds = memberIds.filter((id) => !permanentIds.has(id));
    if (collaborationIds.length)
      await tx.insert(s.memberCommitteeHistory).values(
        collaborationIds.map((userId) => ({
          id: crypto.randomUUID(),
          userId,
          committeeId,
          academicTermId: termId,
          assignmentType: "collaboration" as const,
          reason: "تشكيل لجنة معتمد عبر إدارة النادي",
          placedBy: ctx.user.id,
          startAt: now,
        })),
      );

    await tx
      .delete(s.committeeApprovers)
      .where(eq(s.committeeApprovers.committeeId, committeeId));
    await tx.insert(s.committeeApprovers).values(
      approverIds.map((userId) => ({
        committeeId,
        userId,
        assignedBy: ctx.user.id,
      })),
    );
    await tx.insert(s.activities).values({
      id: crypto.randomUUID(),
      actorId: ctx.user.id,
      action: "committee.formation_updated",
      entityType: "committee",
      entityId: committeeId,
      committeeId,
      metadata: {
        label: `تم اعتماد تشكيل اللجنة (${memberIds.length} عضو)`,
        memberIds,
        headId,
        approverIds,
      },
    });
    await tx.insert(s.auditLogs).values({
      id: crypto.randomUUID(),
      actorId: ctx.user.id,
      action: "committee.formation_updated",
      entityType: "committee",
      entityId: committeeId,
      sessionId: ctx.sessionId,
      newValue: { memberIds, headId, approverIds, termId },
    });
    await tx.insert(s.notifications).values(
      memberIds.map((userId) => ({
        id: crypto.randomUUID(),
        userId,
        title: "تمت إضافتك إلى لجنة",
        body: "أصبحت مساحة اللجنة وأعمالها متاحة لك الآن.",
      })),
    );
  });
}

export async function createCommitteeFormation(
  ctx: Identity,
  input: CommitteeFormationInput,
) {
  demandManagement(ctx);
  const fresh = await actorContext(ctx.user.id);
  demandManagement(fresh);
  const term = await activeTerm();
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120)
    throw new HttpError(422, "اسم اللجنة بين حرفين و120 حرفًا");
  const [duplicate] = await db
    .select({ id: s.committees.id })
    .from(s.committees)
    .where(sql`lower(${s.committees.name}) = lower(${name}) AND ${s.committees.active} = true`);
  if (duplicate) throw new HttpError(409, "توجد لجنة نشطة بهذا الاسم");
  const id = crypto.randomUUID();
  await db.insert(s.committees).values({
    id,
    name,
    description: (input.description ?? "").trim().slice(0, 2000),
  });
  try {
    await syncFormation(ctx, id, term.id, input);
  } catch (error) {
    await db.delete(s.committees).where(eq(s.committees.id, id));
    throw error;
  }
  return { id };
}

export async function updateCommitteeFormation(
  ctx: Identity,
  committeeId: string,
  input: CommitteeFormationInput,
) {
  demandManagement(ctx);
  const fresh = await actorContext(ctx.user.id);
  demandManagement(fresh);
  const term = await activeTerm();
  const [committee] = await db
    .select({ id: s.committees.id })
    .from(s.committees)
    .where(and(eq(s.committees.id, committeeId), eq(s.committees.active, true)));
  if (!committee) throw new HttpError(404, "اللجنة غير متاحة");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120)
    throw new HttpError(422, "اسم اللجنة بين حرفين و120 حرفًا");
  await db
    .update(s.committees)
    .set({ name, description: (input.description ?? "").trim().slice(0, 2000) })
    .where(eq(s.committees.id, committeeId));
  await syncFormation(ctx, committeeId, term.id, input);
  return { id: committeeId };
}
