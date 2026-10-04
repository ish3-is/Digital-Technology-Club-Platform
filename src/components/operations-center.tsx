"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  assetAvailabilityLabels,
  assetConditionLabels,
  budgetStatusLabels,
  certificateStatusLabels,
  digitalServiceLabels,
  digitalStatusLabels,
  expenseCategoryLabels,
  expenseStatusLabels,
  formStatusLabels,
  incidentKindLabels,
  incidentStatusLabels,
  mediaStatusLabels,
  mediaTypeLabels,
  priorityLabels,
} from "@/lib/operations/types";
import type * as Ops from "@/lib/operations";

type Json<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
type Home = Json<Awaited<ReturnType<typeof Ops.operationsHome>>>;
type Inbox = Json<Awaited<ReturnType<typeof Ops.operationsInbox>>>;

const AREAS = [
  { key: "home", href: "/operations", label: "الرئيسية" },
  { key: "finance", href: "/operations/finance", label: "المالية" },
  { key: "media", href: "/operations/media", label: "الإعلام" },
  { key: "digital", href: "/operations/digital", label: "الرقمية" },
  { key: "resources", href: "/operations/resources", label: "الموارد" },
];

const fmt = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

const money = (n: number, currency = "ر.س") =>
  `${n.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ${currency}`;

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : "—");

function Card({ title, count, children, hint }: { title: string; count?: number; children: ReactNode; hint?: string }) {
  return (
    <section className="ops-card">
      <header className="ops-card-head">
        <h2>{title}</h2>
        {count !== undefined && <span className="ops-count">{count}</span>}
      </header>
      {hint && <p className="ops-hint">{hint}</p>}
      {children}
    </section>
  );
}

/** Shown wherever a domain is visible but empty, or hidden by scope. */
function Empty({ why }: { why: string }) {
  return (
    <div className="ops-empty">
      <p>{why}</p>
    </div>
  );
}

function NoTerm({ activeTermCount }: { activeTermCount: number }) {
  if (activeTermCount) return null;
  return (
    <div className="ops-empty" role="status">
      <p>لا يوجد فصل أكاديمي نشط، لذلك لا يمكن إنشاء طلبات جديدة.</p>
      <p className="ops-hint">
        يمكنك متابعة السجلات الحالية، وتُفعَّل.actions الإنشاء فور اعتماد فصل نشط.
      </p>
    </div>
  );
}

function Meter({ percent, overspent }: { percent: number; overspent: boolean }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="ops-meter" role="img" aria-label={`الاستهلاك ${percent}%`}>
      <span
        className={overspent ? "ops-meter-fill overspent" : "ops-meter-fill"}
        style={{ width: `${overspent ? 100 : clamped}%` }}
      />
    </div>
  );
}

function StatusPill({ value, labels }: { value: string; labels: Record<string, string> }) {
  return <span className={`ops-pill status-${value}`}>{labels[value] ?? value}</span>;
}

export function OperationsCenter({
  area,
  home,
  inbox,
  activeTermCount,
  canFinance,
  canMedia,
  canDigital,
  canResources,
  notice,
}: {
  area: string;
  home: Home | null;
  inbox: Inbox;
  activeTermCount: number;
  canFinance: boolean;
  canMedia: boolean;
  canDigital: boolean;
  canResources: boolean;
  notice?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(path: string, payload: unknown, after?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/operations${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "تعذر إكمال الإجراء");
        return;
      }
      router.refresh();
      if (after) router.push(after);
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops" dir="rtl">
      <header className="ops-header">
        <div>
          <h1>العمليات المتخصصة</h1>
          <p className="ops-hint">
            مساحات عمل اللجان: المالية، الإعلام، الخدمات الرقمية، والموارد. كل الأرقام
            محسوبة من سجلات موجودة فعليًا.
          </p>
        </div>
      </header>

      <nav className="ops-tabs" aria-label="مساحات العمليات">
        {AREAS.map((a) => (
          <Link key={a.key} href={a.href} className={area === a.key ? "active" : ""}>
            {a.label}
          </Link>
        ))}
      </nav>

      {notice && (
        <div className="ops-notice" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="ops-error" role="alert">
          {error}
        </div>
      )}
      <NoTerm activeTermCount={activeTermCount} />

      {area === "home" && (
        <HomeArea home={home} inbox={inbox} flags={{ canFinance, canMedia, canDigital, canResources }} />
      )}
      {area === "finance" && <FinanceArea home={home} post={post} busy={busy} can={canFinance} />}
      {area === "media" && <MediaArea home={home} post={post} busy={busy} can={canMedia} />}
      {area === "digital" && <DigitalArea home={home} post={post} busy={busy} can={canDigital} />}
      {area === "resources" && <ResourceArea home={home} post={post} busy={busy} can={canResources} />}
    </div>
  );
}

