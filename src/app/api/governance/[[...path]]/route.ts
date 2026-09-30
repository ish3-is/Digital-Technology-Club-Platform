import { z } from "zod";
import { HttpError, identity } from "@/lib/services";
import * as goals from "@/lib/governance/goals.service";
import * as initiatives from "@/lib/governance/initiatives.service";
import * as kpis from "@/lib/governance/kpis.service";
import * as evidence from "@/lib/governance/evidence.service";
import * as reports from "@/lib/governance/reports.service";
import * as queries from "@/lib/governance/queries";
export const runtime = "nodejs";
const id = z.string().min(1).max(100), text = z.string().trim().max(12000), title = z.string().trim().min(3).max(200);
const date = z.iso.datetime({ offset: true }).transform(v => new Date(v));
const scope = { academicTermId: id, committeeId: id.optional() };
const goal = z.object({ ...scope, title, description: text.optional(), ownerUserId: id.optional(), targetType: z.enum(["qualitative", "quantitative"]).optional(), targetValue: z.number().int().optional(), startAt: date.optional(), dueAt: date.optional() }).strict();
const initiative = z.object({ title, description: text.optional(), goalId: id, ownerUserId: id.optional(), committeeId: id.optional(), startAt: date.optional(), dueAt: date.optional() }).strict();
const kpi = z.object({ ...scope, name: title, description: text.optional(), goalId: id.optional(), ownerUserId: id.optional(), unit: z.string().trim().min(1).max(50), direction: z.enum(["higher_is_better", "lower_is_better", "target_exact"]), targetValue: z.number().int(), baselineValue: z.number().int().optional(), measurementFrequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]), dueAt: date.optional() }).strict();
const evidenceInput = z.object({ title, description: text.optional(), evidenceType: z.enum(["file", "event", "report", "survey", "attendance", "task_aggregate", "manual"]), sourceEntityType: z.enum(["goal", "initiative", "kpi", "event", "report", "task", "meeting", "decision", "request"]), sourceEntityId: id, url: z.string().max(2048).optional(), date: date.optional(), classification: z.enum(["public", "internal", "restricted", "confidential"]).optional() }).strict();
const report = z.object({ ...scope, title, summary: text.optional(), typeId: id, periodStart: date, periodEnd: date, sectionKeys: z.array(z.enum(["achievements", "completed_work", "ongoing_work", "delayed_work", "challenges", "needs", "next_plan", "kpi_updates", "event_summaries", "decisions_summaries", "task_aggregates", "attendance_summaries"])).min(1).max(12) }).strict();
async function bytes(req: Request, max: number) { const reader = req.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0; if (reader) while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > max) { await reader.cancel(); throw new HttpError(413, "حجم الطلب أكبر من الحد"); } chunks.push(part.value); } return Buffer.concat(chunks); }
async function route(req: Request) {
  const ctx = await identity(req.headers), url = new URL(req.url), path = url.pathname.split("/").slice(3).filter(Boolean);
  const [kind, item, action] = path;
  if (req.method === "GET") {
    if (path.length <= 1) {
      if (!kind || kind === "lists") return Response.json(await queries.governanceLists(ctx));
      if (kind === "options") return Response.json(await queries.governanceOptions(ctx));
      if (kind === "snapshot") return Response.json(await queries.governanceSnapshot(ctx, { academicTermId: url.searchParams.get("term") || undefined, committeeId: url.searchParams.get("committee") || undefined }));
      if (kind === "search") return Response.json(await queries.governanceSearch(ctx, (url.searchParams.get("q") ?? "").slice(0, 160)));
      if (kind === "inbox") return Response.json(await queries.governanceInbox(ctx));
    }
    if (kind === "evidence" && item && action === "download" && path.length === 3) { const f = await evidence.downloadEvidence(ctx, item); return new Response(new Uint8Array(f.content), { headers: { "Content-Type": f.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } }); }
    if (path.length === 2) return Response.json(await queries.governanceDetail(ctx, z.enum(queries.governanceKinds).parse(kind), id.parse(item)));
  }
  if (req.method === "POST") {
    if (req.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin) throw new HttpError(403, "مصدر الطلب غير مسموح");
    if (kind === "evidence" && !item && req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await new Response(await bytes(req, 5 * 1024 * 1024 + 32768), { headers: { "Content-Type": req.headers.get("content-type") ?? "" } }).formData();
      const input = evidenceInput.parse(JSON.parse(String(form.get("input") ?? "{}"))), file = form.get("file");
      if (!(file instanceof File)) throw new HttpError(422, "اختر ملفًا");
      return Response.json(await evidence.createEvidence(ctx, input, { name: file.name, mime: file.type, bytes: Buffer.from(await file.arrayBuffer()) }), { status: 201 });
    }
    if (!req.headers.get("content-type")?.includes("application/json")) throw new HttpError(422, "يلزم JSON");
    const data: unknown = JSON.parse((await bytes(req, 64000)).toString() || "{}");
    if (path.length === 1) {
      if (kind === "goals") return Response.json(await goals.createGoal(ctx, goal.parse(data)), { status: 201 });
      if (kind === "initiatives") return Response.json(await initiatives.createInitiative(ctx, initiative.parse(data)), { status: 201 });
      if (kind === "kpis") return Response.json(await kpis.createKpi(ctx, kpi.parse(data)), { status: 201 });
      if (kind === "evidence") return Response.json(await evidence.createEvidence(ctx, evidenceInput.parse(data)), { status: 201 });
      if (kind === "reports") return Response.json(await reports.createReport(ctx, report.parse(data)), { status: 201 });
    }
    if (path.length === 3) {
      id.parse(item);
      if (kind === "goals" && action === "edit") return Response.json(await goals.updateGoal(ctx, item, z.object({ title: title.optional(), description: text.optional(), status: z.enum(["not_started", "in_progress", "at_risk", "completed", "cancelled"]).optional(), currentValue: z.number().int().optional(), dueAt: date.nullable().optional() }).strict().parse(data)));
      if (kind === "initiatives" && action === "edit") return Response.json(await initiatives.updateInitiative(ctx, item, z.object({ title: title.optional(), description: text.optional(), status: z.enum(["not_started", "in_progress", "completed", "cancelled"]).optional(), startAt: date.nullable().optional(), dueAt: date.nullable().optional() }).strict().parse(data)));
      if (kind === "initiatives" && action === "link") return Response.json(await initiatives.linkInitiativeWork(ctx, item, z.object({ workId: id }).strict().parse(data).workId));
      if (kind === "initiatives" && action === "goal") return Response.json(await initiatives.linkInitiativeToGoal(ctx, item, z.object({ goalId: id }).strict().parse(data).goalId));
      if (kind === "kpis" && action === "edit") return Response.json(await kpis.updateKpi(ctx, item, z.object({ name: title.optional(), description: text.optional(), targetValue: z.number().int().optional(), baselineValue: z.number().int().nullable().optional(), unit: z.string().min(1).max(50).optional(), status: z.enum(["active", "paused", "completed", "cancelled"]).optional(), dueAt: date.nullable().optional(), measurementFrequency: kpi.shape.measurementFrequency.optional() }).strict().parse(data)));
      if (kind === "kpis" && action === "measure") return Response.json(await kpis.addKpiMeasurement(ctx, { ...z.object({ value: z.number().int(), measuredAt: date, note: text.optional() }).strict().parse(data), kpiId: item, sourceType: "manual" }));
      if (kind === "evidence" && action === "edit") return Response.json(await evidence.updateEvidence(ctx, item, z.object({ title: title.optional(), description: text.optional(), classification: evidenceInput.shape.classification }).strict().parse(data)));
      if (kind === "evidence" && action === "verify") return Response.json(await evidence.verifyEvidence(ctx, item, z.object({ decision: z.enum(["reviewed", "rejected"]), comment: text.optional() }).strict().parse(data)));
      if (kind === "evidence" && action === "link") return Response.json(await evidence.linkEvidenceToKpiMeasurement(ctx, item, z.object({ measurementId: id }).strict().parse(data).measurementId));
      if (kind === "reports") {
        if (action === "edit") return Response.json(await reports.updateReport(ctx, item, z.object({ title: title.optional(), summary: text.optional(), periodStart: date.optional(), periodEnd: date.optional() }).strict().parse(data)));
        if (action === "section") { const input = z.object({ sectionId: id, content: text }).strict().parse(data); const r = await reports.getReport(ctx, item); if (!r.sections.some(s => s.id === input.sectionId)) throw new HttpError(404, "القسم غير متاح"); return Response.json(await reports.updateSection(ctx, input.sectionId, input)); }
        if (action === "reviewers") return Response.json(await reports.assignReviewers(ctx, item, z.object({ userIds: z.array(id).min(1).max(10) }).strict().parse(data).userIds));
        if (action === "review") return Response.json(await reports.reviewReport(ctx, item, z.object({ decision: z.enum(["approved", "changes_requested", "rejected"]), comment: text.optional() }).strict().parse(data)));
        z.object({}).strict().parse(data);
        if (action === "submit") return Response.json(await reports.submitReport(ctx, item));
        if (action === "approve") return Response.json(await reports.approveReport(ctx, item));
        if (action === "archive") return Response.json(await reports.archiveReport(ctx, item));
      }
    }
  }
  throw new HttpError(404, "المسار غير متاح");
}
async function handle(req: Request) {
  let response: Response;
  try { response = await route(req); } catch (e) {
    const status = e instanceof HttpError ? e.status : e instanceof z.ZodError || e instanceof SyntaxError ? 422 : 500;
    response = Response.json({ error: e instanceof HttpError ? e.message : status === 422 ? "تحقق من الحقول المدخلة" : "تعذر إكمال العملية" }, { status });
    if (status === 500) console.error("governance request failed", e);
  }
  response.headers.set("Cache-Control", "private, no-store"); return response;
}
export const GET = handle;
export const POST = handle;
