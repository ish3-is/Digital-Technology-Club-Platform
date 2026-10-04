/**
 * Metric provenance.
 *
 * Every number this project shows is a Metric. The type makes the two things
 * that matter explicit and impossible to skip:
 *
 *  - a missing denominator yields `value: null` and `available: false`, never 0;
 *  - every metric names the domains it was derived from, so the interface can
 *    offer a drill-down instead of presenting an unexplained figure.
 */

export type MetricSource = {
  title: string;
  href?: string;
  id?: string;
};

export type MetricAvailability =
  | { available: true }
  | { available: false; reasonUnavailable: string };

export type TimeRange = {
  key: string;
  label: string;
  from: Date;
  to: Date;
  termId: string | null;
  /** Arabic label used in the interface and in exported reports. */
  labelAr: string;
};

export type Metric = {
  key: string;
  title: string;
  /** Arabic description of what the number means. */
  description: string;
  value: number | null;
  unit: "count" | "percent" | "hours" | "currency" | "days";
  numerator: number | null;
  denominator: number | null;
  formula: string;
  sources: MetricSource[];
  sourceDomains: string[];
  range: { from: Date; to: Date; label: string };
  availability: MetricAvailability;
  /** Trend direction against the previous equivalent period, when computable. */
  trend?: Trend;
  /** Where the number can be drilled into. */
  href?: string;
};

export type Trend = {
  direction: "up" | "down" | "flat";
  current: number | null;
  previous: number | null;
  change: number | null;
  changePercent: number | null;
  /** Neutral, factual Arabic wording — never "performance improved". */
  wording: string;
  available: boolean;
};

/**
 * Builds a ratio metric. A zero denominator is reported as unavailable rather
 * than as zero, because "0 tasks completed out of 0" and "0% completion" are
 * different claims and only one of them is true.
 */
export function ratioMetric(input: {
  key: string;
  title: string;
  description: string;
  numerator: number;
  denominator: number;
  sources?: MetricSource[];
  sourceDomains: string[];
  range: { from: Date; to: Date; label: string };
  formula?: string;
  href?: string;
}): Metric {
  const available = input.denominator > 0;
  return {
    key: input.key,
    title: input.title,
    description: input.description,
    value: available ? Math.round((input.numerator / input.denominator) * 100) : null,
    unit: "percent",
    numerator: input.numerator,
    denominator: input.denominator,
    formula:
      input.formula ??
      "البسط ÷ المقام × ١٠٠، مقرَّبًا لأقرب عدد صحيح. غياب المقام يعني عدم التوفر وليس صفرًا.",
    sources: input.sources ?? [],
    sourceDomains: input.sourceDomains,
    range: input.range,
    availability: available
      ? { available: true }
      : {
          available: false,
          reasonUnavailable: "لا توجد سجلات كافية في الفترة المحددة لحساب هذه النسبة",
        },
    href: input.href,
  };
}

/** A plain counted value; still carries its own source list. */
export function countMetric(input: {
  key: string;
  title: string;
  description: string;
  value: number;
  unit?: Metric["unit"];
  sources?: MetricSource[];
  sourceDomains: string[];
  range: { from: Date; to: Date; label: string };
  formula?: string;
  href?: string;
}): Metric {
  return {
    key: input.key,
    title: input.title,
    description: input.description,
    value: input.value,
    unit: input.unit ?? "count",
    numerator: input.value,
    denominator: null,
    formula: input.formula ?? "عدد السجلات المطابقة للفلتر داخل الفترة",
    sources: input.sources ?? [],
    sourceDomains: input.sourceDomains,
    range: input.range,
    availability: { available: true },
    href: input.href,
  };
}

/**
 * A metric that cannot be computed from the data at hand. Used instead of
 * returning 0 or a guess when the underlying denominator does not exist.
 */
