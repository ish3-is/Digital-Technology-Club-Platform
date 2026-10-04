"use client";
import Link from "next/link";
import { InsightList, IntelCard, IntelEmpty, MetricCard, type JsonMetric } from "@/components/intelligence-center";

export type SupervisorBriefShape = {
  generatedAt: string;
  term: { id: string; name: string } | null;
  period: { from: string; to: string; label: string };
  events: {
    id: string;
    title: string;
    dueAt: string | null;
    readinessPercent: number | null;
    completed: number;
    total: number;
    overdue: number;
    href: string;
  }[];
  reportsAwaitingAction: {
    id: string;
    title: string;
    status: string;
    periodEnd: string | null;
    href: string;
  }[];
  governanceItems: { goalId: string; goalTitle: string; pendingKpis: number; href: string }[];
  operations: {
    finance: { available: boolean; pendingExpenses: number | null; unreconciled: number | null; spent: number | null };
    media: { available: boolean; waitingReview: number | null; overdue: number | null };
    digital: { available: boolean; waitingInput: number | null; overdue: number | null };
    resources: { available: boolean; openIncidents: number | null; maintenance: number | null };
  };
  people: {
    activeMembers: number | null;
    attendanceRate: number | null;
    volunteerHours: number | null;
    onboardingComplete: number | null;
    onboardingInProgress: number | null;
  };
  execution: { overdue: number | null; inReview: number | null; open: number | null };
  insights: Parameters<typeof InsightList>[0]["insights"];
  capacity: { key: string; title: string; detail: string; active: boolean; href: string }[];
  privacyNote: string;
  links: { label: string; href: string }[];
};

/**
 * The supervisor brief.
 *
 * Oversight by construction: every block reflects what the supervisor's own
 * grants allow, and a domain they cannot read is stated as unavailable rather
 * than filled with a placeholder. Nothing here grants editing inside a
 * committee — the only actions offered are links the supervisor can open.
 */
