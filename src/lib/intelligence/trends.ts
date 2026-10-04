/**
 * Trend series.
 *
 * A trend is a grouping of real rows into fixed buckets. Two rules matter:
 *
 *  - a bucket with no rows reports `null`, not 0, because "nothing happened"
 *    and "zero happened" are different claims;
 *  - no point is interpolated and no gap is filled, so the chart never implies
 *    activity that the database does not contain.
 */
import type { Snapshots } from "./snapshots";
import { buildTrend, type Trend } from "./provenance";

export type Bucket = "day" | "week" | "month";

export type TrendPoint = {
  /** Bucket start, ISO date (YYYY-MM-DD), stable across renders. */
  date: string;
  label: string;
  value: number;
};

export type TrendSeries = {
  key: string;
  title: string;
  /** The rule that decides what counts, stated so the chart can be argued with. */
  rule: string;
  bucket: Bucket;
  points: TrendPoint[];
  /** True when the series has no data at all in the window. */
  empty: boolean;
  total: number;
  href?: string;
  /** Factual comparison against the equivalent preceding window. */
  comparison?: Trend;
};

/** Bucket start for a date, truncated to the requested granularity. */
export function bucketStart(date: Date, bucket: Bucket): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (bucket === "day") return d;
  if (bucket === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  // ISO weeks begin on Monday.
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86_400_000);
}

function nextBucket(start: Date, bucket: Bucket): Date {
  if (bucket === "month")
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return new Date(start.getTime() + 7 * 86_400_000);
}

function labelFor(start: Date, bucket: Bucket): string {
  const date = new Date(start);
  if (bucket === "month")
    return date.toLocaleDateString("ar-SA", { month: "long", year: "numeric", timeZone: "UTC" });
  return date.toLocaleDateString("ar-SA", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Groups dated rows into buckets across the window.
 *
 * Buckets with no rows are omitted rather than emitted as zero, so a chart can
 * tell "nothing happened then" apart from "the count was zero".
 */
function series(input: {
  key: string;
  title: string;
  rule: string;
  bucket: Bucket;
  from: Date;
  to: Date;
  dates: (Date | null | undefined)[];
  href?: string;
  label?: string;
}): TrendSeries {
  const counts = new Map<string, number>();
  for (const raw of input.dates) {
    if (!raw) continue;
    const start = bucketStart(raw, input.bucket);
    if (start < bucketStart(input.from, input.bucket)) continue;
    if (start > input.to) continue;
    const key = start.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const points: TrendPoint[] = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      label: labelFor(new Date(date), input.bucket),
      value,
    }));
  return {
    key: input.key,
    title: input.title,
    rule: input.rule,
    bucket: input.bucket,
    points,
    empty: points.length === 0,
    total: points.reduce((sum, p) => sum + p.value, 0),
    href: input.href,
  };
}

/** Chooses a bucket that yields a readable number of points for the window. */
export function chooseBucket(from: Date, to: Date): Bucket {
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (days <= 31) return "day";
  if (days <= 190) return "week";
  return "month";
}

export type TrendBundle = {
  bucket: Bucket;
  series: TrendSeries[];
};

/**
 * Builds every trend series the intelligence pages render.
 *
 * Each series is a plain comparison against the equivalent preceding window,
 * worded factually — the module never says performance improved.
 */
