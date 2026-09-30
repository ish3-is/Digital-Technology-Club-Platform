import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { getWork } from "@/lib/work/access";
import { audit, demand, eligibleOwner, requireActiveSession, scopeWhere, title, write } from "./helpers";
import { getGoal } from "./goals.service";
import { initiativeStatusTransitions } from "./types";
export async function listInitiatives(ctx: Identity, filters: { goalId?: string; committeeId?: string; status?: s.InitiativeStatus; ownerUserId?: string } = {}) {
  await requireActiveSession(ctx);
  const rows = await db.select({ item: s.initiatives }).from(s.initiatives).innerJoin(s.goals, eq(s.goals.id, s.initiatives.goalId)).where(and(scopeWhere(ctx, "initiative.view", { academicTermId: s.goals.academicTermId, committeeId: s.initiatives.committeeId, owner: s.initiatives.ownerUserId }), filters.goalId ? eq(s.initiatives.goalId, filters.goalId) : undefined, filters.committeeId ? eq(s.initiatives.committeeId, filters.committeeId) : undefined, filters.status ? eq(s.initiatives.status, filters.status) : undefined, filters.ownerUserId ? eq(s.initiatives.ownerUserId, filters.ownerUserId) : undefined)).orderBy(desc(s.initiatives.createdAt));
  return rows.map(r => r.item);
}
export async function getInitiative(ctx: Identity, id: string) {
  const row = (await listInitiatives(ctx)).find(r => r.id === id);
  if (!row) throw new HttpError(404, "المبادرة غير متاحة");
  const goal = await getGoal(ctx, row.goalId);
  return { ...row, academicTermId: goal.academicTermId, goal };
}
export async function createInitiative(ctx: Identity, input: { title: string; description?: string; goalId: string; committeeId?: string; ownerUserId?: string; startAt?: Date; dueAt?: Date }) {
  const goal = await getGoal(ctx, input.goalId);
  if (input.committeeId && input.committeeId !== goal.committeeId) throw new HttpError(422, "لجنة المبادرة يجب أن تطابق الهدف");
  const scope = { academicTermId: goal.academicTermId, committeeId: goal.committeeId, ownerUserId: input.ownerUserId ?? ctx.user.id };
  return write(ctx, scope, "initiative.create", async tx => {
    await eligibleOwner(ctx, scope.ownerUserId, scope, "initiative.view", tx);
    const [row] = await tx.insert(s.initiatives).values({ ...input, committeeId: scope.committeeId, ownerUserId: scope.ownerUserId, title: title(input.title) }).returning();
    await audit(tx, ctx, "initiative", row.id, "created", { goalId: goal.id }); return row;
  });
}
export async function updateInitiative(ctx: Identity, id: string, input: { title?: string; description?: string; startAt?: Date | null; dueAt?: Date | null; status?: s.InitiativeStatus }) {
  const scope = await getInitiative(ctx, id);
  return write(ctx, scope, "initiative.update", async tx => {
    const [before] = await tx.select().from(s.initiatives).where(eq(s.initiatives.id, id));
    if (input.status && !initiativeStatusTransitions[before.status].includes(input.status)) throw new HttpError(409, "انتقال الحالة غير مسموح");
    const [row] = await tx.update(s.initiatives).set({ ...input, title: input.title === undefined ? undefined : title(input.title), updatedAt: new Date() }).where(eq(s.initiatives.id, id)).returning();
    await audit(tx, ctx, "initiative", id, "updated", { from: before.status, to: row.status }); return row;
  });
}
export async function linkInitiativeToGoal(ctx: Identity, id: string, goalId: string) {
  const scope = await getInitiative(ctx, id), goal = await getGoal(ctx, goalId);
  if (goal.academicTermId !== scope.academicTermId || goal.committeeId !== scope.committeeId) throw new HttpError(422, "يجب تطابق الفصل واللجنة");
  return write(ctx, scope, "initiative.update", async tx => {
    demand(ctx, "initiative.create", goal);
    await tx.update(s.initiatives).set({ goalId, updatedAt: new Date() }).where(eq(s.initiatives.id, id));
    await audit(tx, ctx, "initiative", id, "linked", { goalId }); return { ok: true };
  });
}
export async function linkInitiativeWork(ctx: Identity, id: string, workId: string) {
  const scope = await getInitiative(ctx, id);
  return write(ctx, scope, "initiative.update", async tx => {
    const work = await getWork(ctx, workId, tx);
    if (work.termId !== scope.academicTermId || work.committeeId !== scope.committeeId) throw new HttpError(422, "يجب تطابق نطاق العمل والمبادرة");
    const linkType = sLinkType(work.kind);
    const [existing] = await tx.select().from(s.initiativeLinks).where(and(eq(s.initiativeLinks.initiativeId, id), eq(s.initiativeLinks.linkedId, workId)));
    if (!existing) await tx.insert(s.initiativeLinks).values({ initiativeId: id, linkedId: workId, linkType });
    await audit(tx, ctx, "initiative", id, "linked", { workId }); return { ok: true };
  });
}
function sLinkType(kind: string): s.InitiativeLinkType { if (kind === "event" || kind === "task" || kind === "request" || kind === "meeting" || kind === "decision") return kind; throw new HttpError(422, "نوع العمل غير صالح"); }
export async function deleteInitiative(ctx: Identity, id: string) { await getInitiative(ctx, id); throw new HttpError(409, "استخدم الإلغاء للحفاظ على السجل المؤسسي"); }
