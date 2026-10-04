/**
 * Intelligence reports.
 *
 * A report is generated from live records at request time. Nothing is persisted
 * unless the caller explicitly files it through the existing Reports system, so
 * a report can never show a snapshot that has drifted from the data.
 *
 * The same `Report` object backs the HTML view, the printable view and the CSV
 * export, which guarantees all three are generated under one actor scope.
 */
import type { Identity } from "@/lib/services";
import { hasLiveGrant } from "@/lib/people/helpers";
import { collectSnapshots, type Snapshots } from "./snapshots";
import { resolveRange, type TimeRange, type Metric } from "./provenance";
import {
  executionMetrics,
  peopleMetrics,
  financeMetrics,
  mediaMetrics,
  digitalMetrics,
  resourceMetrics,
} from "./metrics";
import { eventIntelligence } from "./readiness";
import { committeeIntelligence } from "./committees";
import { clubPulse } from "./pulse";
import { insights } from "./insights";

export type ReportTemplateKey =
  | "executive_periodic"
  | "committee"
  | "event"
  | "attendance"
  | "volunteer"
  | "operations"
  | "finance"
  | "governance";

export type ReportTemplate = {
  key: ReportTemplateKey;
  title: string;
  description: string;
  requiredPermission: string;
  /** Whether the template can be scoped to one committee. */
  supportsCommittee: boolean;
};

export const reportTemplates: ReportTemplate[] = [
  {
    key: "executive_periodic",
    title: "التقرير التنفيذي الدوري",
    description: "ملخص الفترة: التنفيذ، الفعاليات، الأشخاص، والعمليات",
    requiredPermission: "intelligence.executive",
    supportsCommittee: false,
  },
  {
    key: "committee",
    title: "تقرير اللجنة",
    description: "حالة اللجنة: العمل، الطلبات، الفعاليات، والأنشطة",
    requiredPermission: "intelligence.committees",
    supportsCommittee: true,
  },
  {
    key: "event",
    title: "تقرير فعالية",
    description: "جاهزية الفعالية ومتطلباتها والدعم التشغيلي",
    requiredPermission: "intelligence.events",
    supportsCommittee: false,
  },
  {
    key: "attendance",
    title: "تقرير الحضور",
    description: "سجلات الحضور عبر الفعاليات",
    requiredPermission: "intelligence.view",
    supportsCommittee: false,
  },
  {
    key: "volunteer",
    title: "تقرير الساعات التطوعية",
    description: "الساعات المعتمدة فقط، بلا بيانات شخصية",
    requiredPermission: "intelligence.view",
    supportsCommittee: false,
  },
  {
    key: "operations",
    title: "تقرير التشغيل",
    description: "حالة الإعلام والرقمية والموارد",
    requiredPermission: "intelligence.view",
    supportsCommittee: false,
  },
  {
    key: "finance",
    title: "التقرير المالي التشغيلي",
    description: "المخصص والملتزم والمنصرف والمتبقي",
    requiredPermission: "finance.view",
    supportsCommittee: false,
  },
  {
    key: "governance",
    title: "تقرير الحوكمة والمؤشرات",
    description: "الأهداف والمبادرات والمؤشرات وقياساتها",
    requiredPermission: "intelligence.view",
    supportsCommittee: false,
  },
];

export type ReportSection = {
  title: string;
  /** Rows of the section; a table in the printed view. */
  rows: { label: string; value: string; note?: string; href?: string }[];
};

export type Report = {
  template: ReportTemplateKey;
  title: string;
  generatedAt: string;
  period: { from: Date; to: Date; label: string };
  scope: { committeeId: string | null; committeeName: string | null };
  sections: ReportSection[];
  /** Metric provenance, printed with the report. */
  provenance: {
    key: string;
    title: string;
    value: number | null;
    formula: string;
    numerator: number | null;
    denominator: number | null;
    sources: string[];
    available: boolean;
    reasonUnavailable?: string;
  }[];
  /** Statement of what this report does and does not claim. */
  notes: string[];
};

function metricProvenance(metrics: Metric[]) {
  return metrics.map((m) => ({
    key: m.key,
    title: m.title,
    value: m.value,
    formula: m.formula,
    numerator: m.numerator,
    denominator: m.denominator,
    sources: m.sourceDomains,
    available: m.availability.available,
    reasonUnavailable: m.availability.available
      ? undefined
      : m.availability.reasonUnavailable,
  }));
}

