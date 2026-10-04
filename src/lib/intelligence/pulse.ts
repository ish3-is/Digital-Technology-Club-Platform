/**
 * Club Pulse — نبض النادي.
 *
 * Deliberately NOT one number. Six dimensions are reported side by side, each
 * with its own state, its own provenance, and its own reason when it cannot be
 * computed. A single headline exists only as a categorical reading of those
 * dimensions, and it names the dimension that drove it.
 */
import type { Snapshots } from "./snapshots";
import {
  executionMetrics,
  financeMetrics,
  mediaMetrics,
  digitalMetrics,
  peopleMetrics,
  resourceMetrics,
} from "./metrics";
import { eventIntelligence } from "./readiness";
import { unavailableMetric, type Metric, type TimeRange } from "./provenance";

export type PulseDimensionKey =
  | "execution"
  | "events"
  | "people"
  | "governance"
  | "operations"
  | "engagement";

export type PulseState = "steady" | "watch" | "pressure" | "unavailable";

export type PulseDimension = {
  key: PulseDimensionKey;
  title: string;
  state: PulseState;
  /** Arabic sentence explaining the state from concrete numbers. */
  explanation: string;
  /** The metric the state was derived from, with its own provenance. */
  primary: Metric;
  /** Supporting metrics shown alongside the headline. */
  support: Metric[];
  href: string;
};

export type ClubPulse = {
  dimensions: PulseDimension[];
  /**
   * A categorical reading, not a weighted score. `drivenBy` names the dimension
   * that set it so nothing is hidden behind the label.
   */
  headline: {
    state: PulseState | "mixed";
    label: string;
    drivenBy: PulseDimensionKey | null;
    explanation: string;
  };
  /** Explicit statement that no single score was computed, and why. */
  note: string;
};

const stateLabel: Record<PulseState, string> = {
  steady: "مستقر",
  watch: "يحتاج متابعة",
  pressure: "ضغط تشغيلي",
  unavailable: "غير متاح",
};

/**
 * The state rule is deterministic and visible: a dimension is under pressure
 * when its overdue share is high, on watch when any overdue exist, and steady
 * otherwise. No weights, no hidden scoring.
 */
function stateFor(overdue: Metric, total: Metric): PulseState {
  if (total.value === 0) return "unavailable";
  if (overdue.value === 0) return "steady";
  const share = Math.round(((overdue.value ?? 0) / (total.value || 1)) * 100);
  if (share >= 40) return "pressure";
  return "watch";
}

