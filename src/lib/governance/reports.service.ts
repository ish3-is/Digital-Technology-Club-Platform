import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { actorContext } from "@/lib/work/access";
import { audit, demand, requireActiveSession, scopeWhere, title, write } from "./helpers";
export async function listReports(ctx: Identity, filters: { academicTermId?: string; committeeId?: string; typeId?: string; status?: s.ReportStatus } = {}) {
  await requireActiveSession(ctx);
  return db.select().from(s.reports).where(and(scopeWhere(ctx, "report.view", { ...s.reports, owner: s.reports.createdBy }), filters.academicTermId ? eq(s.reports.academicTermId, filters.academicTermId) : undefined, filters.committeeId ? eq(s.reports.committeeId, filters.committeeId) : undefined, filters.typeId ? eq(s.reports.typeId, filters.typeId) : undefined, filters.status ? eq(s.reports.status, filters.status) : undefined)).orderBy(desc(s.reports.createdAt));
}
export async function getReport(ctx: Identity, id: string) {
  await requireActiveSession(ctx);
  const [row] = await db.select().from(s.reports).where(and(eq(s.reports.id, id), scopeWhere(ctx, "report.view", { ...s.reports, owner: s.reports.createdBy })));
  if (!row) throw new HttpError(404, "التقرير غير متاح");
  const sections = await db.select().from(s.reportSections).where(eq(s.reportSections.reportId, id));
  return { ...row, sections };
}
function editable(status: s.ReportStatus) { if (!["draft", "changes_requested", "rejected"].includes(status)) throw new HttpError(409, "التقرير مقفل أثناء المراجعة وبعد الاعتماد"); }
export async function createReport(ctx: Identity, input: { title: string; summary?: string; academicTermId: string; committeeId?: string; typeId: string; periodStart: Date; periodEnd: Date; sectionKeys: s.ReportSectionKey[] }) {
  const scope = { academicTermId: input.academicTermId, committeeId: input.committeeId ?? null, createdBy: ctx.user.id };
  if (!input.sectionKeys.length || new Set(input.sectionKeys).size !== input.sectionKeys.length) throw new HttpError(422, "اختر أقسامًا دون تكرار");
  if (input.periodEnd < input.periodStart) throw new HttpError(422, "فترة التقرير غير صالحة");
  return write(ctx, scope, "report.create", async tx => {
    const [type] = await tx.select().from(s.reportTypes).where(eq(s.reportTypes.id, input.typeId));
    if (!type) throw new HttpError(422, "نوع التقرير غير متاح");
    const [row] = await tx.insert(s.reports).values({ ...scope, title: title(input.title), summary: input.summary?.trim(), typeId: input.typeId, periodStart: input.periodStart, periodEnd: input.periodEnd, status: "draft" }).returning();
    await tx.insert(s.reportSections).values(input.sectionKeys.map(sectionKey => ({ reportId: row.id, sectionKey })));
    await audit(tx, ctx, "report", row.id, "created"); return row;
  });
}
export async function updateReport(ctx: Identity, id: string, input: { title?: string; summary?: string; periodStart?: Date; periodEnd?: Date }) {
  const scope = await getReport(ctx, id);
  return write(ctx, scope, "report.update", async tx => {
    const [before] = await tx.select().from(s.reports).where(eq(s.reports.id, id)); editable(before.status);
    if ((input.periodEnd ?? before.periodEnd) < (input.periodStart ?? before.periodStart)) throw new HttpError(422, "فترة التقرير غير صالحة");
    const [row] = await tx.update(s.reports).set({ title: input.title === undefined ? undefined : title(input.title), summary: input.summary, periodStart: input.periodStart, periodEnd: input.periodEnd, updatedAt: new Date() }).where(eq(s.reports.id, id)).returning();
    await audit(tx, ctx, "report", id, "updated"); return row;
  });
}
export async function updateSection(ctx: Identity, sectionId: string, input: { content?: string }) {
  const [section] = await db.select().from(s.reportSections).where(eq(s.reportSections.id, sectionId)); if (!section) throw new HttpError(404, "القسم غير متاح");
  const scope = await getReport(ctx, section.reportId);
  return write(ctx, scope, "report.update", async tx => {
    const [report] = await tx.select().from(s.reports).where(eq(s.reports.id, scope.id)); editable(report.status);
    const [row] = await tx.update(s.reportSections).set({ content: input.content?.trim(), updatedAt: new Date() }).where(eq(s.reportSections.id, sectionId)).returning();
    await audit(tx, ctx, "report", report.id, "section.updated", { sectionKey: row.sectionKey }); return row;
  });
}
export async function assignReviewers(ctx: Identity, id: string, userIds: string[]) {
  const scope = await getReport(ctx, id);
  if (!userIds.length || userIds.length > 10 || new Set(userIds).size !== userIds.length) throw new HttpError(422, "اختر مراجعًا إلى عشرة دون تكرار");
  return write(ctx, scope, "report.update", async tx => {
    const [report] = await tx.select().from(s.reports).where(eq(s.reports.id, id)); editable(report.status);
    for (const userId of userIds) {
      if (userId === report.createdBy) throw new HttpError(422, "المراجع مستقل عن المنشئ");
      const person = await actorContext(userId, tx); demand(person, "report.review", report); demand(person, "report.view", report);
      if (!person.user.onboarded) throw new HttpError(422, "المراجع لم يكمل إعداد الحساب");
    }
    await tx.delete(s.reportReviews).where(eq(s.reportReviews.reportId, id));
    await tx.insert(s.reportReviews).values(userIds.map(reviewerId => ({ reportId: id, reviewerId })));
    await audit(tx, ctx, "report", id, "reviewers.assigned", { userIds }); return { ok: true };
  });
}
export async function submitReport(ctx: Identity, id: string) {
  const scope = await getReport(ctx, id);
  return write(ctx, scope, "report.submit", async tx => {
    const [report] = await tx.select().from(s.reports).where(eq(s.reports.id, id)); editable(report.status);
    const sections = await tx.select().from(s.reportSections).where(eq(s.reportSections.reportId, id));
    if (!report.summary.trim() || !sections.length || sections.some(x => !x.content.trim())) throw new HttpError(422, "أكمل الملخص والأقسام قبل التقديم");
    const reviews = await tx.select().from(s.reportReviews).where(eq(s.reportReviews.reportId, id));
    if (!reviews.length) throw new HttpError(422, "عيّن مراجعًا مستقلًا");
    for (const r of reviews) { const person = await actorContext(r.reviewerId, tx); demand(person, "report.review", report); demand(person, "report.view", report); }
    await tx.update(s.reportReviews).set({ decision: "pending", comment: "" }).where(eq(s.reportReviews.reportId, id));
    const [row] = await tx.update(s.reports).set({ status: "submitted", submittedAt: new Date(), reviewedAt: null, updatedAt: new Date() }).where(eq(s.reports.id, id)).returning();
    await audit(tx, ctx, "report", id, "submitted", { previousStatus: report.status }); return row;
  });
}
export async function reviewReport(ctx: Identity, id: string, input: { decision: Exclude<s.ReportReviewDecision, "pending">; comment?: string }) {
  const scope = await getReport(ctx, id);
  return write(ctx, scope, "report.review", async tx => {
    const [report] = await tx.select().from(s.reports).where(eq(s.reports.id, id));
    if (!["submitted", "under_review"].includes(report.status)) throw new HttpError(409, "التقرير غير معلق للمراجعة");
    if (report.createdBy === ctx.user.id) throw new HttpError(403, "لا تراجع تقريرك");
    if (!["approved", "rejected", "changes_requested"].includes(input.decision)) throw new HttpError(422, "قرار غير صالح");
    if (input.decision !== "approved" && !input.comment?.trim()) throw new HttpError(422, "سبب القرار مطلوب");
    const [entry] = await tx.select().from(s.reportReviews).where(and(eq(s.reportReviews.reportId, id), eq(s.reportReviews.reviewerId, ctx.user.id), eq(s.reportReviews.decision, "pending")));
    if (!entry) throw new HttpError(403, "لا توجد مراجعة معلقة مسندة إليك");
    const [row] = await tx.update(s.reportReviews).set({ decision: input.decision, comment: input.comment?.trim() ?? "" }).where(eq(s.reportReviews.id, entry.id)).returning();
    await tx.update(s.reports).set({ status: input.decision === "approved" ? "under_review" : input.decision, updatedAt: new Date(), reviewedAt: new Date() }).where(eq(s.reports.id, id));
    await audit(tx, ctx, "report", id, "reviewed", { decision: input.decision, comment: row.comment, reviewerId: ctx.user.id }); return row;
  });
}
export async function approveReport(ctx: Identity, id: string) {
  const scope = await getReport(ctx, id);
  return write(ctx, scope, "report.approve", async tx => {
    const [report] = await tx.select().from(s.reports).where(eq(s.reports.id, id));
    if (report.createdBy === ctx.user.id) throw new HttpError(403, "لا تعتمد تقريرك");
    const reviews = await tx.select().from(s.reportReviews).where(eq(s.reportReviews.reportId, id));
    if (report.status !== "under_review" || !reviews.length || reviews.some(r => r.decision !== "approved")) throw new HttpError(409, "يلزم اكتمال توصيات المراجعين أولًا");
    const [row] = await tx.update(s.reports).set({ status: "approved", reviewedAt: new Date(), updatedAt: new Date() }).where(eq(s.reports.id, id)).returning();
    await audit(tx, ctx, "report", id, "approved"); return row;
  });
}
export async function archiveReport(ctx: Identity, id: string) {
  const scope = await getReport(ctx, id);
  return write(ctx, scope, "report.update", async tx => {
    const [report] = await tx.select().from(s.reports).where(eq(s.reports.id, id));
    if (report.status !== "approved") throw new HttpError(409, "الأرشفة بعد الاعتماد فقط");
    const [row] = await tx.update(s.reports).set({ status: "archived", updatedAt: new Date() }).where(eq(s.reports.id, id)).returning();
    await audit(tx, ctx, "report", id, "archived"); return row;
  });
}
export async function getReportReviewers(ctx: Identity, id: string) {
  await getReport(ctx, id);
  return db.select({ id: s.user.id, name: s.user.name, decision: s.reportReviews.decision, comment: s.reportReviews.comment }).from(s.reportReviews).innerJoin(s.user, eq(s.user.id, s.reportReviews.reviewerId)).where(eq(s.reportReviews.reportId, id));
}
