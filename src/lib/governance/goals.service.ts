import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { audit, demand, integer, requireActiveSession, scopeWhere, title, write, eligibleOwner } from "./helpers";
import { goalStatusTransitions } from "./types";
export async function listGoals(ctx: Identity, filters: { academicTermId?: string; committeeId?: string; status?: s.GoalStatus; ownerUserId?: string } = {}) {
  await requireActiveSession(ctx);
  return db.select().from(s.goals).where(and(scopeWhere(ctx, "goal.view", { ...s.goals, owner: s.goals.ownerUserId }), filters.academicTermId ? eq(s.goals.academicTermId, filters.academicTermId) : undefined, filters.committeeId ? eq(s.goals.committeeId, filters.committeeId) : undefined, filters.status ? eq(s.goals.status, filters.status) : undefined, filters.ownerUserId ? eq(s.goals.ownerUserId, filters.ownerUserId) : undefined)).orderBy(desc(s.goals.createdAt));
}
export async function getGoal(ctx: Identity, id: string) {
  await requireActiveSession(ctx);
  const [row] = await db.select().from(s.goals).where(and(eq(s.goals.id, id), scopeWhere(ctx, "goal.view", { ...s.goals, owner: s.goals.ownerUserId })));
  if (!row) throw new HttpError(404, "الهدف غير متاح"); return row;
}
type GoalInput = { title: string; description?: string; academicTermId: string; committeeId?: string; ownerUserId?: string; targetType?: "qualitative" | "quantitative"; targetValue?: number; startAt?: Date; dueAt?: Date };
export async function createGoal(ctx: Identity, input: GoalInput) {
  const scope = { ...input, committeeId: input.committeeId ?? null, ownerUserId: input.ownerUserId ?? ctx.user.id };
  return write(ctx, scope, "goal.create", async tx => {
    await eligibleOwner(ctx, scope.ownerUserId, scope, "goal.view", tx);
    const [row] = await tx.insert(s.goals).values({ ...input, ...scope, title: title(input.title), createdBy: ctx.user.id, targetValue: input.targetValue === undefined ? null : integer(input.targetValue) }).returning();
    await audit(tx, ctx, "goal", row.id, "created"); return row;
  });
}
export async function updateGoal(ctx: Identity, id: string, input: { title?: string; description?: string; status?: s.GoalStatus; currentValue?: number; dueAt?: Date | null }) {
  const scope = await getGoal(ctx, id);
  return write(ctx, scope, "goal.update", async tx => {
    const [row] = await tx.select().from(s.goals).where(eq(s.goals.id, id));
    if (input.status && !goalStatusTransitions[row.status].includes(input.status)) throw new HttpError(409, "انتقال الحالة غير مسموح");
    if (input.currentValue !== undefined) demand(ctx, "goal.measure", row);
    const [updated] = await tx.update(s.goals).set({ ...input, title: input.title === undefined ? undefined : title(input.title), currentValue: input.currentValue === undefined ? undefined : integer(input.currentValue), updatedAt: new Date() }).where(eq(s.goals.id, id)).returning();
    await audit(tx, ctx, "goal", id, "updated", { from: row.status, to: updated.status }); return updated;
  });
}
export async function deleteGoal(ctx: Identity, id: string) { await getGoal(ctx, id); throw new HttpError(409, "استخدم الإلغاء للحفاظ على السجل المؤسسي"); }
