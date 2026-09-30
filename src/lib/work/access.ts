import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import * as s from "../../db/schema";
import { HttpError, type Identity } from "../services";
import { kinds, type Kind } from "./model";
export type Work = typeof s.workItems.$inferSelect;
export type Connection = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete" | "execute"
>;
export function grant(
  ctx: Identity,
  permission: string,
  committeeId: string | null,
  termId: string,
  ownerId?: string,
) {
  const now = new Date();
  return ctx.grants.some(
    (g) =>
      g.permission === permission &&
      g.active &&
      g.startAt <= now &&
      (!g.endAt || g.endAt > now) &&
      g.termStatus !== "closed" &&
      (!g.termId || g.termId === termId) &&
      (g.scope === "club" ||
        (g.scope === "committee" &&
          committeeId &&
          committeeId === g.committeeId) ||
        (g.scope === "self" && ownerId === ctx.user.id)),
  );
}
export function accessWhere(ctx: Identity, kind?: Kind): SQL {
  const now = new Date();
  const branches: SQL[] = [];
  for (const k of kind ? [kind] : kinds)
    for (const g of ctx.grants) {
      if (
        g.permission !== `${k}.read` ||
        !g.active ||
        g.startAt > now ||
        (g.endAt && g.endAt <= now) ||
        g.termStatus === "closed"
      )
        continue;
      const scope =
        g.scope === "club"
          ? sql`true`
          : g.scope === "self"
            ? eq(s.workItems.createdBy, ctx.user.id)
            : g.scope === "committee" && g.committeeId
              ? or(
                  eq(s.workItems.committeeId, g.committeeId),
                  ...(k === "request"
                    ? [
                        sql`${s.workItems.id} IN (SELECT id FROM requests WHERE receiving_committee_id=${g.committeeId})`,
                      ]
                    : []),
                )
              : sql`false`;
      branches.push(
        and(
          eq(s.workItems.kind, k),
          scope,
          ...(g.termId ? [eq(s.workItems.termId, g.termId)] : []),
        )!,
      );
    }
  if (!kind || kind === "event")
    branches.push(
      and(
        eq(s.workItems.kind, "event"),
        sql`EXISTS (SELECT 1 FROM event_team et JOIN academic_terms at ON at.id=${s.workItems.termId} WHERE et.event_id=${s.workItems.id} AND et.user_id=${ctx.user.id} AND et.start_at<=now() AND (et.end_at IS NULL OR et.end_at>now()) AND at.status<>'closed')`,
      )!,
    );
  return or(...branches) || sql`false`;
}
export async function live(ctx: Identity, conn: Connection = db) {
  const [u] = await conn
    .select()
    .from(s.user)
    .where(eq(s.user.id, ctx.user.id));
  if (!u?.active) throw new HttpError(401, "الحساب غير متاح");
}
export async function getWork(
  ctx: Identity,
  id: string,
  conn: Connection = db,
) {
  await live(ctx, conn);
  const [w] = await conn
    .select()
    .from(s.workItems)
    .where(and(eq(s.workItems.id, id), accessWhere(ctx)));
  if (!w) throw new HttpError(404, "عنصر العمل غير متاح");
  return w;
}
export async function activeTerm(termId: string, conn: Connection = db) {
  const [term] = await conn
    .select()
    .from(s.terms)
    .where(eq(s.terms.id, termId))
    .for("update");
  if (!term || term.status !== "active")
    throw new HttpError(409, "الفصل مغلق أو غير نشط؛ لا يمكن تغيير العمل");
  return term;
}
export async function actorContext(
  id: string,
  conn: Connection = db,
): Promise<Identity> {
  const [u] = await conn
    .select({
      id: s.user.id,
      name: s.user.name,
      email: s.user.email,
      active: s.user.active,
      onboarded: s.user.onboarded,
    })
    .from(s.user)
    .where(eq(s.user.id, id));
  if (!u?.active) throw new HttpError(422, "المستخدم غير متاح");
  const grants = await conn
    .select({
      permission: s.rolePermissions.permissionId,
      scope: s.assignments.scope,
      committeeId: s.assignments.committeeId,
      startAt: s.assignments.startAt,
      endAt: s.assignments.endAt,
      active: s.assignments.active,
      termStatus: s.terms.status,
      termId: s.assignments.termId,
    })
    .from(s.assignments)
    .innerJoin(
      s.rolePermissions,
      eq(s.rolePermissions.roleId, s.assignments.roleId),
    )
    .leftJoin(s.terms, eq(s.assignments.termId, s.terms.id))
    .where(eq(s.assignments.userId, id));
  return { user: u, grants, sessionId: "" };
}
export async function canReadPerson(
  userId: string,
  w: Work,
  conn: Connection = db,
) {
  try {
    const person = await actorContext(userId, conn);
    return !!(
      await conn
        .select({ id: s.workItems.id })
        .from(s.workItems)
        .where(and(eq(s.workItems.id, w.id), accessWhere(person)))
        .limit(1)
    ).length;
  } catch {
    return false;
  }
}
export async function editable(ctx: Identity, w: Work, conn: Connection = db) {
  if (grant(ctx, `${w.kind}.update`, w.committeeId, w.termId, w.createdBy))
    return true;
  if (
    w.kind === "task" &&
    grant(ctx, "task.update_own", w.committeeId, w.termId, w.createdBy)
  ) {
    return !!(
      await conn
        .select()
        .from(s.workAssignments)
        .where(
          and(
            eq(s.workAssignments.workId, w.id),
            eq(s.workAssignments.userId, ctx.user.id),
            sql`${s.workAssignments.role} in ('responsible','participant')`,
          ),
        )
    ).length;
  }
  return false;
}
