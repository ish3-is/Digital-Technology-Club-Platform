import { and, eq, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { activeTerm, actorContext, grant, type Connection } from "@/lib/work/access";
export const generateId = () => crypto.randomUUID();
export type Scope = { academicTermId: string; committeeId: string | null; ownerUserId?: string | null; createdBy?: string };
export async function requireActiveSession(ctx: Identity, conn: Connection = db) {
  const fresh = await actorContext(ctx.user.id, conn).catch(() => { throw new HttpError(401, "الحساب غير متاح"); });
  if (!fresh.user.onboarded) throw new HttpError(409, "أكمل إعداد الحساب");
  ctx.grants = fresh.grants;
}
export function allowed(ctx: Identity, permission: string, scope: Scope) {
  return grant(ctx, permission, scope.committeeId, scope.academicTermId, scope.ownerUserId ?? scope.createdBy);
}
export function demand(ctx: Identity, permission: string, scope: Scope) {
  if (!allowed(ctx, permission, scope)) throw new HttpError(403, "لا تملك صلاحية هذا الإجراء ضمن النطاق");
}
export async function hasPermission(ctx: Identity, permission: string) {
  return ctx.grants.some(g => g.scope === "club" && grant({ ...ctx, grants: [g] }, permission, null, g.termId ?? ""));
}
export async function hasPermissionOnCommittee(ctx: Identity, permission: string, committeeId: string) {
  return ctx.grants.some(g => grant({ ...ctx, grants: [g] }, permission, committeeId, g.termId ?? ""));
}
export function scopeWhere(ctx: Identity, permission: string, columns: { academicTermId: SQLWrapper; committeeId: SQLWrapper; owner?: SQLWrapper }): SQL {
  const now = new Date();
  const clauses: SQL[] = [];
  for (const g of ctx.grants) {
    if (g.permission !== permission || !g.active || g.startAt > now || (g.endAt && g.endAt <= now) || g.termStatus === "closed") continue;
    const scope = g.scope === "club" ? sql`true` : g.scope === "committee" && g.committeeId ? sql`${columns.committeeId} = ${g.committeeId}` : g.scope === "self" && columns.owner ? sql`${columns.owner} = ${ctx.user.id}` : sql`false`;
    clauses.push(sql`(${scope}) AND (${g.termId ? sql`${columns.academicTermId} = ${g.termId}` : sql`true`})`);
  }
  return or(...clauses) ?? sql`false`;
}
export async function write<T>(ctx: Identity, scope: Scope, permission: string, fn: (tx: Connection) => Promise<T>) {
  return db.transaction(async tx => {
    await activeTerm(scope.academicTermId, tx);
    await requireActiveSession(ctx, tx);
    demand(ctx, permission, scope);
    return fn(tx);
  });
}
export async function audit(tx: Connection, ctx: Identity, entityType: s.GovernanceEntityType, entityId: string, action: string, metadata: Record<string, unknown> = {}) {
  await tx.insert(s.auditLogs).values({ id: generateId(), actorId: ctx.user.id, entityType, entityId, action, sessionId: ctx.sessionId, newValue: metadata });
  await tx.insert(s.governanceEvents).values({ actorId: ctx.user.id, entityType, entityId, action, metadata });
}
export function integer(value: number) {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) throw new HttpError(422, "القيمة يجب أن تكون عددًا صحيحًا ضمن مجال التخزين");
  return value;
}
export function title(value: string) {
  const v = value.trim(); if (v.length < 3 || v.length > 200) throw new HttpError(422, "العنوان بين ٣ و٢٠٠ حرف"); return v;
}
export async function currentActiveTermId() { return (await db.select().from(s.terms).where(eq(s.terms.status, "active")))[0]?.id; }
export async function isLive() { const id = await currentActiveTermId(); if (!id) throw new HttpError(409, "لا يوجد فصل نشط"); return id; }
export async function eligibleOwner(ctx: Identity, id: string, scope: Scope, permission: string, tx: Connection) {
  const owner = await actorContext(id, tx);
  if (!owner.user.onboarded || !allowed(owner, permission, { ...scope, ownerUserId: id })) throw new HttpError(422, "المسؤول لا يستطيع قراءة المورد");
}
