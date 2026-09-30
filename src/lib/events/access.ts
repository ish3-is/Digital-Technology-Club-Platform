import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import * as s from "../../db/schema";
import { HttpError, type Identity } from "../services";
import {
  getWork,
  grant,
  type Connection,
  type Work,
  actorContext,
} from "../work/access";
export type EventRecord = Work & typeof s.events.$inferSelect;
export async function getEvent(
  ctx: Identity,
  id: string,
  tx: Connection = db,
): Promise<EventRecord> {
  const w = await getWork(ctx, id, tx);
  const [e] = await tx.select().from(s.events).where(eq(s.events.id, id));
  if (w.kind !== "event" || !e) throw new HttpError(404, "الفعالية غير متاحة");
  return { ...w, ...e };
}
export async function eventCan(
  ctx: Identity,
  e: EventRecord,
  permission: string,
  tx: Connection = db,
) {
  if (grant(ctx, permission, e.committeeId, e.termId, e.createdBy)) return true;
  if (
    [
      "event.approve",
      "event.override_stage",
      "event.view_budget",
      "event.manage_budget",
      "event.manage_team",
      "event.archive",
      "event.cancel",
    ].includes(permission)
  )
    return false;
  const rows = await tx
    .select({ permissions: s.eventRoles.permissions })
    .from(s.eventTeam)
    .innerJoin(s.eventRoles, eq(s.eventRoles.id, s.eventTeam.roleId))
    .where(
      and(
        eq(s.eventTeam.eventId, e.id),
        eq(s.eventTeam.userId, ctx.user.id),
        sql`${s.eventTeam.startAt}<=now() AND (${s.eventTeam.endAt} IS NULL OR ${s.eventTeam.endAt}>now())`,
      ),
    );
  return rows.some(
    (r) => permission === "event.read" || r.permissions.includes(permission),
  );
}
export async function requireEvent(
  ctx: Identity,
  e: EventRecord,
  p: string,
  tx: Connection = db,
) {
  if (!(await eventCan(ctx, e, p, tx)))
    throw new HttpError(403, "لا تملك صلاحية هذا الإجراء");
}
export async function eligiblePerson(
  userId: string,
  termId: string,
  tx: Connection = db,
) {
  const person = await actorContext(userId, tx);
  const now = new Date();
  if (
    !person.user.onboarded ||
    !person.grants.some(
      (g) =>
        g.permission === "event.read" &&
        g.active &&
        g.startAt <= now &&
        (!g.endAt || g.endAt > now) &&
        g.termStatus !== "closed" &&
        (!g.termId || g.termId === termId),
    )
  )
    throw new HttpError(422, "العضو خارج التعيينات السارية");
  return person;
}
export async function eventOwner(
  userId: string,
  e: EventRecord,
  tx: Connection = db,
) {
  const p = await eligiblePerson(userId, e.termId, tx);
  await getEvent(p, e.id, tx);
  return p;
}
