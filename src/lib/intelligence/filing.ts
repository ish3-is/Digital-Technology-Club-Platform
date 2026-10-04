/**
 * Filing an intelligence report into the existing Reports system.
 *
 * This files a snapshot — it does not create a second repository. The report
 * goes through `reports.service.ts`, so the existing workflow and the existing
 * separation of duties apply unchanged:
 *
 *   filed (draft) → submitted → under_review → approved
 *
 * Filing never approves. `report.review` and `report.approve` remain distinct
 * grants, and the person who files a report can never approve it.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { hasLiveGrant } from "@/lib/people/helpers";
import { collectSnapshots, type Snapshots } from "./snapshots";
import { resolveRange, type TimeRange } from "./provenance";
import {
  generateReport,
  reportTemplates,
  type Report,
  type ReportTemplateKey,
} from "./reports";
import * as reports from "@/lib/governance/reports.service";
import type { ReportSectionKey } from "@/db/schema";

/**
 * Maps each intelligence template onto the report type and section keys that
 * already exist in the catalogue. No new type is invented unless the catalogue
 * genuinely lacks one, in which case the fallback is declared here.
 */
export type FilingMapping = {
  typeId: string;
  typeName: string;
  sectionKeys: ReportSectionKey[];
  /** Whether the catalogue already had this type, or filing provisions it. */
  provisioned: boolean;
};

const FALLBACK_TYPE = "intelligence-report";

/**
 * Section keys are the existing vocabulary, so a filed report reads the same
 * as any other report in the governance area. Provenance and the metric
 * snapshot are written into the section content, not invented alongside it.
 */
const MAPPINGS: Record<ReportTemplateKey, Omit<FilingMapping, "provisioned">> = {
  executive_periodic: {
    typeId: FALLBACK_TYPE,
    typeName: "التقرير التنفيذي الدوري",
    sectionKeys: [
      "completed_work",
      "ongoing_work",
      "delayed_work",
      "task_aggregates",
      "attendance_summaries",
      "needs",
    ],
  },
  committee: {
    typeId: FALLBACK_TYPE,
    typeName: "تقرير اللجنة",
    sectionKeys: [
      "completed_work",
      "ongoing_work",
      "delayed_work",
      "task_aggregates",
      "attendance_summaries",
      "next_plan",
    ],
  },
  event: {
    typeId: FALLBACK_TYPE,
    typeName: "تقرير الفعالية",
    sectionKeys: ["event_summaries", "attendance_summaries", "completed_work", "achievements"],
  },
  attendance: {
    typeId: FALLBACK_TYPE,
    typeName: "تقرير الحضور",
    sectionKeys: ["attendance_summaries", "task_aggregates"],
  },
  volunteer: {
    typeId: FALLBACK_TYPE,
    typeName: "تقرير الساعات التطوعية",
    sectionKeys: ["achievements", "completed_work", "attendance_summaries"],
  },
  operations: {
    typeId: FALLBACK_TYPE,
    typeName: "تقرير التشغيل",
    sectionKeys: ["ongoing_work", "delayed_work", "task_aggregates", "challenges", "needs"],
  },
  finance: {
    typeId: FALLBACK_TYPE,
    typeName: "التقرير المالي التشغيلي",
    sectionKeys: ["task_aggregates", "completed_work", "needs"],
  },
  governance: {
    typeId: FALLBACK_TYPE,
    typeName: "تقرير الحوكمة والمؤشرات",
    sectionKeys: ["kpi_updates", "completed_work", "next_plan", "needs"],
  },
};

export function mappingFor(template: ReportTemplateKey): FilingMapping {
  return { ...MAPPINGS[template], provisioned: false };
}

/**
 * The permission required to file each template.
 *
 * Filing an official report is a stronger act than viewing intelligence, so it
 * requires an explicit grant: club leadership for executive and finance
 * reports, the committee scope for a committee report, and the ordinary report
 * grant for the rest.
 */
export function canFile(ctx: Identity, template: ReportTemplateKey): boolean {
  if (template === "executive_periodic" || template === "finance")
    return (
      hasLiveGrant(ctx, "intelligence.reports") &&
      hasLiveGrant(ctx, template === "finance" ? "finance.view" : "intelligence.executive")
    );
  if (template === "committee") return hasLiveGrant(ctx, "intelligence.reports");
  return hasLiveGrant(ctx, "intelligence.reports") || hasLiveGrant(ctx, "report.create");
}

