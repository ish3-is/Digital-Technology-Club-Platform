"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Trend } from "@/lib/intelligence/provenance";
import type { InsightShape, JsonMetric } from "@/lib/intelligence/types";

export type { JsonMetric };

const severityLabels: Record<InsightShape["severity"], string> = {
  info: "معلومة",
  attention: "للمتابعة",
  important: "مهم",
  critical: "عاجل",
};

export const intelAreas = [
  { key: "executive", href: "/intelligence/executive", label: "التنفيذية" },
  { key: "events", href: "/intelligence/events", label: "الفعاليات" },
  { key: "committees", href: "/intelligence/committees", label: "اللجان" },
  { key: "operations", href: "/intelligence/operations", label: "العمليات" },
  { key: "reports", href: "/intelligence/reports", label: "التقارير" },
];

/**
 * A metric card. Every number is clickable when the metric declares a drill
 * target, and "كيف حُسب؟" is always available so no figure stands unexplained.
 */
export function MetricCard({
  metric,
  compact = false,
}: {
  metric: JsonMetric;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const unavailable = !metric.availability.available;
  const value = metric.value === null ? "غير متاح" : metric.value.toLocaleString("ar-SA");
  const body = (
    <>
      <div className="intel-card-head">
        <span className="intel-card-title">{metric.title}</span>
        {metric.trend && metric.trend.available && (
          <span className={`intel-trend ${metric.trend.direction}`}>{metric.trend.direction === "up" ? "▲" : metric.trend.direction === "down" ? "▼" : "—"}</span>
        )}
      </div>
      <div className={`intel-value${unavailable ? " unavailable" : ""}`}>
        {value}
        {!unavailable && metric.unit === "percent" ? <span className="intel-unit">٪</span> : null}
      </div>
      {metric.trend?.available && <p className="intel-trend-note">{metric.trend.wording}</p>}
      {metric.trend?.available === false && <p className="intel-hint">{metric.trend?.wording}</p>}
      <div className="intel-card-actions">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "إخفاء" : "كيف حُسب؟"}
        </button>
      </div>
      {open && (
        <div className="intel-provenance">
          <dl>
            <div>
              <dt>الوصف</dt>
              <dd>{metric.description}</dd>
            </div>
            <div>
              <dt>الصيغة</dt>
              <dd>{metric.formula}</dd>
            </div>
            <div>
              <dt>البسط</dt>
              <dd>{metric.numerator ?? "—"}</dd>
            </div>
            <div>
              <dt>المقام</dt>
              <dd>{metric.denominator ?? "—"}</dd>
            </div>
            <div>
              <dt>النطاق</dt>
              <dd>{metric.range.label}</dd>
            </div>
            <div>
              <dt>المصدر</dt>
              <dd>{metric.sourceDomains.join(" · ") || "—"}</dd>
            </div>
          </dl>
          {unavailable && metric.availability.available === false && (
            <p className="intel-unavailable">{metric.availability.reasonUnavailable}</p>
          )}
          {!compact && metric.sources.length > 0 && (
            <details className="intel-sources">
              <summary>السجلات المصدر ({metric.sources.length})</summary>
              <ul>
                {metric.sources.slice(0, 12).map((s) => (
                  <li key={`${s.id ?? s.href ?? s.title}`}>
                    {s.href ? <Link href={s.href}>{s.title}</Link> : s.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </>
  );
  if (metric.href)
    return (
      <Link className="intel-card clickable" href={metric.href}>
        {body}
      </Link>
    );
  return <div className="intel-card">{body}</div>;
}

export function IntelCard({
  title,
  count,
  children,
  hint,
}: {
  title: string;
  count?: number | null;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <section className="intel-panel">
      <header className="intel-panel-head">
        <h2>{title}</h2>
        {count !== undefined && count !== null && <span className="intel-badge">{count}</span>}
      </header>
      {hint && <p className="intel-hint">{hint}</p>}
      {children}
    </section>
  );
}

export function IntelEmpty({ why }: { why: string }) {
  return (
    <div className="intel-empty">
      <p>{why}</p>
    </div>
  );
}

/** A simple bar chart with a readable text summary beside it. */
export function IntelBars({
  title,
  data,
  href,
}: {
  title: string;
  data: { label: string; value: number; href?: string }[];
  href?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (!data.length) return <IntelEmpty why="لا توجد بيانات لعرضها" />;
  return (
    <div className="intel-bars">
      <p className="intel-hint">
        {title} — الإجمالي {total.toLocaleString("ar-SA")}
      </p>
      {data.map((d) => (
        <div className="intel-bar-row" key={d.label}>
          <span className="intel-bar-label">
            {d.href ? <Link href={d.href}>{d.label}</Link> : d.label}
          </span>
          <span className="intel-bar-track">
            <span className="intel-bar-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="intel-bar-value">{d.value.toLocaleString("ar-SA")}</span>
        </div>
      ))}
    </div>
  );
}

const stateLabels: Record<string, string> = {
  steady: "مستقر",
  watch: "يحتاج متابعة",
  pressure: "ضغط تشغيلي",
  unavailable: "غير متاح",
};

export function PulsePanel({
  pulse,
}: {
  pulse: {
    headline: { label: string; explanation: string; drivenBy: string | null };
    note: string;
    dimensions: {
      key: string;
      title: string;
      state: string;
      explanation: string;
      href: string;
      primary: JsonMetric;
    }[];
  };
}) {
  return (
    <section className="intel-panel pulse">
      <header className="intel-panel-head">
        <h2>نبض النادي</h2>
        <span className={`intel-state ${pulse.headline.label === "مستقر" ? "steady" : "watch"}`}>
          {pulse.headline.label}
        </span>
      </header>
      <p className="intel-pulse-explanation">{pulse.headline.explanation}</p>
      <div className="intel-dimensions">
        {pulse.dimensions.map((d) => (
          <div key={d.key} className="intel-dimension">
            <div className="intel-card-head">
              <Link href={d.href} className="intel-card-title">
                {d.title}
              </Link>
              <span className={`intel-state small ${d.state}`}>{stateLabels[d.state] ?? d.state}</span>
            </div>
            <p className="intel-hint">{d.explanation}</p>
            <div className="intel-dimension-metric">
              <MetricCard metric={d.primary} compact />
            </div>
          </div>
        ))}
      </div>
      <p className="intel-note">{pulse.note}</p>
    </section>
  );
}

export function InsightList({
  insights,
}: {
  insights: {
    id: string;
    severity: InsightShape["severity"];
    title: string;
    explanation: string;
    source: string;
    href: string;
  }[];
}) {
  if (!insights.length)
    return <IntelEmpty why="لا توجد رؤى تشغيلية مستحقة من السجلات الحالية." />;
  return (
    <ul className="intel-insights">
      {insights.map((i) => (
        <li key={i.id} className={`severity-${i.severity}`}>
          <div className="intel-card-head">
            <span className="intel-insight-title">{i.title}</span>
            <span className="intel-severity">{severityLabels[i.severity]}</span>
          </div>
          <p className="intel-hint">{i.explanation}</p>
          <span className="intel-hint">
            المصدر: {i.source} · <Link href={i.href}>فتح السجل</Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RangePicker({
  current,
  options,
}: {
  current: string;
  options: { key: string; label: string }[];
}) {
  return (
    <nav className="intel-ranges" aria-label="نطاق التحليل">
      {options.map((o) => (
        <Link
          key={o.key}
          href={`?range=${o.key}`}
          className={current === o.key ? "active" : ""}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

export function TrendNote({ trend }: { trend?: Trend }) {
  if (!trend?.available) return null;
  return <p className="intel-trend-note">{trend.wording}</p>;
}
/* ===== Phase 7.5: funnel, trends, filing ===== */

/**
 * Onboarding funnel.
 *
 * A horizontal step funnel: each stage shows its count and the conversion from
 * the stage it is measured against. A stage whose denominator is empty says
 * "غير متاح" rather than showing 0%, and every stage can be opened to reveal
 * the exact rule that produced it.
 */
export function FunnelPanel({
  funnel,
}: {
  funnel: {
    totalApplications: number;
    ruleNote: string;
    stages: {
      key: string;
      title: string;
      rule: string;
      count: number;
      previousCount: number | null;
      conversionPercent: number | null;
      overallPercent: number | null;
      available: boolean;
      reasonUnavailable?: string;
      members: { id: string; name: string; href: string }[];
    }[];
  };
}) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...funnel.stages.map((s) => s.count));
  return (
    <section className="intel-panel funnel">
      <header className="intel-panel-head">
        <h2>قمع التأهيل</h2>
        <span className="intel-badge">{funnel.totalApplications}</span>
      </header>
      <p className="intel-hint">
        {funnel.totalApplications === 0
          ? "لا توجد طلبات انضمام مسجلة، فلا يبدأ القمع."
          : `مراحل مشتقة من ${funnel.totalApplications} طلب انضمام.`}
      </p>
      <ol className="funnel-steps">
        {funnel.stages.map((s) => (
          <li key={s.key} className={s.available ? "" : "unavailable"}>
            <button type="button" onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key}>
              <span className="funnel-label">{s.title}</span>
              <span className="funnel-count">{s.count.toLocaleString("ar-SA")}</span>
              <span className="funnel-bar-track">
                <span className="funnel-bar" style={{ width: `${(s.count / max) * 100}%` }} />
              </span>
              <span className="funnel-conversion">
                {s.available
                  ? s.previousCount === null
                    ? "نقطة البداية"
                    : s.conversionPercent === null
                      ? "غير متاح"
                      : `${s.conversionPercent}٪`
                  : "غير متاح"}
              </span>
            </button>
            {open === s.key && (
              <div className="funnel-detail">
                <p className="intel-hint">
                  <strong>القاعدة:</strong> {s.rule}
                </p>
                {!s.available && s.reasonUnavailable && (
                  <p className="intel-unavailable">{s.reasonUnavailable}</p>
                )}
                {s.available && s.previousCount !== null && (
                  <p className="intel-hint">
                    محسوب من {s.previousCount} في المرحلة السابقة · الإجمالي من الطلبات {s.overallPercent ?? "—"}٪
                  </p>
                )}
                {s.members.length > 0 && (
                  <ul className="intel-list">
                    {s.members.slice(0, 8).map((m) => (
                      <li key={m.id}>
                        <Link href={m.href}>{m.name}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="intel-note">{funnel.ruleNote}</p>
    </section>
  );
}

/**
 * A trend chart.
 *
 * Bars are sized against the largest point; a bucket with no data is simply
 * absent, so a gap reads as "nothing happened" rather than "a zero". The
 * summary line below the chart is the accessible equivalent of the whole chart.
 */
export function TrendPanel({
  title,
  series,
}: {
  title: string;
  series: {
    key: string;
    title: string;
    rule: string;
    bucket: string;
    empty: boolean;
    total: number;
    href?: string;
    points: { date: string; label: string; value: number }[];
    comparison?: { available: boolean; wording: string };
  };
}) {
  const max = Math.max(1, ...series.points.map((p) => p.value));
  return (
    <section className="intel-panel trend">
      <header className="intel-panel-head">
        <h2>{title}</h2>
        <span className="intel-badge">{series.total.toLocaleString("ar-SA")}</span>
      </header>
      {series.empty ? (
        <IntelEmpty why="لا توجد بيانات في الفترة المختارة لهذه السلسلة." />
      ) : (
        <>
          <div className="trend-chart" role="img" aria-label={`${series.title}: ${series.points.length} نقطة، الإجمالي ${series.total}`}>
            {series.points.map((p) => (
              <span className="trend-col" key={p.date}>
                <span className="trend-value">{p.value.toLocaleString("ar-SA")}</span>
                <span className="trend-bar-track">
                  <span className="trend-bar" style={{ height: `${(p.value / max) * 100}%` }} />
                </span>
                <span className="trend-label">{p.label}</span>
              </span>
            ))}
          </div>
          <p className="intel-hint">
            {series.title} — {series.points.length} نقطة زمنية ({bucketLabel(series.bucket)})، والقاعدة:{" "}
            {series.rule}.
          </p>
          {series.comparison?.available && (
            <p className="intel-trend-note">{series.comparison.wording}</p>
          )}
          {series.href && (
            <Link className="intel-hint" href={series.href}>
              فتح السجلات المصدر
            </Link>
          )}
        </>
      )}
    </section>
  );
}

function bucketLabel(bucket: string) {
  return bucket === "month" ? "شهريًا" : bucket === "week" ? "أسبوعيًا" : "يوميًا";
}
