import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { getWork, type Connection } from "@/lib/work/access";
import { storage, validateFile } from "@/lib/work/storage";
import { allowed, audit, demand, requireActiveSession, title, write, type Scope } from "./helpers";
import { getGoal } from "./goals.service";
import { getInitiative } from "./initiatives.service";
import { getKpi } from "./kpis.service";
import { getReport } from "./reports.service";
export type EvidenceSource = typeof s.evidence.$inferSelect.sourceEntityType;
export async function sourceScope(ctx: Identity, type: EvidenceSource, id: string): Promise<Scope> {
  if (type === "goal") return getGoal(ctx, id);
  if (type === "initiative") return getInitiative(ctx, id);
  if (type === "kpi") return getKpi(ctx, id);
  if (type === "report") return getReport(ctx, id);
  const w = await getWork(ctx, id); if (w.kind !== type) throw new HttpError(404, "المصدر غير متاح");
  return { academicTermId: w.termId, committeeId: w.committeeId, createdBy: w.createdBy };
}
async function sourceEditable(type: EvidenceSource, id: string, tx: Connection) {
  if (type === "report") {
    const [report] = await tx.select().from(s.reports).where(eq(s.reports.id, id));
    if (!report || !["draft", "changes_requested", "rejected"].includes(report.status)) throw new HttpError(409, "أدلة التقرير مجمدة أثناء المراجعة وبعد الاعتماد");
  }
  if (type === "event") {
    const [r] = await tx.select().from(s.eventReports).where(eq(s.eventReports.eventId, id));
    const [w] = await tx.select().from(s.workItems).where(eq(s.workItems.id, id));
    if (!w || ["archived", "cancelled"].includes(w.status) || (r && ["pending", "approved"].includes(r.status))) throw new HttpError(409, "أدلة الفعالية مقفلة");
  }
}
async function canRead(ctx: Identity, row: typeof s.evidence.$inferSelect) {
  try {
    const scope = await sourceScope(ctx, row.sourceEntityType, row.sourceEntityId);
    return allowed(ctx, "evidence.view", scope) && (!["restricted", "confidential"].includes(row.classification) || row.uploadedBy === ctx.user.id || allowed(ctx, "evidence.verify", scope));
  } catch (e) { if (e instanceof HttpError && [403, 404].includes(e.status)) return false; throw e; }
}
export async function getEvidence(ctx: Identity, id: string) {
  await requireActiveSession(ctx);
  const [row] = await db.select().from(s.evidence).where(eq(s.evidence.id, id));
  if (!row || !(await canRead(ctx, row))) throw new HttpError(404, "الدليل غير متاح"); return row;
}
export async function listEvidence(ctx: Identity, filters: { evidenceType?: s.EvidenceType; sourceEntityType?: EvidenceSource; sourceEntityId?: string; classification?: s.EvidenceClassification; verificationStatus?: s.EvidenceVerificationStatus; uploadedBy?: string } = {}) {
  await requireActiveSession(ctx);
  const rows = await db.select().from(s.evidence).where(and(filters.evidenceType ? eq(s.evidence.evidenceType, filters.evidenceType) : undefined, filters.sourceEntityType ? eq(s.evidence.sourceEntityType, filters.sourceEntityType) : undefined, filters.sourceEntityId ? eq(s.evidence.sourceEntityId, filters.sourceEntityId) : undefined, filters.classification ? eq(s.evidence.classification, filters.classification) : undefined, filters.verificationStatus ? eq(s.evidence.verificationStatus, filters.verificationStatus) : undefined, filters.uploadedBy ? eq(s.evidence.uploadedBy, filters.uploadedBy) : undefined)).orderBy(desc(s.evidence.createdAt));
  const visible: typeof rows = []; for (const row of rows) if (await canRead(ctx, row)) visible.push(row); return visible;
}
type EvidenceInput = { title: string; description?: string; evidenceType: s.EvidenceType; sourceEntityType: EvidenceSource; sourceEntityId: string; fileId?: string; url?: string; date?: Date; classification?: s.EvidenceClassification };
export async function createEvidence(ctx: Identity, input: EvidenceInput, file?: { name: string; mime: string; bytes: Buffer }) {
  const scope = await sourceScope(ctx, input.sourceEntityType, input.sourceEntityId);
  if (input.fileId) throw new HttpError(422, "ارفع نسخة الدليل عبر الخزنة؛ لا تقبل معرفات ملفات عشوائية");
  if (input.url) { let url: URL; try { url = new URL(input.url); } catch { throw new HttpError(422, "الرابط غير صالح"); } if (url.protocol !== "https:" || url.username || url.password) throw new HttpError(422, "يلزم رابط HTTPS دون بيانات دخول"); }
  if (input.evidenceType === "file" && !file) throw new HttpError(422, "اختر ملف الدليل");
  if (!file && !input.url && !input.description?.trim()) throw new HttpError(422, "أضف ملفًا أو رابطًا أو وصفًا للدليل");
  const safeName = file ? validateFile(file.name, file.mime, file.bytes) : null;
  return write(ctx, scope, "evidence.create", async tx => {
    await sourceEditable(input.sourceEntityType, input.sourceEntityId, tx);
    let fileId: string | null = null;
    if (file && safeName) {
      fileId = crypto.randomUUID();
      await tx.insert(s.files).values({ id: fileId, name: safeName, mime: file.mime, size: file.bytes.length, sha256: createHash("sha256").update(file.bytes).digest("hex"), uploadedBy: ctx.user.id, classification: input.classification ?? "internal" });
      await storage.put(tx, fileId, file.bytes);
    }
    const [row] = await tx.insert(s.evidence).values({ title: title(input.title), description: input.description?.trim(), sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId, evidenceType: file ? "file" : input.evidenceType, url: input.url, date: input.date, classification: input.classification, fileId, uploadedBy: ctx.user.id }).returning();
    await audit(tx, ctx, "evidence", row.id, "created", { sourceEntityType: row.sourceEntityType, sourceEntityId: row.sourceEntityId, fileId }); return row;
  });
}
export async function updateEvidence(ctx: Identity, id: string, input: { title?: string; description?: string; classification?: s.EvidenceClassification }) {
  const evidence = await getEvidence(ctx, id), scope = await sourceScope(ctx, evidence.sourceEntityType, evidence.sourceEntityId);
  return write(ctx, scope, "evidence.create", async tx => {
    const [before] = await tx.select().from(s.evidence).where(eq(s.evidence.id, id));
    await sourceEditable(before.sourceEntityType, before.sourceEntityId, tx);
    if (before.uploadedBy !== ctx.user.id || before.verificationStatus !== "unreviewed") throw new HttpError(409, "الدليل المراجع ثابت؛ أضف دليلًا جديدًا عند التصحيح");
    const [row] = await tx.update(s.evidence).set({ ...input, title: input.title === undefined ? undefined : title(input.title), updatedAt: new Date() }).where(eq(s.evidence.id, id)).returning();
    await audit(tx, ctx, "evidence", id, "updated"); return row;
  });
}
export async function verifyEvidence(ctx: Identity, id: string, input: { decision: "reviewed" | "rejected"; comment?: string }) {
  const evidence = await getEvidence(ctx, id), scope = await sourceScope(ctx, evidence.sourceEntityType, evidence.sourceEntityId);
  return write(ctx, scope, "evidence.verify", async tx => {
    const [before] = await tx.select().from(s.evidence).where(eq(s.evidence.id, id));
    await sourceEditable(before.sourceEntityType, before.sourceEntityId, tx);
    if (before.uploadedBy === ctx.user.id) throw new HttpError(403, "التحقق يحتاج شخصًا مستقلًا");
    if (before.verificationStatus !== "unreviewed") throw new HttpError(409, "تم اتخاذ قرار التحقق بالفعل");
    if (!["reviewed", "rejected"].includes(input.decision) || (input.decision === "rejected" && !input.comment?.trim())) throw new HttpError(422, "قرار غير صالح أو سبب الرفض مفقود");
    const [row] = await tx.update(s.evidence).set({ verificationStatus: input.decision, updatedAt: new Date() }).where(eq(s.evidence.id, id)).returning();
    await audit(tx, ctx, "evidence", id, "verified", { from: before.verificationStatus, to: row.verificationStatus, comment: input.comment?.trim() ?? "" }); return row;
  });
}
export async function linkEvidenceToKpiMeasurement(ctx: Identity, evidenceId: string, measurementId: string) {
  const evidence = await getEvidence(ctx, evidenceId);
  const [measurement] = await db.select().from(s.kpiMeasurements).where(eq(s.kpiMeasurements.id, measurementId));
  if (!measurement) throw new HttpError(404, "القياس غير متاح");
  const kpi = await getKpi(ctx, measurement.kpiId), source = await sourceScope(ctx, evidence.sourceEntityType, evidence.sourceEntityId);
  if (kpi.academicTermId !== source.academicTermId || kpi.committeeId !== source.committeeId) throw new HttpError(422, "يجب تطابق نطاق الدليل والمؤشر");
  return write(ctx, kpi, "kpi.measure", async tx => {
    demand(ctx, "evidence.view", source);
    await tx.insert(s.kpiEvidence).values({ kpiMeasurementId: measurementId, evidenceId }).onConflictDoNothing();
    await audit(tx, ctx, "kpi", kpi.id, "evidence.linked", { evidenceId, measurementId }); return { ok: true };
  });
}
export async function getEvidenceForSource(ctx: Identity, sourceEntityType: EvidenceSource, sourceEntityId: string) { return listEvidence(ctx, { sourceEntityType, sourceEntityId }); }
export async function downloadEvidence(ctx: Identity, id: string) { const row = await getEvidence(ctx, id); if (!row.fileId) throw new HttpError(404, "لا يوجد ملف"); const [file] = await db.select().from(s.files).where(eq(s.files.id, row.fileId)); if (!file) throw new HttpError(404, "الملف غير متاح"); return { ...file, content: await storage.read(file.id) }; }