export type FiledReport = {
  reportId: string;
  status: string;
  typeId: string;
  typeName: string;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  /** The snapshot payload, exactly as filed. */
  snapshot: Report;
};

/**
 * Renders the report into the existing section vocabulary.
 *
 * The rendered text preserves what was reported at filing time: every figure
 * and its provenance are written into the section content, so the filed report
 * stays truthful even if the underlying records later change.
 */
export function renderSections(report: Report): { sectionKey: ReportSectionKey; content: string }[] {
  const iso = (d: Date) => new Date(d).toISOString().slice(0, 10);
  const period = `${report.period.label} (${iso(report.period.from)} — ${iso(report.period.to)})`;
  const provenance = report.provenance
    .map(
      (p) =>
        `• ${p.title}: ${p.value === null ? "غير متاح" : p.value}` +
        (p.denominator !== null ? ` (${p.numerator ?? "—"}/${p.denominator})` : "") +
        ` — ${p.available ? p.formula : p.reasonUnavailable} — المصدر: ${p.sources.join(" + ")}`,
    )
    .join("\n");

  const body = report.sections
    .map((s) => `【${s.title}】\n${s.rows.map((r) => `- ${r.label}: ${r.value}${r.note ? ` (${r.note})` : ""}`).join("\n")}`)
    .join("\n\n");

  const header =
    `تقرير مُستند إلى الاستخبارات التشغيلية\n` +
    `الفترة: ${period}\n` +
    `وقت التوليد: ${report.generatedAt}\n` +
    `النطاق: ${report.scope.committeeName ?? "النادي"}`;

  const out: { sectionKey: ReportSectionKey; content: string }[] = [];
  const keys = MAPPINGS[report.template].sectionKeys;

  // The first section carries the summary so the report is readable on open.
  out.push({ sectionKey: keys[0], content: `${header}\n\n${body}` });
  if (provenance)
    out.push({
      sectionKey: keys.includes("kpi_updates") ? "kpi_updates" : "task_aggregates",
      content: `إسناد المؤشرات (لحظة الإيداع)\n${provenance}\n\n${report.notes.map((n) => `- ${n}`).join("\n")}`,
    });
  const used = new Set(out.map((r) => r.sectionKey));
  for (const key of keys) {
    if (used.has(key)) continue;
    // Remaining keys are filled from the same snapshot rather than left empty,
    // because a report cannot be submitted with an empty section.
    const match = report.sections.find((s) =>
      key.startsWith("attendance") ? /حضور|الحضور/.test(s.title) : /تنبيه|تشغيل|المال|مهام|إcept|حالة/.test(s.title),
    );
    used.add(key);
    out.push({
      sectionKey: key,
      content: match
        ? `【${match.title}】\n${match.rows.map((r) => `- ${r.label}: ${r.value}`).join("\n")}`
        : `لا توجد عناصر مسجلة لهذا المحور في الفترة (${period}).\n\n${header}`,
    });
  }
  return out;
}

/**
 * Deterministic filing token.
 *
 * Two clicks on the same template and period produce the same token, so a
 * double submission is refused as a duplicate rather than creating two
 * official reports for one period.
 */