export function SupervisorBrief({ brief }: { brief: SupervisorBriefShape }) {
  const num = (v: number | null) => (v === null ? "غير متاح" : v.toLocaleString("ar-SA"));
  const domain = (
    title: string,
    available: boolean,
    rows: [string, number | null][],
  ) => (
    <IntelCard title={title} count={null}>
      {!available ? (
        <IntelEmpty why="لا تملك صلاحية قراءة هذا المجال." />
      ) : (
        <dl className="intel-summary">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{num(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </IntelCard>
  );

  return (
    <div className="intel" dir="rtl">
      <header className="intel-header">
        <h1>ملخص المشرف</h1>
        <p className="intel-hint">
          إشراف تشغيلي مستمد من طبقة الاستخبارات: {brief.term?.name ?? "لا يوجد فصل نشط"} ·{" "}
          {brief.period.label}. لا يفتح هذا الملخص صلاحيات تحرير داخل اللجان.
        </p>
      </header>

      <div className="intel-grid">
        <IntelCard title="الحالة العامة" count={null}>
          <dl className="intel-summary">
            <div>
              <dt>أعمال متأخرة</dt>
              <dd>{num(brief.execution.overdue)}</dd>
            </div>
            <div>
              <dt>بانتظار المراجعة</dt>
              <dd>{num(brief.execution.inReview)}</dd>
            </div>
            <div>
              <dt>أعمال مفتوحة</dt>
              <dd>{num(brief.execution.open)}</dd>
            </div>
            <div>
              <dt>أعضاء نشطون</dt>
              <dd>{num(brief.people.activeMembers)}</dd>
            </div>
            <div>
              <dt>نسبة الحضور</dt>
              <dd>{brief.people.attendanceRate === null ? "غير متاح" : `${brief.people.attendanceRate}٪`}</dd>
            </div>
            <div>
              <dt>ساعات معتمدة</dt>
              <dd>{num(brief.people.volunteerHours)}</dd>
            </div>
            <div>
              <dt>تأهيل مكتمل</dt>
              <dd>{num(brief.people.onboardingComplete)}</dd>
            </div>
            <div>
              <dt>تأهيل جارٍ</dt>
              <dd>{num(brief.people.onboardingInProgress)}</dd>
            </div>
          </dl>
        </IntelCard>

        <IntelCard
          title="جاهزية الفعاليات القادمة"
          count={brief.events.length}
          hint="الجاهزية مشتقة من المتطلبات المرتبطة بكل فعالية، وليست نسبة مخزنة."
        >
          {brief.events.length === 0 ? (
            <IntelEmpty why="لا توجد فعاليات قادمة في الأفق الحالي." />
          ) : (
            <ul className="intel-list">
              {brief.events.map((e) => (
                <li key={e.id}>
                  <div className="intel-card-head">
                    <Link href={e.href}>{e.title}</Link>
                    <span className={e.readinessPercent === null ? "intel-hint" : "intel-badge"}>
                      {e.readinessPercent === null ? "غير متاح" : `${e.readinessPercent}٪`}
                    </span>
                  </div>
                  <p className="intel-hint">
                    اكتمل {e.completed} من {e.total} متطلبًا
                    {e.overdue > 0 ? ` · ${e.overdue} متأخر` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </IntelCard>

        <IntelCard
          title="تقارير تحتاج إجراءك"
          count={brief.reportsAwaitingAction.length}
          hint="تظهر هنا التقارير التي تملك صلاحية مراجعتها أو اعتمادها."
        >
          {brief.reportsAwaitingAction.length === 0 ? (
            <IntelEmpty why="لا توجد تقارير معلّقة على قرارك." />
          ) : (
            <ul className="intel-list">
              {brief.reportsAwaitingAction.map((r) => (
                <li key={r.id}>
                  <div className="intel-card-head">
                    <Link href={r.href}>{r.title}</Link>
                    <span className="intel-hint">{r.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </IntelCard>

        <IntelCard title="بنود الحوكمة" count={brief.governanceItems.length}>
          {brief.governanceItems.length === 0 ? (
            <IntelEmpty why="لا توجد مؤشرات نشطة بلا قياس حديث." />
          ) : (
            <ul className="intel-list">
              {brief.governanceItems.map((g) => (
                <li key={g.goalId}>
                  <div className="intel-card-head">
                    <Link href={g.href}>{g.goalTitle}</Link>
                    <span className="intel-badge">{g.pendingKpis}</span>
                  </div>
                  <p className="intel-hint">مؤشرات بلا قياس حديث.</p>
                </li>
              ))}
            </ul>
          )}
        </IntelCard>

        {domain("المالية", brief.operations.finance.available, [
          ["طلبات بانتظار إجراء", brief.operations.finance.pendingExpenses],
          ["مشتريات غير مطابقة", brief.operations.finance.unreconciled],
          ["المنصرف فعليًا", brief.operations.finance.spent],
        ])}
        {domain("قائمة الإعلام", brief.operations.media.available, [
          ["بانتظار المراجعة", brief.operations.media.waitingReview],
          ["متأخرة", brief.operations.media.overdue],
        ])}
        {domain("الخدمات الرقمية", brief.operations.digital.available, [
          ["بانتظار مدخلات", brief.operations.digital.waitingInput],
          ["متأخرة", brief.operations.digital.overdue],
        ])}
        {domain("الموارد", brief.operations.resources.available, [
          ["بلاغات مفتوحة", brief.operations.resources.openIncidents],
          ["أصول تحتاج صيانة", brief.operations.resources.maintenance],
        ])}

        <IntelCard title="الرؤى التشغيلية" count={brief.insights.length}>
          <InsightList insights={brief.insights} />
        </IntelCard>

        <IntelCard title="روابط" count={null}>
          <ul className="intel-signals">
            {brief.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </IntelCard>
      </div>
      <p className="intel-note">{brief.privacyNote}</p>
    </div>
  );
}

/** Re-exported so the route can type a metric card without importing types. */
export type { JsonMetric };