const fmt = (n: number | null) => (n === null ? "غير متاح" : n.toLocaleString("ar-SA"));

/**
 * Generates a report under the caller's scope. Every figure comes from the
 * scoped snapshot, so an actor without finance access simply has no finance
 * section rather than a redacted one.
 */
export async function generateReport(
  ctx: Identity,
  input: {
    template: ReportTemplateKey;
    range?: string;
    committeeId?: string;
    eventId?: string;
  },
): Promise<Report> {
  const template = reportTemplates.find((t) => t.key === input.template);
  if (!template) throw new Error("قالب التقرير غير معروف");
  if (!hasLiveGrant(ctx, template.requiredPermission))
    throw new Error("لا تملك صلاحية إنشاء هذا التقرير");

  const snap = await collectSnapshots(ctx);
  const now = new Date();
  const range: TimeRange = resolveRange(input.range ?? "term", snap.term, now);
  const committeeId =
    template.supportsCommittee && input.committeeId ? input.committeeId : null;
  const committeeName = committeeId
    ? (snap.committees.find((c) => c.id === committeeId)?.name ?? null)
    : null;

  const execution = executionMetrics(snap, range, now);
  const people = peopleMetrics(snap, range);
  const finance = financeMetrics(snap, range);
  const media = mediaMetrics(snap, range, now);
  const digital = digitalMetrics(snap, range, now);
  const resources = resourceMetrics(snap, range, now);
  const events = eventIntelligence(snap, now);

  const sections: ReportSection[] = [];
  const provenance: Report["provenance"] = [];
  const notes: string[] = [];

  const row = (label: string, value: string | number | null, note?: string, href?: string) => ({
    label,
    value: value === null ? "غير متاح" : String(value),
    note,
    href,
  });

  switch (input.template) {
    case "executive_periodic": {
      const pulse = clubPulse(snap, range, now);
      sections.push({
        title: "نبض النادي",
        rows: pulse.dimensions.map((d) =>
          row(d.title, d.explanation, d.primary.availability.available ? undefined : d.primary.availability.reasonUnavailable, d.href),
        ),
      });
      sections.push({
        title: "التنفيذ",
        rows: [
          row("المهام المكتملة", execution.completed.value),
          row("المهام المفتوحة", execution.open.value),
          row("المهام المتأخرة", execution.overdue.value),
          row("نسبة الإكمال", execution.completionRate.value === null ? null : `${execution.completionRate.value}٪`, execution.completionRate.availability.available ? undefined : execution.completionRate.availability.reasonUnavailable),
        ],
      });
      sections.push({
        title: "الأشخاص والحوكمة",
        rows: [
          row("الأعضاء النشطون", people.activeMembers.value),
          row("نسبة إكمال التأهيل", people.onboardingCompletionRate.value === null ? null : `${people.onboardingCompletionRate.value}٪`),
          row("الساعات التطوعية المعتمدة", people.approvedVolunteerHours.value),
          row("نسبة الحضور", people.attendanceRate.value === null ? null : `${people.attendanceRate.value}٪`),
        ],
      });
      if (finance.available)
        sections.push({
          title: "المالية",
          rows: [
            row("المخصص", finance.allocated.value),
            row("الملتزم", finance.committed.value),
            row("المنصرف فعليًا", finance.spent.value),
            row("المتبقي", finance.remaining.value),
            row("نسبة الاستهلاك", finance.utilization.value === null ? null : `${finance.utilization.value}٪`),
          ],
        });
      provenance.push(
        ...metricProvenance([
          execution.completionRate,
          execution.overdue,
          people.onboardingCompletionRate,
          people.attendanceRate,
          ...(finance.available ? [finance.utilization, finance.spent] : []),
        ]),
      );
      notes.push(pulse.note);
      break;
    }

    case "committee": {
      const committees = committeeIntelligence(snap, now).filter(
        (c) => !committeeId || c.id === committeeId,
      );
      // The committee report is a status report rather than a ratio report, so
      // its provenance comes from the workload figures behind each status.
      provenance.push(
        ...metricProvenance([execution.completed, execution.open, execution.overdue]),
      );
      for (const c of committees) {
        sections.push({
          title: c.name,
          rows: [
            row("الأعضاء الموزّعون", c.activeMembers),
            row("الأعمال المفتوحة", c.openWork),
            row("المتأخرات", c.overdue),
            row("طلبات مُرسلة", c.requestsSent),
            row("طلبات مُستلمة", c.requestsReceived),
            row("فعاليات خلال ١٤ يومًا", c.upcomingEventResponsibilities),
            row("ساعات تطوعية معتمدة", c.volunteerHours),
            ...c.statuses.map((s) => row(s.label, s.basis.join(" · "))),
          ],
        });
        notes.push(`${c.name}: ${c.scoreNote}`);
      }
      break;
    }

    case "event": {
      const rows = input.eventId
        ? events.filter((e) => e.id === input.eventId)
        : events.slice(0, 20);
      if (rows.length === 0)
        sections.push({ title: "الفعاليات", rows: [row("لا توجد فعاليات مسجلة", null)] });
      for (const e of rows)
        sections.push({
          title: e.title,
          rows: [
            row("الحالة", e.status),
            row("الجاهزية", e.readinessPercent === null ? null : `${e.readinessPercent}٪`, e.total === 0 ? "لا توجد متطلبات مسجلة" : undefined, `/intelligence/events?event=${e.id}`),
            row("المتطلبات المكتملة", `${e.completed} من ${e.total}`),
            row("سجلات الحضور", e.attendanceCount),
            row("دعم تشغيلي مرتبط", e.supportLinked ? "نعم" : "لا"),
            row("حالة التقرير", e.reportStatus ?? "غير مسجل"),
          ],
        });
      break;
    }

    case "attendance": {
      const byEvent = snap.events.map((e) => {
        const rows = snap.attendance.filter((a) => a.eventId === e.id);
        const present = rows.filter((a) => a.status === "present").length;
        return {
          title: e.title,
          rows: [
            row("سجلات الحضور", rows.length, undefined, `/events/${e.id}`),
            row("الحاضرون", present),
            row("النسبة", rows.length ? `${Math.round((present / rows.length) * 100)}٪` : null, rows.length === 0 ? "لا توجد سجلات لهذه الفعالية" : undefined),
          ],
        };
      });
      sections.push(...(byEvent.length ? byEvent : [{ title: "الحضور", rows: [row("لا توجد فعاليات", null)] }]));
      provenance.push(...metricProvenance([people.attendanceRate]));
      break;
    }

    case "volunteer": {
      const approved = snap.volunteerHours.filter((h) => h.status === "approved");
      const total = approved.reduce((sum, h) => sum + h.hours, 0);
      const bySource = approved.reduce<Record<string, number>>((acc, h) => {
        acc[h.sourceType] = (acc[h.sourceType] ?? 0) + h.hours;
        return acc;
      }, {});
      sections.push({
        title: "الساعات التطوعية",
        rows: [
          row("إجمالي الساعات المعتمدة", total, "المعروضة والمسترفضة لا تُحتسب"),
          ...Object.entries(bySource).map(([k, v]) => row(k, v)),
          ...(approved.length === 0 ? [row("لا توجد ساعات معتمدة", null)] : []),
        ],
      });
      provenance.push(...metricProvenance([people.approvedVolunteerHours]));
      break;
    }

    case "operations": {
      sections.push({
        title: "الإعلام",
        rows: [
          row("إجمالي الطلبات", media.available ? media.total.value : null),
          row("بانتظار المراجعة", media.available ? media.waitingReview.value : null),
          row("يحتاج تعديلات", media.available ? media.changesRequested.value : null),
          row("متأخر", media.available ? media.overdue.value : null),
        ],
      });
      sections.push({
        title: "الخدمات الرقمية",
        rows: [
          row("طلبات مفتوحة", digital.available ? digital.open.value : null),
          row("مكتملة", digital.available ? digital.completed.value : null),
          row("نماذج مفتوحة", digital.available ? digital.activeForms.value : null),
          row("دفعات شهادات", digital.available ? digital.batches.value : null),
        ],
      });
      sections.push({
        title: "الموارد",
        rows: [
          row("أصول متاحة", resources.available_ ? resources.available.value : null),
          row("أصول مستلمة", resources.available_ ? resources.checkedOut.value : null),
          row("حجوزات بانتظار الاعتماد", resources.available_ ? resources.pendingReservations.value : null),
          row("بلاغات مفتوحة", resources.available_ ? resources.openIncidents.value : null),
        ],
      });
      break;
    }

    case "finance": {
      if (!finance.available)
        throw new Error("لا تملك صلاحية قراءة البيانات المالية");
      sections.push({
        title: "الملخص المالي",
        rows: [
          row("إجمالي المخصص", finance.allocated.value),
          row("الملتزم", finance.committed.value),
          row("المنصرف فعليًا", finance.spent.value, "مأخوذ من مبلغ عملية الشراء المسجَّل، لا من المبلغ المطلوب"),
          row("المتبقي", finance.remaining.value),
          row("نسبة الاستهلاك", finance.utilization.value === null ? null : `${finance.utilization.value}٪`),
        ],
      });
      sections.push({
        title: "طلبات مصروف",
        rows: snap.expenses.map((e) =>
          row(e.title, `${fmt(e.amount)} · ${e.status}`, undefined, `/operations/finance?expense=${e.id}`),
        ),
      });
      provenance.push(...metricProvenance([finance.utilization, finance.spent, finance.unreconciled]));
      break;
    }

    case "governance": {
      const pulse = clubPulse(snap, range, now);
      const governance = pulse.dimensions.find((d) => d.key === "governance")!;
      sections.push({
        title: "الأهداف",
        rows: snap.goals.map((g) => row(g.title, g.status, undefined, `/governance?tab=goals&item=${g.id}`)),
      });
      sections.push({
        title: "المؤشرات",
        rows: snap.kpis.map((k) =>
          row(
            k.name,
            `${k.currentValue ?? "بلا قياس"} / ${k.targetValue ?? "—"} ${k.unit}`,
            undefined,
            `/governance?tab=kpis&item=${k.id}`,
          ),
        ),
      });
      provenance.push(...metricProvenance([governance.primary]));
      break;
    }
  }

  return {
    template: input.template,
    title: `${template.title}${committeeName ? ` — ${committeeName}` : ""}`,
    generatedAt: new Date().toISOString(),
    period: { from: range.from, to: range.to, label: range.labelAr },
    scope: { committeeId, committeeName },
    sections,
    provenance,
    notes: [
      "أُنشئ هذا التقرير من السجلات الحالية وقت التوليد، ولم يُخزَّن أي نسخة منه.",
      "كل رقم مشتق من سجلات فعلية، ويمرر bersamaه مصدره وصيغته في قسم الإسناد.",
      "لا يتضمن هذا التقرير أي ترتيب أو تصنيف بين الأعضاء أو اللجان.",
      ...notes,
    ],
  };
}