export function filingToken(input: {
  template: ReportTemplateKey;
  periodStart: Date;
  periodEnd: Date;
  committeeId: string | null;
}): string {
  const raw = [
    input.template,
    input.periodStart.toISOString().slice(0, 10),
    input.periodEnd.toISOString().slice(0, 10),
    input.committeeId ?? "club",
  ].join("|");
  // A short, stable digest is enough: it only has to be deterministic.
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  return `${input.template}-${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Files a generated intelligence report into the existing Reports system.
 *
 * The report is created through `createReport`, which enforces `report.create`,
 * and lands in `draft`. Submission, review and approval stay with the existing
 * workflow and their own permissions.
 */
export async function fileIntelligenceReport(
  ctx: Identity,
  input: {
    template: ReportTemplateKey;
    range?: string;
    committeeId?: string;
    eventId?: string;
    /** Explicit acknowledgement, required when a report already exists. */
    acknowledgeDuplicate?: boolean;
  },
): Promise<FiledReport> {
  if (!reportTemplates.some((t) => t.key === input.template))
    throw new HttpError(404, "قالب التقرير غير موجود");
  if (!canFile(ctx, input.template))
    throw new HttpError(403, "لا تملك صلاحية إيداع هذا التقرير رسميًا");

  const snap = await collectSnapshots(ctx);
  const term = snap.term;
  if (!term) throw new HttpError(409, "لا يوجد فصل أكاديمي نشط لحفظ التقرير فيه");

  const report = await generateReport(ctx, {
    template: input.template,
    range: input.range,
    committeeId: input.committeeId,
    eventId: input.eventId,
  });
  const mapping = mappingFor(input.template);
  const committeeId = input.committeeId ?? null;
  const token = filingToken({
    template: input.template,
    periodStart: report.period.from,
    periodEnd: report.period.to,
    committeeId,
  });

  // Duplicate protection: the token is written into the summary, and an
  // existing report carrying the same token is refused unless the caller
  // explicitly acknowledged it.
  const existing = await db
    .select({ id: s.reports.id, title: s.reports.title, status: s.reports.status })
    .from(s.reports)
    .where(eq(s.reports.createdBy, ctx.user.id));
  const clash = existing.find((r) => r.title.includes(token));
  if (clash && !input.acknowledgeDuplicate)
    throw new HttpError(409, `سبق إيداع تقرير لهذه الفترة (${clash.status})، حدّد الإيداع المتكرر بوضوح إذا أردت نسخة أخرى`);

  const [type] = await db
    .select()
    .from(s.reportTypes)
    .where(eq(s.reportTypes.id, mapping.typeId));
  if (!type)
    // The catalogue lacks this type; provision it once through the same table
    // rather than inventing a parallel repository.
    await db.insert(s.reportTypes).values({
      id: mapping.typeId,
      name: mapping.typeName,
      description: "تقارير مُودعة من طبقة الاستخبارات التشغيلية",
      isSystem: true,
      category: "standard",
    });

  const rendered = renderSections(report);
  // The section vocabulary must not repeat; `createReport` rejects duplicates,
  // and the provenance block shares a key with a regular section.
  const uniqueKeys = [...new Set(rendered.map((r) => r.sectionKey))];
  const created = await reports.createReport(ctx, {
    title: `${report.title} [${token}]`,
    summary: `تقرير استخبارات مُودع. ${report.period.label} · وقت التوليد ${report.generatedAt} · ${report.provenance.length} مؤشرًا بالإسناد.`,
    academicTermId: term.id,
    committeeId: committeeId ?? undefined,
    typeId: mapping.typeId,
    periodStart: report.period.from,
    periodEnd: report.period.to,
    sectionKeys: uniqueKeys,
  });

  // The section rows already exist from createReport; fill their content with
  // the snapshot so the filed report keeps its figures after the fact.
  const sections = await db
    .select()
    .from(s.reportSections)
    .where(eq(s.reportSections.reportId, created.id));
  // Sections are paired by key, not by position: the section rows are created
  // from a deduplicated key list.
  const contentByKey = new Map(rendered.map((r) => [r.sectionKey, r.content]));
  for (const row of sections) {
    const content = contentByKey.get(row.sectionKey);
    if (content) await reports.updateSection(ctx, row.id, { content });
  }

  return {
    reportId: created.id,
    status: created.status,
    typeId: mapping.typeId,
    typeName: mapping.typeName,
    title: created.title,
    periodStart: created.periodStart,
    periodEnd: created.periodEnd,
    snapshot: report,
  };
}

/** Reports this actor filed from intelligence, for the reports index. */
export async function filedIntelligenceReports(ctx: Identity, limit = 20) {
  const rows = await reports.listReports(ctx, {}).catch(() => []);
  return rows
    .filter((r) => r.title.includes("-") && /-\w{8}\]$/.test(r.title))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      typeId: r.typeId,
      href: `/governance?tab=reports&item=${r.id}`,
    }));
}

/** Convenience for the reports page: which templates this actor may file. */
export function fileableTemplates(ctx: Identity) {
  return reportTemplates.map((t) => ({ ...t, fileable: canFile(ctx, t.key) }));
}

/** The term id a report would be filed under, without filing anything. */
export async function filingTerm(ctx: Identity): Promise<string | null> {
  const snap: Snapshots = await collectSnapshots(ctx);
  return snap.term?.id ?? null;
}
