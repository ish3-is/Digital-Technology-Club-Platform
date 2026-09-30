import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { audit, eligibleOwner, integer, requireActiveSession, scopeWhere, title, write } from "./helpers";
import { getGoal } from "./goals.service";
import { kpiStatusTransitions } from "./types";
export async function listKpis(ctx: Identity, filters: { academicTermId?: string; committeeId?: string; goalId?: string; ownerUserId?: string; status?: s.KpiStatus } = {}) {
  await requireActiveSession(ctx);
  return db.select().from(s.kpis).where(and(scopeWhere(ctx, "kpi.view", { ...s.kpis, owner: s.kpis.ownerUserId }), filters.academicTermId ? eq(s.kpis.academicTermId, filters.academicTermId) : undefined, filters.committeeId ? eq(s.kpis.committeeId, filters.committeeId) : undefined, filters.goalId ? eq(s.kpis.goalId, filters.goalId) : undefined, filters.ownerUserId ? eq(s.kpis.ownerUserId, filters.ownerUserId) : undefined, filters.status ? eq(s.kpis.status, filters.status) : undefined)).orderBy(desc(s.kpis.createdAt));
}
export async function getKpi(ctx: Identity, id: string) {
  await requireActiveSession(ctx);
  const [row] = await db.select().from(s.kpis).where(and(eq(s.kpis.id, id), scopeWhere(ctx, "kpi.view", { ...s.kpis, owner: s.kpis.ownerUserId })));
  if (!row) throw new HttpError(404, "المؤشر غير متاح");
  const [latestMeasurement] = await db.select().from(s.kpiMeasurements).where(eq(s.kpiMeasurements.kpiId, id)).orderBy(desc(s.kpiMeasurements.measuredAt), desc(s.kpiMeasurements.createdAt), desc(s.kpiMeasurements.id)).limit(1);
  return { ...row, currentValue: latestMeasurement?.value ?? null, latestMeasurement: latestMeasurement ?? null };
}
type KpiInput = { name: string; description?: string; academicTermId: string; committeeId?: string; goalId?: string; ownerUserId?: string; unit: string; direction: s.KpiDirection; targetValue: number; baselineValue?: number; weight?: number; measurementFrequency: s.KpiFrequency; dueAt?: Date };
export async function createKpi(ctx: Identity, input: KpiInput) {
  const scope = { academicTermId: input.academicTermId, committeeId: input.committeeId ?? null, ownerUserId: input.ownerUserId ?? ctx.user.id };
  if (input.goalId) { const goal = await getGoal(ctx, input.goalId); if (goal.academicTermId !== scope.academicTermId || goal.committeeId !== scope.committeeId) throw new HttpError(422, "نطاق الهدف لا يطابق المؤشر"); }
  if (!input.unit.trim() || input.unit.length > 50) throw new HttpError(422, "وحدة المؤشر مطلوبة");
  return write(ctx, scope, "kpi.create", async tx => {
    await eligibleOwner(ctx, scope.ownerUserId, scope, "kpi.view", tx);
    const [row] = await tx.insert(s.kpis).values({ ...input, ...scope, name: title(input.name), targetValue: integer(input.targetValue), baselineValue: input.baselineValue === undefined ? null : integer(input.baselineValue), weight: input.weight === undefined ? null : integer(input.weight), createdBy: ctx.user.id }).returning();
    await audit(tx, ctx, "kpi", row.id, "created"); return row;
  });
}
export async function updateKpi(ctx: Identity, id: string, input: { name?: string; description?: string; unit?: string; targetValue?: number; baselineValue?: number | null; measurementFrequency?: s.KpiFrequency; dueAt?: Date | null; status?: s.KpiStatus }) {
  const scope = await getKpi(ctx, id);
  return write(ctx, scope, "kpi.update", async tx => {
    const [before] = await tx.select().from(s.kpis).where(eq(s.kpis.id, id));
    if (input.status && !kpiStatusTransitions[before.status].includes(input.status)) throw new HttpError(409, "انتقال الحالة غير مسموح");
    const [row] = await tx.update(s.kpis).set({ ...input, name: input.name === undefined ? undefined : title(input.name), targetValue: input.targetValue === undefined ? undefined : integer(input.targetValue), baselineValue: input.baselineValue == null ? input.baselineValue : integer(input.baselineValue), updatedAt: new Date() }).where(eq(s.kpis.id, id)).returning();
    await audit(tx, ctx, "kpi", id, "updated", { previousTarget: before.targetValue, target: row.targetValue }); return row;
  });
}
export async function addKpiMeasurement(ctx: Identity, input: { kpiId: string; value: number; measuredAt: Date; sourceType: s.MeasurementSourceType; sourceId?: string; note?: string }) {
  const scope = await getKpi(ctx, input.kpiId);
  if (input.sourceType !== "manual" || input.sourceId) throw new HttpError(422, "القياس اليدوي لا ينتحل مصدرًا مشتقًا؛ الحسابات التشغيلية معروضة في النبض");
  if (!Number.isFinite(input.measuredAt.getTime()) || input.measuredAt > new Date()) throw new HttpError(422, "تاريخ القياس غير صالح أو مستقبلي");
  return write(ctx, scope, "kpi.measure", async tx => {
    const [kpi] = await tx.select().from(s.kpis).where(eq(s.kpis.id, input.kpiId));
    if (kpi.status !== "active") throw new HttpError(409, "المؤشر غير نشط");
    const [row] = await tx.insert(s.kpiMeasurements).values({ kpiId: input.kpiId, value: integer(input.value), measuredAt: input.measuredAt, measuredBy: ctx.user.id, sourceType: "manual", note: input.note?.trim() }).returning();
    const [latest] = await tx.select().from(s.kpiMeasurements).where(eq(s.kpiMeasurements.kpiId, kpi.id)).orderBy(desc(s.kpiMeasurements.measuredAt), desc(s.kpiMeasurements.createdAt), desc(s.kpiMeasurements.id)).limit(1);
    await tx.update(s.kpis).set({ currentValue: latest.value, updatedAt: new Date() }).where(eq(s.kpis.id, kpi.id));
    await audit(tx, ctx, "kpi", kpi.id, "measured", { measurementId: row.id, value: row.value, measuredAt: row.measuredAt.toISOString(), sourceType: row.sourceType, note: row.note }); return row;
  });
}
export async function getKpiMeasurements(ctx: Identity, id: string) { await getKpi(ctx, id); return db.select().from(s.kpiMeasurements).where(eq(s.kpiMeasurements.kpiId, id)).orderBy(desc(s.kpiMeasurements.measuredAt), desc(s.kpiMeasurements.createdAt), desc(s.kpiMeasurements.id)); }
export async function deleteKpi(ctx: Identity, id: string) { await getKpi(ctx, id); throw new HttpError(409, "استخدم الإلغاء للحفاظ على سجل القياسات"); }