export function clubPulse(snap: Snapshots, range: TimeRange, now = new Date()): ClubPulse {
  const execution = executionMetrics(snap, range, now);
  const people = peopleMetrics(snap, range);
  const finance = financeMetrics(snap, range);
  const media = mediaMetrics(snap, range, now);
  const digital = digitalMetrics(snap, range, now);
  const resources = resourceMetrics(snap, range, now);
  const events = eventIntelligence(snap, now);

  const governance = governanceDimension(snap, range);
  const operations = operationsDimension(finance, media, digital, resources, range);
  const eventsDimension = eventsPulse(events, range, now);

  const dimensions: PulseDimension[] = [
    {
      key: "execution",
      title: "التنفيذ",
      state: stateFor(execution.overdue, execution.open),
      explanation:
        execution.overdue.value === 0
          ? "لا توجد مهام متأخرة ضمن العمل المفتوح"
          : `${execution.overdue.value} مهمة متأخرة من أصل ${execution.open.value} مهمة مفتوحة`,
      primary: execution.completionRate,
      support: [execution.completed, execution.open, execution.inReview],
      href: "/work",
    },
    eventsDimension,
    {
      key: "people",
      title: "الأشخاص",
      state:
        people.onboardingCompletionRate.value === null
          ? "unavailable"
          : people.onboardingInProgress.value! > 0
            ? "watch"
            : "steady",
      explanation:
        people.onboardingCompletionRate.value === null
          ? "لا توجد مسارات تأهيل لقياس نسبة الإكمال"
          : `${people.onboardingComplete.value} من ${people.onboardingCompletionRate.denominator} مسار تأهيل مكتمل`,
      primary: people.onboardingCompletionRate,
      support: [people.activeMembers, people.approvedVolunteerHours],
      href: "/people",
    },
    governance,
    operations,
    {
      key: "engagement",
      title: "المشاركة",
      state:
        people.attendanceRate.value === null ? "unavailable" : people.attendanceRate.value! >= 70 ? "steady" : "watch",
      explanation:
        people.attendanceRate.value === null
          ? "لا توجد سجلات حضور لقياس المشاركة"
          : `${people.attendanceRate.numerator} حضورًا من ${people.attendanceRate.denominator} سجل حضور`,
      primary: people.attendanceRate,
      support: [people.placementCount],
      href: "/events",
    },
  ];

  // The headline is categorical: the most urgent dimension decides, and it is
  // named. No averaging across dimensions, because the six are not commensurable.
  const ranked = [...dimensions].sort((a, b) => {
    const order: Record<PulseState, number> = { pressure: 3, watch: 2, unavailable: 1, steady: 0 };
    return order[b.state] - order[a.state];
  });
  const top = ranked[0];
  const headline: ClubPulse["headline"] =
    top.state === "pressure"
      ? {
          state: "pressure",
          label: stateLabel.pressure,
          drivenBy: top.key,
          explanation: `${top.title} هو البُعد الأكثر إلحاحًا: ${top.explanation}`,
        }
      : top.state === "watch"
        ? {
            state: "watch",
            label: stateLabel.watch,
            drivenBy: top.key,
            explanation: `${top.title} يحتاج متابعة: ${top.explanation}`,
          }
        : {
            state: "steady",
            label: stateLabel.steady,
            drivenBy: null,
            explanation: "لا توجد بُعد يحتاج تدخلًا عاجلًا حسب القواعد الموضحة",
          };

  return {
    dimensions,
    headline,
    note:
      "لا يُحسب رقم واحد للنادي: الأبعاد الستة غير متجانسة، ولكل بُعد حالته ومصدره ونطاقه. القواعد المطبقة: يوجد متأخرات و نسبتها ٤٠٪ فأكثر = ضغط، وجود متأخرات دون ذلك = متابعة، ولا متأخرات = مستقر.",
  };
}

function eventsPulse(
  events: ReturnType<typeof eventIntelligence>,
  range: TimeRange,
  now: Date,
): PulseDimension {
  const upcoming = events.filter((e) => e.dueAt && e.dueAt >= now);
  const ready = upcoming.filter((e) => e.readinessPercent !== null && e.readinessPercent >= 100);
  const notReady = upcoming.filter(
    (e) => e.readinessPercent !== null && e.readinessPercent < 100,
  );
  const unavailable = upcoming.filter((e) => e.readinessPercent === null);
  const metric: Metric =
    upcoming.length === 0
      ? unavailableMetric({
          key: "events_readiness",
          title: "جاهزية الفعاليات القادمة",
          description: "نسبة المتطلبات المكتملة لكل فعالية قادمة",
          reasonUnavailable: "لا توجد فعاليات قادمة داخل الأفق الحالي",
          sourceDomains: ["work_items", "events"],
          range: { from: range.from, to: range.to, label: range.labelAr },
        })
      : {
          key: "events_readiness",
          title: "جاهزية الفعاليات القادمة",
          description: "عدد الفعاليات القادمة التي اكتملت متطلباتها",
          value: ready.length,
          unit: "count",
          numerator: ready.length,
          denominator: upcoming.length,
          formula: "الفعاليات التي بلغت جاهزيتها ١٠٠٪ ÷ الفعاليات القادمة",
          sources: events
            .filter((e) => e.dueAt)
            .map((e) => ({ title: e.title, href: `/events/${e.id}`, id: e.id })),
          sourceDomains: ["work_items", "events", "operation_media_requests", "operation_digital_requests"],
          range: { from: range.from, to: range.to, label: range.labelAr },
          availability: { available: true },
          href: "/events",
        };
  const state: PulseState =
    upcoming.length === 0
      ? "unavailable"
      : ready.length === upcoming.length
        ? "steady"
        : notReady.some((e) => (e.dueAt!.getTime() - now.getTime()) / 86_400_000 <= 7)
          ? "pressure"
          : "watch";
  return {
    key: "events",
    title: "الفعاليات",
    state,
    explanation:
      upcoming.length === 0
        ? "لا توجد فعاليات قادمة"
        : `${ready.length} من ${upcoming.length} فعالية قادمة اكتملت متطلباتها` +
          (unavailable.length ? `، و${unavailable.length} بلا متطلبات مسجلة بعد` : ""),
    primary: metric,
    support: [],
    href: "/events",
  };
}