export function trends(snap: Snapshots, from: Date, to: Date): TrendBundle {
  const bucket = chooseBucket(from, to);
  const span = Math.max(86_400_000, to.getTime() - from.getTime());
  const prevFrom = new Date(from.getTime() - span);
  const prevTo = new Date(from.getTime() - 1);

  const tasks = snap.work.filter((w) => w.kind === "task");
  const completed = tasks.filter((w) => w.status === "completed");
  const createdIn = (lo: Date, hi: Date, list: typeof tasks, date: (w: (typeof tasks)[number]) => Date | null) =>
    list.filter((w) => {
      const d = date(w);
      return d !== null && d >= lo && d <= hi;
    }).length;

  const compare = (
    key: string,
    label: string,
    current: TrendSeries,
    previousCount: number,
  ): TrendSeries => ({
    ...current,
    comparison: buildTrend({ current: current.total, previous: previousCount, label }),
  });

  const completedSeries = compare(
    "execution_completed",
    "عدد المهام المكتملة",
    series({
      key: "execution_completed",
      title: "المهام المكتملة",
      rule: "عدد المهام التي بلغت حالة «مكتملة» بتاريخ completed_at داخل الفترة",
      bucket,
      from,
      to,
      dates: completed.map((w) => w.completedAt),
      href: "/work?kind=task&status=completed",
    }),
    createdIn(prevFrom, prevTo, completed, (w) => w.completedAt),
  );

  const createdSeries = compare(
    "execution_created",
    "عدد المهام المنشأة",
    series({
      key: "execution_created",
      title: "المهام المنشأة",
      rule: "عدد المهام بتاريخ إنشاء داخل الفترة",
      bucket,
      from,
      to,
      dates: tasks.map((w) => w.createdAt),
      href: "/work?kind=task",
    }),
    createdIn(prevFrom, prevTo, tasks, (w) => w.createdAt),
  );

  const reviewSeries = series({
    key: "execution_review",
    title: "بانتظار المراجعة",
    rule: "عدد المهام التي وصلت حالة «مراجعة» ولم تُحسم بتحديث بعدها",
    bucket,
    from,
    to,
    dates: tasks.filter((w) => w.status === "review").map((w) => w.updatedAt),
    href: "/work?kind=task&status=review",
  });

  const attendanceSeries = series({
    key: "events_attendance",
    title: "سجلات الحضور",
    rule: "عدد سجلات event_attendance التي سُجلت الحضور فيها داخل الفترة",
    bucket,
    from,
    to,
    dates: snap.attendance.map((a) => a.checkInAt),
    href: "/events",
  });

  const volunteerSeries = series({
    key: "people_volunteer",
    title: "الساعات التطوعية المعتمدة",
    rule: "عدد قيود volunteer_hour_entries المعتمدة داخل الفترة",
    bucket,
    from,
    to,
    dates: snap.volunteerHours
      .filter((h) => h.status === "approved")
      .map((h) => h.date),
    href: "/people?tab=hours",
  });

  // Finance trends are only built for a reader who may see finance at all.
  const spendSeries = snap.capability.finance
    ? series({
        key: "finance_spend",
        title: "المبالغ المشتراة",
        rule: "عدد عمليات الشراء المسجلة بتاريخ الشراء داخل الفترة",
        bucket,
        from,
        to,
        dates: snap.purchases.map((p) => p.purchasedAt),
        href: "/operations/finance",
      })
    : null;

  const mediaSeries = snap.capability.media
    ? series({
        key: "media_requests",
        title: "الطلبات الإعلامية المنشأة",
        rule: "عدد الطلبات الإعلامية بتاريخ الإنشاء داخل الفترة",
        bucket,
        from,
        to,
        dates: snap.media.map((m) => m.createdAt),
        href: "/operations/media",
      })
    : null;

  const digitalSeries = snap.capability.digital
    ? series({
        key: "digital_requests",
        title: "الخدمات الرقمية المنشأة",
        rule: "عدد الطلبات الرقمية بتاريخ الإنشاء داخل الفترة",
        bucket,
        from,
        to,
        dates: snap.digitalRequests.map((d) => d.createdAt),
        href: "/operations/digital",
      })
    : null;

  const reservationSeries = snap.capability.resources
    ? series({
        key: "resource_reservations",
        title: "حجوزات الأصول",
        rule: "عدد حجوزات الأصول بتاريخ البدء داخل الفترة",
        bucket,
        from,
        to,
        dates: snap.reservations.map((r) => r.startsAt),
        href: "/operations/resources",
      })
    : null;

  const governanceSeries = series({
    key: "governance_measurements",
    title: "قياسات المؤشرات",
    rule: "عدد قياسات kpi_measurements بتاريخ القياس داخل الفترة",
    bucket,
    from,
    to,
    dates: snap.measurements.map((m) => m.measuredAt),
    href: "/governance?tab=kpis",
  });

  return {
    bucket,
    series: [
      completedSeries,
      createdSeries,
      reviewSeries,
      attendanceSeries,
      volunteerSeries,
      governanceSeries,
      spendSeries,
      mediaSeries,
      digitalSeries,
      reservationSeries,
    ].filter((s): s is TrendSeries => s !== null),
  };
}

/** A plain textual summary a screen reader or printed report can read. */
export function describeSeries(s: TrendSeries): string {
  if (s.empty) return `${s.title}: لا توجد بيانات في الفترة المختارة.`;
  const first = s.points[0];
  const last = s.points[s.points.length - 1];
  const base = `${s.title}: ${s.total} عبر ${s.points.length} نقطة زمنية، من ${first.label} إلى ${last.label}`;
  return s.comparison?.available
    ? `${base}. ${s.comparison.wording}.`
    : `${base}.`;
}