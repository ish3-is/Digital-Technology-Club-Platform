"use client";
import Link from "next/link";
import { useState } from "react";
import {
  InsightList,
  IntelBars,
  IntelCard,
  IntelEmpty,
  MetricCard,
  PulsePanel,
  RangePicker,
  intelAreas,
} from "@/components/intelligence-center";
import { FunnelPanel, TrendPanel } from "@/components/intelligence-center";
import type {
  CommitteesShape,
  EventsShape,
  ExecutiveShape,
  FunnelShape,
  OperationsShape,
  ReportsShape,
  TrendBundleShape,
} from "@/lib/intelligence/types";

type Json<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

export function IntelligenceHome({
  canExecutive,
  activeTermCount,
}: {
  canExecutive: boolean;
  activeTermCount: number;
}) {
  return (
    <div className="intel" dir="rtl">
      <header className="intel-header">
        <h1>الاستخبارات التشغيلية</h1>
        <p className="intel-hint">
          طبقة تحليلية مشتقة من سجلات العمل والفعاليات والأشخاص والعمليات والحوكمة. كل رقم
          يعرض مصدره وصيغته، ولا يوجد ترتيب بين الأعضاء أو اللجان.
        </p>
      </header>
      <nav className="intel-tabs" aria-label="أقسام الاستخبارات">
        {intelAreas.map((a) => (
          <Link key={a.key} href={a.href}>
            {a.label}
          </Link>
        ))}
      </nav>
      {activeTermCount === 0 && (
        <div className="intel-notice" role="status">
          لا يوجد فصل أكاديمي نشط. ستظهر الأبعاد على أنها «غير متاح» بدل أن تُعرض كصفر.
        </div>
      )}
      <div className="intel-grid">
        {intelAreas.map((a) => (
          <Link key={a.key} href={a.href} className="intel-nav-card">
            <strong>{a.label}</strong>
            <span className="intel-hint">
              {a.key === "executive"
                ? "ملخص تنفيذي ونبض النادي"
                : a.key === "events"
                  ? "جاهزية الفعاليات ومتطلباتها"
                  : a.key === "committees"
                    ? "حالة كل لجنة وأسبابها"
                    : a.key === "operations"
                      ? "المالية والإعلام والرقمية والموارد"
                      : "قوالب تقارير وتصدير"}
            </span>
            {!canExecutive && a.key === "executive" && (
              <span className="intel-hint">يتطلب صلاحية الاستخبارات التنفيذية</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Frame({
  area,
  range,
  rangeOptions,
  children,
  error,
}: {
  area: string;
  range: string;
  rangeOptions: { key: string; label: string }[];
  children: React.ReactNode;
  error: string | null;
}) {
  return (
    <div className="intel" dir="rtl">
      <header className="intel-header">
        <h1>الاستخبارات التشغيلية</h1>
        <p className="intel-hint">
          جميع الأرقام مشتقة من سجلات موجودة، وتعرض «كيف حُسب؟» لكل مؤشر.
        </p>
      </header>
      <nav className="intel-tabs" aria-label="أقسام الاستخبارات">
        {intelAreas.map((a) => (
          <Link key={a.key} href={a.href} className={area === a.key ? "active" : ""}>
            {a.label}
          </Link>
        ))}
      </nav>
      <RangePicker current={range} options={rangeOptions} />
      {error ? (
        <div className="intel-notice" role="alert">
          {error}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// ------------------------------------------------------------- executive --

export function ExecutiveView({
  data,
  range,
  rangeOptions,
  error,
}: {
  data: ExecutiveShape | null;
  range: string;
  rangeOptions: { key: string; label: string }[];
  error: string | null;
}) {
  if (!data)
    return (
      <Frame area="executive" range={range} rangeOptions={rangeOptions} error={error}>
        <IntelEmpty why="لا توجد بيانات تنفيذية متاحة." />
      </Frame>
    );
  return (
    <Frame area="executive" range={range} rangeOptions={rangeOptions} error={error}>
      <div className="intel-grid">
        <IntelCard title="ملخص الفترة" count={null}>
          <dl className="intel-summary">
            <div>
              <dt>الفصل</dt>
              <dd>{data.summary.term?.name ?? "غير متاح"}</dd>
            </div>
            <div>
              <dt>اللجان</dt>
              <dd>{data.summary.committees}</dd>
            </div>
            <div>
              <dt>الأعضاء</dt>
              <dd>{data.summary.members}</dd>
            </div>
            <div>
              <dt>فعاليات قادمة</dt>
              <dd>{data.summary.upcomingEvents}</dd>
            </div>
            <div>
              <dt>فعاليات مكتملة</dt>
              <dd>{data.summary.completedEvents}</dd>
            </div>
            <div>
              <dt>اعتمادات بانتظار</dt>
              <dd>{data.summary.pendingApprovals}</dd>
            </div>
            <div>
              <dt>طلبات بين اللجان</dt>
              <dd>{data.summary.openRequests}</dd>
            </div>
            <div>
              <dt>النطاق</dt>
              <dd>{data.range.label}</dd>
            </div>
          </dl>
        </IntelCard>

        <PulsePanel pulse={data.pulse} />

        <IntelCard title="التنفيذ" count={null} hint="المهام حالتها الآن، والنسبة تقرأ من مصدرها.">
          <div className="intel-cards">
            <MetricCard metric={data.execution.completed} />
            <MetricCard metric={data.execution.open} />
            <MetricCard metric={data.execution.overdue} />
            <MetricCard metric={data.execution.completionRate} />
            <MetricCard metric={data.execution.inReview} />
            <MetricCard metric={data.execution.unassigned} />
            <MetricCard metric={data.execution.dueSoon} />
            <MetricCard metric={data.execution.averageCompletionDays} />
          </div>
        </IntelCard>

        <IntelCard title="الأشخاص والمشاركة" count={null}>
          <div className="intel-cards">
            <MetricCard metric={data.people.activeMembers} />
            <MetricCard metric={data.people.onboardingCompletionRate} />
            <MetricCard metric={data.people.approvedVolunteerHours} />
            <MetricCard metric={data.people.attendanceRate} />
            <MetricCard metric={data.people.placementCount} />
          </div>
          <IntelBars
            title="توزيع الأعضاء حسب الحالة"
            data={Object.entries(data.people.membersByStatus).map(([k, v]) => ({ label: k, value: v }))}
          />
        </IntelCard>

        <IntelCard
          title="العمليات"
          count={null}
          hint="الأرقام المالية تظهر فقط لمن يملك صلاحية قراءتها."
        >
          {!data.finance.available ? (
            <IntelEmpty why="لا تملك صلاحية قراءة البيانات المالية." />
          ) : (
            <div className="intel-cards">
              <MetricCard metric={data.finance.allocated} />
              <MetricCard metric={data.finance.committed} />
              <MetricCard metric={data.finance.spent} />
              <MetricCard metric={data.finance.remaining} />
              <MetricCard metric={data.finance.utilization} />
              <MetricCard metric={data.finance.unreconciled} />
            </div>
          )}
          {data.media.available && (
            <div className="intel-cards">
              <MetricCard metric={data.media.total} />
              <MetricCard metric={data.media.waitingReview} />
              <MetricCard metric={data.media.overdue} />
            </div>
          )}
          {data.digital.available && (
            <div className="intel-cards">
              <MetricCard metric={data.digital.open} />
              <MetricCard metric={data.digital.completed} />
              <MetricCard metric={data.digital.batches} />
            </div>
          )}
          {data.resources.available_ && (
            <div className="intel-cards">
              <MetricCard metric={data.resources.available} />
              <MetricCard metric={data.resources.checkedOut} />
              <MetricCard metric={data.resources.maintenance} />
              <MetricCard metric={data.resources.openIncidents} />
            </div>
          )}
        </IntelCard>

        <IntelCard title="جاهزية الفعاليات القادمة" count={null}>
          <IntelBars
            title="الفعاليات"
            data={data.events
              .filter((e) => e.dueAt)
              .slice(0, 8)
              .map((e) => ({
                label: e.title,
                value: e.readinessPercent ?? 0,
                href: `/intelligence/events?event=${e.id}`,
              }))}
          />
          <p className="intel-hint">
            الفعاليات بلا متطلبات مسجلة تظهر بقيمة صفر في الرسم، ونصّها يوضّح عدم توفر النسبة.
          </p>
        </IntelCard>

        {data.funnel && <FunnelPanel funnel={data.funnel} />}

        {data.trends && data.trends.series.length > 0 && (
          <TrendPanel
            title="الاتجاهات التشغيلية"
            series={{
              key: "execution_completed",
              title: "المهام المكتملة",
              rule: "المهام التي بلغت حالة «مكتملة» داخل الفترة",
              bucket: data.trends.bucket,
              points: data.trends.series.find((s) => s.key === "execution_completed")?.points ?? [],
              empty:
                data.trends.series.find((s) => s.key === "execution_completed")?.empty ?? true,
              total: data.trends.series.find((s) => s.key === "execution_completed")?.total ?? 0,
              href: "/work?kind=task&status=completed",
              comparison: data.trends.series.find((s) => s.key === "execution_completed")
                ?.comparison,
            }}
          />
        )}

        <IntelCard title="الرؤى التشغيلية" count={data.insights.length}>
          <InsightList insights={data.insights} />
        </IntelCard>

        <IntelCard title="إشارات السعة" count={null} hint="قواعد حتمية، وليست استنتاجًا عن الإنتاجية.">
          <ul className="intel-signals">
            {data.capacity.map((c) => (
              <li key={c.key} className={c.active ? "active" : ""}>
                <Link href={c.href}>{c.title}</Link>
                <span className="intel-hint">{c.detail}</span>
                <span className="intel-hint">{c.active ? "المؤشر مفعّل حاليًا" : "ضمن المعتاد"}</span>
              </li>
            ))}
          </ul>
        </IntelCard>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------ operations --

export function OperationsView({
  data,
  range,
  rangeOptions,
  error,
}: {
  data: OperationsShape | null;
  range: string;
  rangeOptions: { key: string; label: string }[];
  error: string | null;
}) {
  if (!data)
    return (
      <Frame area="operations" range={range} rangeOptions={rangeOptions} error={error}>
        <IntelEmpty why="لا توجد بيانات تشغيلية متاحة." />
      </Frame>
    );
  return (
    <Frame area="operations" range={range} rangeOptions={rangeOptions} error={error}>
      <div className="intel-grid">
        <IntelCard title="المالية" count={null} hint="المنصرف مأخوذ من مبلغ الشراء المسجَّل.">
          {!data.finance.available ? (
            <IntelEmpty why="لا تملك صلاحية قراءة البيانات المالية." />
          ) : (
            <div className="intel-cards">
              <MetricCard metric={data.finance.allocated} />
              <MetricCard metric={data.finance.committed} />
              <MetricCard metric={data.finance.spent} />
              <MetricCard metric={data.finance.remaining} />
              <MetricCard metric={data.finance.utilization} />
              <MetricCard metric={data.finance.pendingExpenses} />
              <MetricCard metric={data.finance.unreconciled} />
            </div>
          )}
        </IntelCard>

        <IntelCard title="الإعلام" count={null}>
          {!data.media.available ? (
            <IntelEmpty why="لا تملك صلاحية قراءة الطلبات الإعلامية." />
          ) : (
            <>
              <div className="intel-cards">
                <MetricCard metric={data.media.total} />
                <MetricCard metric={data.media.inProduction} />
                <MetricCard metric={data.media.waitingReview} />
                <MetricCard metric={data.media.changesRequested} />
                <MetricCard metric={data.media.approved} />
                <MetricCard metric={data.media.overdue} />
              </div>
              <IntelBars
                title="توزيع الطلبات حسب الحالة"
                data={Object.entries(data.media.byStatus).map(([k, v]) => ({ label: k, value: v }))}
              />
            </>
          )}
        </IntelCard>

        <IntelCard title="الخدمات الرقمية" count={null}>
          {!data.digital.available ? (
            <IntelEmpty why="لا تملك صلاحية قراءة الخدمات الرقمية." />
          ) : (
            <>
              <div className="intel-cards">
                <MetricCard metric={data.digital.open} />
                <MetricCard metric={data.digital.completed} />
                <MetricCard metric={data.digital.waitingInput} />
                <MetricCard metric={data.digital.activeForms} />
                <MetricCard metric={data.digital.batches} />
                <MetricCard metric={data.digital.overdue} />
              </div>
              <IntelBars
                title="توزيع الطلبات حسب الحالة"
                data={Object.entries(data.digital.byStatus).map(([k, v]) => ({ label: k, value: v }))}
              />
            </>
          )}
        </IntelCard>

        <IntelCard title="الموارد" count={null}>
          {!data.resources.available_ ? (
            <IntelEmpty why="لا تملك صلاحية قراءة الأصول." />
          ) : (
            <>
              <div className="intel-cards">
                <MetricCard metric={data.resources.available} />
                <MetricCard metric={data.resources.checkedOut} />
                <MetricCard metric={data.resources.maintenance} />
                <MetricCard metric={data.resources.pendingReservations} />
                <MetricCard metric={data.resources.openIncidents} />
                <MetricCard metric={data.resources.overdue} />
              </div>
              <IntelBars
                title="توزيع الأصول حسب التوفر"
                data={Object.entries(data.resources.byAvailability).map(([k, v]) => ({ label: k, value: v }))}
              />
            </>
          )}
        </IntelCard>

        <IntelCard title="عبء العمل" count={null} hint="توزيع العمل، وليس تقييم أداء.">
          <IntelBars
            title="الأعمال حسب الحالة"
            data={Object.entries(data.workload.byStatus).map(([k, v]) => ({ label: k, value: v }))}
          />
          <dl className="intel-summary">
            <div>
              <dt>مفتوح</dt>
              <dd>{data.workload.open}</dd>
            </div>
            <div>
              <dt>متأخر</dt>
              <dd>{data.workload.overdue}</dd>
            </div>
            <div>
              <dt>مواعيد خلال أسبوع</dt>
              <dd>{data.workload.dueSoon}</dd>
            </div>
            <div>
              <dt>بلا مسؤول</dt>
              <dd>{data.workload.unassigned}</dd>
            </div>
            <div>
              <dt>مرتبط بفعالية</dt>
              <dd>{data.workload.eventLinked}</dd>
            </div>
          </dl>
        </IntelCard>

        <IntelCard title="الطلب بين اللجان" count={null}>
          <IntelBars
            title="اللجان"
            data={data.byCommittee.map((c) => ({
              label: c.committeeName,
              value: c.open,
            }))}
          />
        </IntelCard>

        {data.trends && data.trends.series.length > 0 && (
          <TrendPanel
            title="حجم الطلبات عبر الزمن"
            series={
              data.trends.series.find((s) => s.key === "media_requests") ??
              data.trends.series[0]
            }
          />
        )}

        <IntelCard title="تنبيهات التشغيل" count={data.alerts.length}>
          <InsightList insights={data.alerts} />
        </IntelCard>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------- events --

export function EventsView({
  data,
  range,
  rangeOptions,
  error,
  selected,
}: {
  data: EventsShape | null;
  range: string;
  rangeOptions: { key: string; label: string }[];
  error: string | null;
  selected?: string;
}) {
  if (!data)
    return (
      <Frame area="events" range={range} rangeOptions={rangeOptions} error={error}>
        <IntelEmpty why="لا توجد فعاليات متاحة." />
      </Frame>
    );
  const detail = selected ? data.events.find((e) => e.eventId === selected) : null;
  return (
    <Frame area="events" range={range} rangeOptions={rangeOptions} error={error}>
      <div className="intel-grid">
        {detail && (
          <IntelCard
            title={`جاهزية: ${detail.eventTitle}`}
            count={null}
            hint={detail.statement}
          >
            <div className="intel-readiness">
              <div className="intel-readiness-headline">
                <span className="intel-value">
                  {detail.percent === null ? "غير متاح" : `${detail.percent}٪`}
                </span>
              </div>
              {detail.reasonUnavailable && (
                <p className="intel-unavailable">{detail.reasonUnavailable}</p>
              )}
              <ul className="intel-readiness-stats">
                <li>مكتمل: {detail.completed}</li>
                <li>معلق: {detail.pending}</li>
                <li>متأخر: {detail.overdue}</li>
                <li>معطّل: {detail.blocked}</li>
                <li>الإجمالي: {detail.total}</li>
              </ul>
              <ul className="intel-readiness-dims">
                {detail.dimensions.map((d) => (
                  <li key={d.key}>
                    <Link href="/events">{d.title}</Link>
                    <span className="intel-hint">
                      {d.percent === null ? d.note ?? "غير متاح" : `${d.percent}٪ (${d.completed}/${d.total})`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </IntelCard>
        )}

        <IntelCard title="جاهزية الفعاليات" count={data.events.length}>
          {data.events.length === 0 ? (
            <IntelEmpty why="لا توجد فعاليات مسجلة في النطاق الحالي." />
          ) : (
            <ul className="intel-list">
              {data.events.map((e) => (
                <li key={e.eventId}>
                  <div className="intel-card-head">
                    <Link href={`/events/${e.eventId}`}>{e.eventTitle}</Link>
                    <span className={e.percent === null ? "intel-hint" : "intel-badge"}>
                      {e.percent === null ? "غير متاح" : `${e.percent}٪`}
                    </span>
                  </div>
                  <p className="intel-hint">
                    {e.statement}
                  </p>
                  <Link className="intel-hint" href={`/intelligence/events?event=${e.eventId}`}>
                    عرض الجاهزية تفصيليًا
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </IntelCard>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------ committees --

export function CommitteesView({
  data,
  range,
  rangeOptions,
  error,
}: {
  data: CommitteesShape | null;
  range: string;
  rangeOptions: { key: string; label: string }[];
  error: string | null;
}) {
  if (!data)
    return (
      <Frame area="committees" range={range} rangeOptions={rangeOptions} error={error}>
        <IntelEmpty why="لا توجد بيانات لجان متاحة." />
      </Frame>
    );
  return (
    <Frame area="committees" range={range} rangeOptions={rangeOptions} error={error}>
      <p className="intel-note">{data.rankingNote}</p>
      <div className="intel-grid">
        {data.committees.map((c) => (
          <IntelCard key={c.id} title={c.name} count={null} hint={c.description || undefined}>
            <dl className="intel-summary">
              <div>
                <dt>أعضاء موزّعون</dt>
                <dd>{c.activeMembers}</dd>
              </div>
              <div>
                <dt>أعمال مفتوحة</dt>
                <dd>{c.openWork}</dd>
              </div>
              <div>
                <dt>متأخرات</dt>
                <dd>{c.overdue}</dd>
              </div>
              <div>
                <dt>طلبات مُرسلة</dt>
                <dd>{c.requestsSent}</dd>
              </div>
              <div>
                <dt>طلبات مُستلمة</dt>
                <dd>{c.requestsReceived}</dd>
              </div>
              <div>
                <dt>ساعات تطوعية</dt>
                <dd>{c.volunteerHours === null ? "غير متاح" : c.volunteerHours}</dd>
              </div>
            </dl>
            <ul className="intel-statuses">
              {c.statuses.map((s) => (
                <li key={s.key}>
                  <strong>{s.label}</strong>
                  <span className="intel-hint">{s.basis.join(" · ")}</span>
                </li>
              ))}
            </ul>
            {c.operationsQueue && Object.keys(c.operationsQueue).length > 0 && (
              <IntelBars
                title="طابور العمليات"
                data={Object.entries(c.operationsQueue).map(([k, v]) => ({ label: k, value: v }))}
              />
            )}
            <p className="intel-note">{c.scoreNote}</p>
          </IntelCard>
        ))}
      </div>
    </Frame>
  );
}

// --------------------------------------------------------------- reports --

export function ReportsView({
  data,
  range,
  rangeOptions,
  error,
}: {
  data: ReportsShape | null;
  range: string;
  rangeOptions: { key: string; label: string }[];
  error: string | null;
}) {
  if (!data)
    return (
      <Frame area="reports" range={range} rangeOptions={rangeOptions} error={error}>
        <IntelEmpty why="مركز التقارير غير متاح." />
      </Frame>
    );
  return (
    <Frame area="reports" range={range} rangeOptions={rangeOptions} error={error}>
      <IntelCard title="قوالب التقارير" count={data.templates.length} hint={data.note}>
        <ul className="intel-templates">
          {data.templates.map((t) => (
            <li key={t.key}>
              <div className="intel-card-head">
                <strong>{t.title}</strong>
                <span className={t.permitted ? "intel-badge" : "intel-hint"}>
                  {t.permitted ? "متاح" : "يحتاج صلاحية"}
                </span>
              </div>
              <p className="intel-hint">{t.description}</p>
              <div className="intel-template-links">
                <Link href={`/intelligence/reports/${t.key}?range=${range}`}>عرض</Link>
                {t.permitted && data.canGenerate && (
                  <>
                    <Link href={`/intelligence/reports/${t.key}?range=${range}&print=1`}>
                      طباعة
                    </Link>
                    <a href={`/api/intelligence/report/${t.key}?range=${range}&format=csv`}>
                      تصدير CSV
                    </a>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </IntelCard>
    </Frame>
  );
}

/** Printable report view. Same data, print-oriented layout. */
export function ReportPrintView({
  report,
}: {
  report: {
    title: string;
    generatedAt: string;
    period: { from: string; to: string; label: string };
    sections: {
      title: string;
      rows: { label: string; value: string; note?: string }[];
    }[];
    provenance: {
      title: string;
      value: number | null;
      formula: string;
      numerator: number | null;
      denominator: number | null;
      sources: string[];
      available: boolean;
      reasonUnavailable?: string;
    }[];
    notes: string[];
  };
}) {
  return (
    <div className="intel-print" dir="rtl">
      <header className="intel-print-head">
        <h1>{report.title}</h1>
        <p>
          الفترة: {report.period.label} ({report.period.from.slice(0, 10)} —{" "}
          {report.period.to.slice(0, 10)})
        </p>
        <p>وقت التوليد: {new Date(report.generatedAt).toLocaleString("ar-SA")}</p>
      </header>
      {report.sections.map((s) => (
        <section key={s.title} className="intel-print-section">
          <h2>{s.title}</h2>
          <table>
            <thead>
              <tr>
                <th>البند</th>
                <th>القيمة</th>
                <th>ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={`${s.title}-${r.label}-${i}`}>
                  <td>{r.label}</td>
                  <td>{r.value}</td>
                  <td>{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <section className="intel-print-section">
        <h2>إسناد المؤشرات</h2>
        <table>
          <thead>
            <tr>
              <th>المؤشر</th>
              <th>القيمة</th>
              <th>البسط</th>
              <th>المقام</th>
              <th>الصيغة</th>
              <th>المصدر</th>
            </tr>
          </thead>
          <tbody>
            {report.provenance.map((p) => (
              <tr key={p.title}>
                <td>{p.title}</td>
                <td>{p.value === null ? "غير متاح" : p.value}</td>
                <td>{p.numerator ?? "—"}</td>
                <td>{p.denominator ?? "—"}</td>
                <td>{p.available ? p.formula : p.reasonUnavailable}</td>
                <td>{p.sources.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <footer className="intel-print-foot">
        <ul>
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </footer>
    </div>
  );
}

export function IntelligenceNav({ area }: { area: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="intel-menu" onClick={() => setOpen((v) => !v)}>
        {intelAreas.find((a) => a.key === area)?.label ?? "الاستخبارات"}
      </button>
      {open && (
        <ul className="intel-menu-list">
          {intelAreas.map((a) => (
            <li key={a.key}>
              <Link href={a.href} onClick={() => setOpen(false)}>
                {a.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}