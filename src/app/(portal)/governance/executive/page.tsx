import { headers } from "next/headers";
import { identity, HttpError } from "@/lib/services";
import { Shell } from "@/components/shell";
import { GovernanceCenter } from "@/components/governance-center";
import * as queries from "@/lib/governance/queries";
export const dynamic = "force-dynamic";
type StringDate<T> = T extends Date ? string : T extends Array<infer U> ? StringDate<U>[] : T extends object ? { [K in keyof T]: StringDate<T[K]> } : T;
type Lists = StringDate<Awaited<ReturnType<typeof queries.governanceLists>>>;
type Snapshot = StringDate<Awaited<ReturnType<typeof queries.governanceSnapshot>>>;
type Options = StringDate<Awaited<ReturnType<typeof queries.governanceOptions>>>;
type Detail = StringDate<Awaited<ReturnType<typeof queries.governanceDetail>>>;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await identity(await headers()).catch(() => {
    throw new HttpError(401, "غير مسجّل الدخول");
  });
  const query = await searchParams;
  const options = JSON.parse(JSON.stringify(await queries.governanceOptions(ctx))) as Options;
  const lists = JSON.parse(JSON.stringify(await queries.governanceLists(ctx))) as Lists;
  const snapshot = JSON.parse(JSON.stringify(await queries.governanceSnapshot(ctx, {
    academicTermId: query.term,
    committeeId: query.committee,
  }))) as Snapshot;
  const selectedId = query.item;
  const detail = selectedId
    ? await queries.governanceDetail(ctx, query.tab as any, selectedId)
    : null;
  return (
    <Shell name={ctx.user.name} admin={false} supervisor={false}>
      <div className="gov-section governance-center">
        <div className="page-heading">
          <span className="eyebrow">المرحلة الرابعة · مركز قيادة النادي</span>
          <h1>مركز القيادة</h1>
          <p>صورة واحدة للنادي كامل، من الأهداف للمؤشرات، ومن التقارير للقرارات — للفريق القيادي.</p>
        </div>
        <nav className="gov-tabs" aria-label="مساحات الحوكمة">
          <a href="/governance">النبض والقيادة</a>
          <a href="/governance/executive" aria-current="page">مركز القيادة</a>
          <a href="/governance?tab=weekly">المراجعة الأسبوعية</a>
          <a href="/governance/inbox">صندوق الوارد</a>
        </nav>
        <section className="panel gov-section">
          <h2>نبض النادي الكامل</h2>
          <div className="gov-card-grid">
            {snapshot.pulse?.map((p: any) => (
              <article key={p.id} className="panel gov-card">
                <h2>{p.label}</h2>
                <strong className="gov-value">
                  {p.value == null ? "غير متاح" : `${p.value}%`}
                </strong>
                <p className="muted">{p.description}</p>
                <details>
                  <summary className="muted">كيف حُسبت؟</summary>
                  <p>
                    {p.numerator} / {p.denominator} · {p.formula}
                  </p>
                  {p.sources?.map((x: any, n: number) => (
                    <p key={n}>
                      <a href={x.href}>{x.title}</a>
                    </p>
                  ))}
                </details>
              </article>
            ))}
          </div>
        </section>
        <section className="panel gov-section">
          <h2>المؤشرات والمتابعة</h2>
          {snapshot.kpis?.length ? (
            <div className="gov-row">
              {snapshot.kpis?.map((k: any) => (
                <article key={k.id}>
                  <a href={`/governance?tab=kpis&item=${k.id}`}>{k.name}</a>
                  <span>
                    {k.currentValue ?? "لم يقس"} / {k.targetValue} {k.unit}
                  </span>
                  <span>
                    {k.progress?.reached == null
                      ? "غير مقاس"
                      : k.progress?.reached
                        ? "متحقق"
                        : "لم يتحقق"}
                  </span>
                  <small className="muted">{k.progress?.explanation}</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">لم تُنشأ مؤشرات بعد.</p>
          )}
        </section>
        <section className="panel gov-section">
          <h2>صحة اللجان</h2>
          <div className="gov-card-grid">
            {snapshot.health?.map((c: any) => (
              <article key={c.id}>
                <h3>{c.name}</h3>
                <p className="muted">
                  {c.total} أعمال · {c.overdue} متأخرة · {c.waiting} انتظار ·{" "}
                  {c.evidenceGaps} بلا دليل
                </p>
                <p>{c.explanation}</p>
                <a href={`/work?committee=${c.id}`}>افتح عمل اللجنة</a>
              </article>
            ))}
          </div>
        </section>
        <section className="panel gov-section">
          <h2>التنبيهات</h2>
          {snapshot.alerts?.length ? (
            <div className="gov-row">
              {snapshot.alerts?.map((a: any) => (
                <article key={a.id}>
                  <a href={a.href}>{a.title}</a>
                  <p>{a.reason}</p>
                  <span className="subtle-chip">
                    {a.severity === "high"
                      ? "تحتاج متابعة قريبة"
                      : "متابعة"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">لا توجد تنبيهات في النطاق الحالي.</p>
          )}
        </section>
        <section className="panel gov-section">
          <h2>قرارات تنتظرك</h2>
          {snapshot.actions?.length ? (
            <div>
              {snapshot.actions?.map((a: any) => (
                <p key={a.id}>
                  <a href={a.href}>{a.title} — {a.action}</a>
                  <br />
                  <small className="muted">{a.reason}</small>
                </p>
              ))}
            </div>
          ) : (
            <p className="muted">لا توجد مراجعات أو اعتمادات مسندة.</p>
          )}
        </section>
      </div>
    </Shell>
  );
}