export function unavailableMetric(input: {
  key: string;
  title: string;
  description: string;
  reasonUnavailable: string;
  sourceDomains: string[];
  range: { from: Date; to: Date; label: string };
  unit?: Metric["unit"];
}): Metric {
  return {
    key: input.key,
    title: input.title,
    description: input.description,
    value: null,
    unit: input.unit ?? "percent",
    numerator: null,
    denominator: null,
    formula: "لا تُحسب القيمة دون مصدر صالح",
    sources: [],
    sourceDomains: input.sourceDomains,
    range: input.range,
    availability: { available: false, reasonUnavailable: input.reasonUnavailable },
  };
}

/**
 * Compares the current period against the equivalent preceding one.
 *
 * The wording is deliberately factual: it reports that a count rose, without
 * implying anything about performance or quality.
 */
export function buildTrend(input: {
  current: number;
  previous: number;
  label: string;
  higherIsBetter?: boolean | null;
}): Trend {
  const change = input.current - input.previous;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const changePercent = input.previous === 0 ? null : Math.round((change / input.previous) * 100);
  if (input.previous === 0 && input.current === 0)
    return {
      direction: "flat",
      current: 0,
      previous: 0,
      change: 0,
      changePercent: null,
      wording: `لا تغيّر في ${input.label} بين الفترتين`,
      available: true,
    };
  const verb = direction === "up" ? "ارتفع" : direction === "down" ? "انخفض" : "لم يتغيّر";
  const magnitude =
    input.previous === 0
      ? `${input.current}`
      : `${Math.abs(changePercent ?? 0)}%`;
  return {
    direction,
    current: input.current,
    previous: input.previous,
    change,
    changePercent,
    wording: `${verb} ${input.label} بنسبة ${magnitude} مقارنة بالفترة السابقة`,
    available: true,
  };
}

/** Resolves the reporting window. Defaults to the active academic term. */
export function resolveRange(
  key: string,
  term: { id: string; startAt: Date | null; endAt: Date | null } | null,
  now = new Date(),
): TimeRange {
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  switch (key) {
    case "7d":
      return {
        key,
        label: "7d",
        labelAr: "آخر ٧ أيام",
        from: addDays(now, -7),
        to: now,
        termId: term?.id ?? null,
      };
    case "30d":
      return {
        key,
        label: "30d",
        labelAr: "آخر ٣٠ يومًا",
        from: addDays(now, -30),
        to: now,
        termId: term?.id ?? null,
      };
    case "month": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return {
        key,
        label: "month",
        labelAr: "هذا الشهر",
        from,
        to: now,
        termId: term?.id ?? null,
      };
    }
    case "custom":
      // A custom window is supplied by the caller through the query string.
      return {
        key,
        label: "custom",
        labelAr: "فترة مخصصة",
        from: term?.startAt ?? addDays(now, -30),
        to: term?.endAt ?? now,
        termId: term?.id ?? null,
      };
    default: {
      // The academic term is the default so periods are never compared across
      // unrelated terms by accident.
      const from = term?.startAt ?? addDays(now, -30);
      const to = term?.endAt ?? now;
      return {
        key: "term",
        label: "term",
        labelAr: term?.id ? "الفصل الأكاديمي النشط" : "الفصل النشط (غير متوفر)",
        from,
        to,
        termId: term?.id ?? null,
      };
    }
  }
}

/** The equivalent preceding window, used for period-over-period trends. */
export function previousRange(range: TimeRange): TimeRange {
  const span = Math.max(
    86_400_000,
    range.to.getTime() - range.from.getTime(),
  );
  return {
    ...range,
    from: new Date(range.from.getTime() - span),
    to: new Date(range.from.getTime() - 1),
    labelAr: `الفترة السابقة لـ${range.labelAr}`,
  };
}

export const rangeOptions = [
  { key: "term", label: "الفصل النشط" },
  { key: "7d", label: "آخر ٧ أيام" },
  { key: "30d", label: "آخر ٣٠ يومًا" },
  { key: "month", label: "هذا الشهر" },
  { key: "custom", label: "فترة مخصصة" },
];