/**
 * CSV export. Generated from the same `Report`, so it can never contain a row
 * the HTML view would have withheld. A BOM is written so Arabic opens correctly
 * in spreadsheet software.
 */
export function reportToCsv(report: Report): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push(esc(report.title));
  lines.push(esc("الفترة"), esc(report.period.label));
  lines.push(esc("من"), esc(report.period.from.toISOString().slice(0, 10)));
  lines.push(esc("إلى"), esc(report.period.to.toISOString().slice(0, 10)));
  lines.push(esc("وقت التوليد"), esc(report.generatedAt));
  lines.push("");
  for (const section of report.sections) {
    lines.push(esc(section.title));
    lines.push(esc("البند") + "," + esc("القيمة") + "," + esc("ملاحظة"));
    for (const r of section.rows)
      lines.push([esc(r.label), esc(r.value), esc(r.note ?? "")].join(","));
    lines.push("");
  }
  lines.push(esc("الإسناد"));
  lines.push([esc("المؤشر"), esc("القيمة"), esc("البسط"), esc("المقام"), esc("الصيغة"), esc("المصدر")].join(","));
  for (const p of report.provenance)
    lines.push(
      [
        esc(p.title),
        esc(p.value === null ? "غير متاح" : String(p.value)),
        esc(p.numerator === null ? "—" : String(p.numerator)),
        esc(p.denominator === null ? "—" : String(p.denominator)),
        esc(p.formula),
        esc(p.sources.join(" + ")),
      ].join(","),
    );
  return "﻿" + lines.join("\r\n");
}

/** Row-level export used by the operations and event pages. */
export function rowsToCsv(
  title: string,
  headers: string[],
  rows: (string | number | null)[][],
): string {
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return (
    "﻿" +
    [esc(title), headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n")
  );
}

export { insights };