function HomeArea({
  home,
  inbox,
  flags,
}: {
  home: Home | null;
  inbox: Inbox;
  flags: { canFinance: boolean; canMedia: boolean; canDigital: boolean; canResources: boolean };
}) {
  const attention = home?.attention;
  return (
    <div className="ops-grid">
      <Card title="ما يحتاج انتباهك اليوم" count={inbox.length}>
        {inbox.length === 0 ? (
          <Empty why="لا توجد بنود مفتوحة تحتاج إجراء منك حاليًا." />
        ) : (
          <ul className="ops-list">
            {inbox.slice(0, 12).map((i) => (
              <li key={`${i.kind}-${i.entityId}`}>
                <Link href={i.href}>{i.title}</Link>
                <span className="ops-hint">
                  {i.kind === "finance"
                    ? "مالية"
                    : i.kind === "media"
                      ? "إعلام"
                      : i.kind === "digital"
                        ? "رقمية"
                        : "موارد"}{" "}
                  · {i.action}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="ملخص الانتباه">
        {!attention ? (
          <Empty why="تعذر تحميل الملخص." />
        ) : (
          <dl className="ops-stats">
            <div>
              <dt>مالية</dt>
              <dd>{attention.finance}</dd>
            </div>
            <div>
              <dt>إعلام</dt>
              <dd>{attention.media}</dd>
            </div>
            <div>
              <dt>رقمية</dt>
              <dd>{attention.digital}</dd>
            </div>
            <div>
              <dt>موارد</dt>
              <dd>{attention.resources}</dd>
            </div>
          </dl>
        )}
      </Card>

      {flags.canFinance && (
        <Card title="تنبيهات مالية" count={home?.finance.alerts.length ?? 0}>
          {!home?.finance.alerts.length ? (
            <Empty why="لا توجد تنبيهات مالية مستحقة من السجلات الحالية." />
          ) : (
            <ul className="ops-list">
              {home.finance.alerts.map((a, i) => (
                <li key={`${a.kind}-${a.entityId}-${i}`} className={`sev-${a.severity}`}>
                  {a.message}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {flags.canMedia && (
        <Card title="إعلام في الانتظار" count={home?.media.waitingReview.length ?? 0}>
          {!home?.media.waitingReview.length ? (
            <Empty why="لا توجد مخرجات بانتظار المراجعة." />
          ) : (
            <ul className="ops-list">
              {home.media.waitingReview.map((m) => (
                <li key={m.id}>
                  <Link href={`/operations/media?request=${m.id}`}>{m.title}</Link>
                  <span className="ops-hint">{mediaTypeLabels[m.mediaType]}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {flags.canDigital && (
        <Card title="خدمات رقمية مفتوحة" count={home?.digital.open.length ?? 0}>
          {!home?.digital.open.length ? (
            <Empty why="لا توجد خدمات رقمية مفتوحة." />
          ) : (
            <ul className="ops-list">
              {home.digital.open.map((d) => (
                <li key={d.id}>
                  <Link href={`/operations/digital?request=${d.id}`}>{d.title}</Link>
                  <span className="ops-hint">{digitalServiceLabels[d.serviceType]}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {flags.canResources && (
        <Card title="أصول ومنحوزات" count={home?.resources.total ?? 0}>
          <dl className="ops-stats">
            {Object.entries(home?.resources.byAvailability ?? {}).map(([k, v]) => (
              <div key={k}>
                <dt>{assetAvailabilityLabels[k as never] ?? k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {(home?.resources.openIncidents ?? 0) > 0 && (
            <p className="ops-hint">بلاغات مفتوحة: {home?.resources.openIncidents}</p>
          )}
        </Card>
      )}
    </div>
  );
}

function FinanceArea({
  home,
  post,
  busy,
  can,
}: {
  home: Home | null;
  post: (p: string, b: unknown, a?: string) => Promise<void>;
  busy: boolean;
  can: boolean;
}) {
  const finance = home?.finance;
  if (!can || !finance?.available)
    return <Empty why="لا تملك صلاحية قراءة العمليات المالية." />;
  return (
    <div className="ops-grid">
      <Card title="الميزانيات" count={finance.budgets.length}>
        {finance.budgets.length === 0 ? (
          <Empty why="لا توجد ميزانيات مسجلة بعد." />
        ) : (
          <ul className="ops-list">
            {finance.budgets.map((b) => (
              <li key={b.id} className="ops-budget">
                <div className="ops-row">
                  <strong>{b.title}</strong>
                  <StatusPill value={b.status} labels={budgetStatusLabels} />
                </div>
                <div className="ops-row">
                  <span className="ops-hint">
                    مخصص {money(b.totals.allocated, b.currency)} · ملتزم{" "}
                    {money(b.totals.committed, b.currency)} · منصرف {money(b.totals.spent, b.currency)}
                  </span>
                </div>
                <Meter percent={b.totals.utilizationPercent} overspent={b.totals.overspent} />
                <span className="ops-hint">
                  المتبقي {money(b.totals.remaining, b.currency)} · الاستهلاك{" "}
                  {b.totals.utilizationPercent}%
                  {b.totals.overspent ? " · تجاوز الحد" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="بانتظار المراجعة أو الاعتماد" count={finance.pendingReview.length}>
        {finance.pendingReview.length === 0 ? (
          <Empty why="لا توجد طلبات مصروف بانتظار إجراء." />
        ) : (
          <ul className="ops-list">
            {finance.pendingReview.map((e) => (
              <li key={e.id}>
                <div className="ops-row">
                  <Link href={`/operations/finance?expense=${e.id}`}>{e.title}</Link>
                  <StatusPill value={e.status} labels={expenseStatusLabels} />
                </div>
                <span className="ops-hint">
                  {money(e.amount, e.currency)} · {expenseCategoryLabels[e.category]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="مشتريات غير مطابقة" count={finance.unreconciled.length}>
        {finance.unreconciled.length === 0 ? (
          <Empty why="كل المشتريات المسجلة تمت مطابقتها." />
        ) : (
          <ul className="ops-list">
            {finance.unreconciled.map((p) => (
              <li key={p.id}>
                <strong>{p.vendor}</strong>
                <span className="ops-hint">
                  {money(p.amount)} · {day(p.purchasedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="كل الطلبات"
        count={finance.expenses.length}
        hint="اعتماد المصروف ومراجعته ومطابقته صلاحيات منفصلة."
      >
        {finance.expenses.length === 0 ? (
          <Empty why="لا توجد طلبات مصروف." />
        ) : (
          <ul className="ops-list">
            {finance.expenses.map((e) => (
              <li key={e.id}>
                <div className="ops-row">
                  <Link href={`/operations/finance?expense=${e.id}`}>{e.title}</Link>
                  <StatusPill value={e.status} labels={expenseStatusLabels} />
                </div>
                <span className="ops-hint">
                  {money(e.amount, e.currency)} · {expenseCategoryLabels[e.category]}
                </span>
                {e.status === "submitted" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => post(`/expense/${e.id}`, { action: "start_review" })}
                  >
                    بدء المراجعة
                  </button>
                )}
                {e.status === "finance_review" && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => post(`/expense/${e.id}`, { action: "approve", note: "اعتماد" })}
                    >
                      اعتماد
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        post(`/expense/${e.id}`, { action: "request_changes", note: "يحتاج تعديلات" })
                      }
                    >
                      طلب تعديلات
                    </button>
                  </>
                )}
                {e.status === "purchased" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const purchase = finance.purchases.find((p) => p.expenseId === e.id);
                      if (purchase) void post(`/purchase/${purchase.id}`, { notes: "مطابقة" });
                    }}
                  >
                    مطابقة
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MediaArea({
  home,
  post,
  busy,
  can,
}: {
  home: Home | null;
  post: (p: string, b: unknown, a?: string) => Promise<void>;
  busy: boolean;
  can: boolean;
}) {
  const media = home?.media;
  if (!can || !media?.available) return <Empty why="لا تملك صلاحية قراءة الطلبات الإعلامية." />;
  const rows = [
      ...media.inProduction,
      ...media.waitingReview,
      ...media.changesRequested,
      ...media.scheduled,
      ...media.published,
    ];
  return (
    <div className="ops-grid">
      <Card title="خط الإنتاج" count={Object.values(media.pipeline).reduce((a, b) => a + b, 0)}>
        {Object.keys(media.pipeline).length === 0 ? (
          <Empty why="لا توجد طلبات إعلامية." />
        ) : (
          <dl className="ops-stats">
            {Object.entries(media.pipeline).map(([k, v]) => (
              <div key={k}>
                <dt>{mediaStatusLabels[k as never] ?? k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card title="متأخر عن الموعد" count={media.overdue.length}>
        {media.overdue.length === 0 ? (
          <Empty why="لا توجد مهام إعلامية تجاوزت موعدها المسجل." />
        ) : (
          <ul className="ops-list">
            {media.overdue.map((m) => (
              <li key={m.id}>
                <strong>{m.title}</strong>
                <span className="ops-hint">الموعد {day(m.deadline)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="كل الطلبات الإعلامية" count={media.all.length}>
        {media.all.length === 0 ? (
          <Empty why="لا توجد طلبات إعلامية." />
        ) : (
          <ul className="ops-list">
            {media.all.map((m) => (
              <li key={m.id}>
                <div className="ops-row">
                  <Link href={`/operations/media?request=${m.id}`}>{m.title}</Link>
                  <StatusPill value={m.status} labels={mediaStatusLabels} />
                </div>
                <span className="ops-hint">
                  {mediaTypeLabels[m.mediaType]} · {priorityLabels[m.priority] ?? m.priority}
                </span>
                {m.status === "changes_requested" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => post(`/media/${m.id}/advance`, { status: "in_production" })}
                  >
                    بدء التعديل
                  </button>
                )}
                {m.status === "approved" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      post(`/media/${m.id}/schedule`, {
                        scheduledFor: new Date(Date.now() + 86400000).toISOString(),
                      })
                    }
                  >
                    جدولة النشر
                  </button>
                )}
                {m.status === "scheduled" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => post(`/media/${m.id}/publish`, {})}
                  >
                    تسجيل النشر
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="الأرشيف" count={media.archive.length}>
        {media.archive.length === 0 ? (
          <Empty why="لا يوجد محتوى معتمد أو منشور في الأرشيف بعد." />
        ) : (
          <ul className="ops-list">
            {media.archive.map((m) => (
              <li key={m.id}>
                <strong>{m.title}</strong>
                <span className="ops-hint">
                  {mediaTypeLabels[m.mediaType]} · {fmt(m.platform)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DigitalArea({
  home,
  post,
  busy,
  can,
}: {
  home: Home | null;
  post: (p: string, b: unknown, a?: string) => Promise<void>;
  busy: boolean;
  can: boolean;
}) {
  const digital = home?.digital;
  if (!can || !digital?.available) return <Empty why="لا تملك صلاحية قراءة الخدمات الرقمية." />;
  return (
    <div className="ops-grid">
      <Card title="كل الطلبات الرقمية" count={digital.all.length}>
        {digital.all.length === 0 ? (
          <Empty why="لا توجد خدمات رقمية." />
        ) : (
          <ul className="ops-list">
            {digital.all.map((d) => (
              <li key={d.id}>
                <div className="ops-row">
                  <Link href={`/operations/digital?request=${d.id}`}>{d.title}</Link>
                  <StatusPill value={d.status} labels={digitalStatusLabels} />
                </div>
                <span className="ops-hint">
                  {digitalServiceLabels[d.serviceType]} · {priorityLabels[d.priority] ?? d.priority}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="نماذج مفتوحة" count={digital.activeForms.length}>
        {digital.activeForms.length === 0 ? (
          <Empty why="لا توجد نماذج مسجلة مفتوحة." />
        ) : (
          <ul className="ops-list">
            {digital.activeForms.map((f) => (
              <li key={f.id}>
                <div className="ops-row">
                  <strong>{f.title}</strong>
                  <StatusPill value={f.status} labels={formStatusLabels} />
                </div>
                <span className="ops-hint">
                  {fmt(f.provider)}
                  {f.responseCount === null ? " · عدد الاستجابات غير مسجل" : ` · ${f.responseCount} استجابة`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="دفعات الشهادات" count={digital.batches.length}>
        {digital.batches.length === 0 ? (
          <Empty why="لا توجد دفعات شهادات مسجلة." />
        ) : (
          <ul className="ops-list">
            {digital.batches.map((b) => (
              <li key={b.id}>
                <div className="ops-row">
                  <strong>{b.title}</strong>
                  <StatusPill value={b.status} labels={certificateStatusLabels} />
                </div>
                <span className="ops-hint">
                  صادر {b.generatedCount} · مرسل {b.sentCount} · إخفاق {b.failureCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ResourceArea({
  home,
  post,
  busy,
  can,
}: {
  home: Home | null;
  post: (p: string, b: unknown, a?: string) => Promise<void>;
  busy: boolean;
  can: boolean;
}) {
  const res = home?.resources;
  if (!can || !res?.available) return <Empty why="لا تملك صلاحية قراءة الأصول." />;
  return (
    <div className="ops-grid">
      <Card title="الأصول" count={res.total}>
        {res.assets.length === 0 ? (
          <Empty why="لا توجد أصول مسجلة." />
        ) : (
          <ul className="ops-list">
            {res.assets.map((a) => (
              <li key={a.id}>
                <div className="ops-row">
                  <strong>{a.name}</strong>
                  <StatusPill value={a.availability} labels={assetAvailabilityLabels} />
                </div>
                <span className="ops-hint">
                  {a.category} · {fmt(a.assetCode)} · {assetConditionLabels[a.condition]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="حجوزات بانتظار الاعتماد" count={res.pendingApprovals.length}>
        {res.pendingApprovals.length === 0 ? (
          <Empty why="لا توجد حجوزات بانتظار الاعتماد." />
        ) : (
          <ul className="ops-list">
            {res.pendingApprovals.map((r) => (
              <li key={r.id}>
                <strong>{r.purpose}</strong>
                <span className="ops-hint">
                  {day(r.startsAt)} → {day(r.endsAt)}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => post(`/reservation/${r.id}`, { action: "approve" })}
                >
                  اعتماد
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="مُستلم حاليًا" count={res.checkedOut.length}>
        {res.checkedOut.length === 0 ? (
          <Empty why="لا توجد أصول مستلمة." />
        ) : (
          <ul className="ops-list">
            {res.checkedOut.map((r) => (
              <li key={r.id}>
                <strong>{r.purpose}</strong>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => post(`/reservation/${r.id}`, { action: "return" })}
                >
                  تسجيل إرجاع
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="بلاغات" count={res.incidents.length}>
        {res.incidents.length === 0 ? (
          <Empty why="لا توجد بلاغات على الأصول." />
        ) : (
          <ul className="ops-list">
            {res.incidents.map((i) => (
              <li key={i.id}>
                <div className="ops-row">
                  <strong>{incidentKindLabels[i.kind]}</strong>
                  <StatusPill value={i.status} labels={incidentStatusLabels} />
                </div>
                {i.details && <span className="ops-hint">{i.details}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