function governanceDimension(snap: Snapshots, range: TimeRange): PulseDimension {
  const active = snap.kpis.filter((k) => k.status === "active");
  const measured = active.filter((k) =>
    snap.measurements.some((m) => m.kpiId === k.id),
  );
  const metric: Metric = {
    key: "governance_kpi_coverage",
    title: "تغطية القياس للمؤشرات",
    description: "المؤشرات النشطة التي يوجد لها قياس فعلي",
    value: active.length ? Math.round((measured.length / active.length) * 100) : null,
    unit: "percent",
    numerator: measured.length,
    denominator: active.length,
    formula: "المؤشرات التي لها قياس ÷ المؤشرات النشطة × ١٠٠",
    sources: active.map((k) => ({ title: k.name, href: `/governance?tab=kpis&item=${k.id}`, id: k.id })),
    sourceDomains: ["kpis", "kpi_measurements"],
    range: { from: range.from, to: range.to, label: range.labelAr },
    availability:
      active.length > 0
        ? { available: true }
        : { available: false, reasonUnavailable: "لا توجد مؤشرات نشطة في الحوكمة" },
    href: "/governance?tab=kpis",
  };
  return {
    key: "governance",
    title: "الحوكمة",
    state:
      active.length === 0
        ? "unavailable"
        : measured.length === active.length
          ? "steady"
          : "watch",
    explanation:
      active.length === 0
        ? "لا توجد مؤشرات نشطة"
        : `${measured.length} من ${active.length} مؤشرًا نشطًا له قياس مسجل`,
    primary: metric,
    support: [],
    href: "/governance",
  };
}

type FinanceMetrics = ReturnType<typeof financeMetrics>;
type MediaMetrics = ReturnType<typeof mediaMetrics>;
type DigitalMetrics = ReturnType<typeof digitalMetrics>;
type ResourceMetrics = ReturnType<typeof resourceMetrics>;

function operationsDimension(
  finance: FinanceMetrics,
  media: MediaMetrics,
  digital: DigitalMetrics,
  resources: ResourceMetrics,
  range: TimeRange,
): PulseDimension {
  const unreadable =
    !finance.available && !media.available && !digital.available && !resources.available;
  const attention: Metric = {
    key: "operations_attention",
    title: "بنود تشغيلية تحتاج إجراء",
    description: "طلبات تنتظر مراجعة أو اعتماد أو مطابقة",
    value: unreadable
      ? null
      : (finance.pendingExpenses.value ?? 0) +
        (media.waitingReview.value ?? 0) +
        (digital.waitingInput.value ?? 0) +
        (resources.pendingReservations.value ?? 0),
    unit: "count",
    numerator: null,
    denominator: null,
    formula: "مجموع طلبات المصروف المنتظرة + الطلبات الإعلامية المنتظرة للمراجعة + الخدمات الرقمية المنتظرة + الحجوزات المنتظرة",
    sources: [],
    sourceDomains: [
      "operation_expense_requests",
      "operation_media_requests",
      "operation_digital_requests",
      "operation_asset_reservations",
    ],
    range: { from: range.from, to: range.to, label: range.labelAr },
    availability: unreadable
      ? {
          available: false,
          reasonUnavailable: "لا تملك صلاحية قراءة أيّ من مجالات العمليات",
        }
      : { available: true },
    href: "/operations",
  };
  const overdueCount =
    (resources.overdue.value ?? 0) + (media.overdue.value ?? 0) + (digital.overdue.value ?? 0);
  return {
    key: "operations",
    title: "العمليات",
    state: unreadable ? "unavailable" : attention.value === 0 ? "steady" : overdueCount > 0 ? "pressure" : "watch",
    explanation: unreadable
      ? "لا تملك صلاحية قراءة مجالات العمليات"
      : `${attention.value} بندًا ينتظر إجراء، منها ${overdueCount} متأخرًا`,
    primary: attention,
    support: [finance.spent, media.waitingReview, resources.available],
    href: "/operations",
  };
}