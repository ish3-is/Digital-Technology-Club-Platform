"use client";
import {
  useEffect,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import type {
  governanceDetail,
  governanceLists,
  governanceOptions,
  governanceSnapshot,
  GovernanceKind,
} from "@/lib/governance/queries";
import {
  goalStatusLabels,
  initiativeStatusLabels,
  kpiStatusLabels,
  evidenceVerificationLabels,
  reportStatusLabels,
  reportSectionLabels,
  goalStatusTransitions,
  initiativeStatusTransitions,
  kpiStatusTransitions,
  evidenceClassificationLabels,
} from "@/lib/governance/types";
type Json<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
type Detail = Json<Awaited<ReturnType<typeof governanceDetail>>>;
type Lists = Json<Awaited<ReturnType<typeof governanceLists>>>;
type Options = Json<Awaited<ReturnType<typeof governanceOptions>>>;
type Snapshot = Json<Awaited<ReturnType<typeof governanceSnapshot>>>;
const labels = {
  goals: "الأهداف",
  initiatives: "المبادرات",
  kpis: "المؤشرات",
  evidence: "خزنة الأدلة",
  reports: "التقارير",
};
const singular = {
  goals: "هدف",
  initiatives: "مبادرة",
  kpis: "مؤشر",
  evidence: "دليل",
  reports: "تقرير",
};
const createLabels = {
  goals: "هدف جديد",
  initiatives: "مبادرة جديدة",
  kpis: "مؤشر جديد",
  evidence: "إضافة دليل",
  reports: "إنشاء تقرير",
};
const firstLabels = {
  goals: "إنشاء أول هدف",
  initiatives: "إنشاء أول مبادرة",
  kpis: "إنشاء أول مؤشر",
  evidence: "إضافة أول دليل",
  reports: "إنشاء أول تقرير",
};
const createPermission = (kind: GovernanceKind) =>
  `${kind === "evidence" ? "evidence" : kind.slice(0, -1)}.create`;
const statusLabels: Record<string, string> = {
  ...goalStatusLabels,
  ...initiativeStatusLabels,
  ...kpiStatusLabels,
  ...evidenceVerificationLabels,
  ...reportStatusLabels,
};
const href = (kind: GovernanceKind, id: string) =>
  `/governance?tab=${kind}&item=${encodeURIComponent(id)}`;
const value = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const optional = (f: FormData, key: string) => value(f, key) || undefined;
const when = (f: FormData, key: string) =>
  value(f, key)
    ? new Date(`${value(f, key)}T12:00:00+03:00`).toISOString()
    : undefined;
const formatDate = (v: string) =>
  new Date(v).toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  });
export function GovernanceField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="gov-field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
function Text({
  label,
  name,
  defaultValue,
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="gov-field">
      <span>{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={12000}
        rows={4}
      />
    </label>
  );
}
function Select({
  label,
  name,
  children,
  required = false,
  defaultValue,
}: {
  label: string;
  name: string;
  children: ReactNode;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="gov-field">
      <span>{label}</span>
      <select name={name} required={required} defaultValue={defaultValue}>
        {children}
      </select>
    </label>
  );
}
export function GovernanceForm({
  children,
  submit,
  label = "حفظ",
  onDone,
}: {
  children: ReactNode;
  submit: (f: FormData) => Promise<void>;
  label?: string;
  onDone?: () => void;
}) {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setReady(true), []);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await submit(f);
          onDone?.();
        } catch (err) {
          setError(err instanceof Error ? err.message : "تعذر الحفظ");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={!ready || busy} className="gov-form">
        {children}
        <button className="button primary" type="submit">
          {busy ? "جارٍ الحفظ…" : label}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
async function send(path: string, data: unknown) {
  const multipart = data instanceof FormData;
  const r = await fetch(`/api/governance/${path}`, {
    method: "POST",
    headers: multipart ? undefined : { "Content-Type": "application/json" },
    body: multipart ? data : JSON.stringify(data),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error ?? "تعذر إكمال العملية");
  return result;
}
export function GovernanceCenter({
  lists,
  snapshot,
  options,
  selected,
  tab = "overview",
  userId,
  heading = "الحوكمة والأدلة",
}: {
  lists: Lists;
  snapshot: Snapshot;
  options: Options;
  selected: Detail | null;
  tab?: string;
  userId: string;
  heading?: string;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [search, setSearch] = useState("");
  const kind =
    tab === "goals" ||
    tab === "initiatives" ||
    tab === "kpis" ||
    tab === "evidence" ||
    tab === "reports"
      ? tab
      : null;
  return (
    <div className="governance-center">
      <div className="page-heading">
        <span className="eyebrow">المرحلة الرابعة · ذاكرة مؤسسية موثقة</span>
        <h1>{heading}</h1>
        <p>من الهدف إلى العمل، ومن القياس إلى الدليل والقرار.</p>
      </div>
      <nav className="gov-tabs" aria-label="مساحات الحوكمة">
        <Link
          href="/governance"
          aria-current={tab === "overview" ? "page" : undefined}
        >
          النبض والقيادة
        </Link>
        {Object.entries(labels).map(([k, label]) => (
          <Link
            key={k}
            href={`/governance?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
        <Link
          href="/governance?tab=weekly"
          aria-current={tab === "weekly" ? "page" : undefined}
        >
          المراجعة الأسبوعية
        </Link>
      </nav>
      <details className="panel gov-section">
        <summary>صلاحياتك ونطاق العمل</summary>
        <p>
          الدور:{" "}
          {options.roles.map((r) => r.name).join("، ") || "لا يوجد دور نشط"}
        </p>
        {(Object.keys(labels) as GovernanceKind[]).map((k) => (
          <p key={k}>
            {createLabels[k]}:{" "}
            {options.grantedCreatePermissions.includes(createPermission(k))
              ? "الصلاحية ممنوحة"
              : "الصلاحية غير ممنوحة"}
            {options.contexts.some((c) =>
              c.permissions.includes(createPermission(k)),
            )
              ? " · متاح ضمن النطاق"
              : " · لا يوجد نطاق إنشاء نشط"}
          </p>
        ))}
      </details>
      {selected ? (
        <GovernanceRecord
          key={`${selected.kind}:${selected.row.id}:${"updatedAt" in selected.row ? selected.row.updatedAt : ""}`}
          detail={selected}
          lists={lists}
          options={options}
          userId={userId}
          refresh={refresh}
        />
      ) : kind ? (
        <>
          <div className="section-title">
            <h2>{labels[kind]}</h2>
            <GovernanceField
              label="بحث في القائمة"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="search"
            />
          </div>
          <CreateGovernance
            key={kind}
            kind={kind}
            lists={lists}
            options={options}
          />
          <div className="gov-card-grid">
            {lists[kind]
              .filter((row) =>
                ("name" in row ? row.name : row.title).includes(search),
              )
              .map((row) => (
                <Link
                  className="panel gov-card"
                  key={row.id}
                  href={href(kind, row.id)}
                >
                  <span className="eyebrow">{singular[kind]}</span>
                  <h3>{"name" in row ? row.name : row.title}</h3>
                  <p>{"description" in row ? row.description : row.summary}</p>
                  <span className="subtle-chip">
                    {
                      statusLabels[
                        "verificationStatus" in row
                          ? row.verificationStatus
                          : row.status
                      ]
                    }
                  </span>
                </Link>
              ))}
          </div>
          {!lists[kind].length && (
            <div className="empty">
              <h3>لا توجد سجلات مرئية بعد</h3>
              <p>تظهر هنا السجلات ضمن نطاق الفصل واللجنة المسموح لك.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <section className="panel gov-section">
            <h2>إجراءات الحوكمة</h2>
            <div className="gov-card-grid">
              {(Object.keys(labels) as GovernanceKind[]).map((k) => (
                <div key={k}>
                  <Link href={`/governance?tab=${k}`}>{labels[k]}</Link>
                  <CreateGovernance kind={k} lists={lists} options={options} />
                </div>
              ))}
            </div>
          </section>
          <GovernanceDashboard
            snapshot={snapshot}
            weeklyOnly={tab === "weekly"}
          />
        </>
      )}
    </div>
  );
}
function GovernanceDashboard({
  snapshot: s,
  weeklyOnly,
}: {
  snapshot: Snapshot;
  weeklyOnly: boolean;
}) {
  return (
    <>
      <p className="muted">
        {s.scope} · آخر حساب: {formatDate(s.asOf)}
      </p>
      {!weeklyOnly && (
        <>
          <div className="gov-card-grid">
            {s.pulse.map((p) => (
              <article className="panel gov-card" key={p.id}>
                <h2>{p.label}</h2>
                <strong className="gov-value">
                  {p.value === null ? "غير متاح" : `${p.value}٪`}
                </strong>
                <p>{p.description}</p>
                <details>
                  <summary>كيف حُسبت؟</summary>
                  <p>
                    {p.numerator} / {p.denominator} · {p.formula}
                  </p>
                  {p.sources.map((x, n) => (
                    <p key={n}>
                      <Link href={x.href}>{x.title}</Link>
                    </p>
                  ))}
                </details>
              </article>
            ))}
          </div>
          <section className="panel gov-section">
            <h2>صحة اللجان</h2>
            <p>
              ترتيب أبجدي؛ مؤشرات متابعة تشغيلية دون مفاضلة أو درجات للأشخاص.
            </p>
            <div className="gov-card-grid">
              {s.health.map((c) => (
                <article key={c.id}>
                  <h3>{c.name}</h3>
                  <p>
                    {c.total} أعمال · {c.overdue} متأخرة · {c.waiting} انتظار
                    مراجعة · {c.evidenceGaps} مؤشرات بلا دليل مراجع ظاهر
                  </p>
                  <p>{c.explanation}</p>
                  <Link href={`/work?committee=${c.id}`}>افتح عمل اللجنة</Link>
                </article>
              ))}
            </div>
          </section>
          <section className="panel gov-section">
            <h2>متابعة المؤشرات</h2>
            {s.kpis.length ? (
              s.kpis.map((k) => (
                <article key={k.id} className="gov-row">
                  <Link href={href("kpis", k.id)}>{k.name}</Link>
                  <span>
                    {k.currentValue ?? "لا قياس"} / {k.targetValue} {k.unit}
                  </span>
                  <span>
                    {k.progress.reached === null
                      ? "غير مقاس"
                      : k.progress.reached
                        ? "المستهدف متحقق"
                        : "لم يتحقق بعد"}
                  </span>
                  <small>
                    {k.progress.explanation} ·{" "}
                    {k.verified ? "دليل مراجع" : "التوثيق يحتاج تحققًا"}
                  </small>
                </article>
              ))
            ) : (
              <p>لم تُنشأ مؤشرات في النطاق المرئي.</p>
            )}
          </section>
        </>
      )}
      <section className="panel gov-section">
        <h2>المراجعة الأسبوعية</h2>
        <p>
          السبعة أيام الماضية حتى {formatDate(s.period.to)}، والقادم خلال سبعة
          أيام.
        </p>
        <div className="gov-card-grid">
          {(
            [
              { key: "completed", label: "اكتمل هذا الأسبوع" },
              { key: "overdue", label: "متأخر ويحتاج متابعة" },
              { key: "upcoming", label: "استحقاقات الأسبوع القادم" },
            ] as const
          ).map((group) => (
            <article key={group.key}>
              <h3>{group.label}</h3>
              {s.weekly[group.key].length ? (
                s.weekly[group.key].map((x) => (
                  <p key={x.id}>
                    <Link href={x.href}>{x.title}</Link>
                  </p>
                ))
              ) : (
                <p>لا توجد عناصر ظاهرة.</p>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="panel gov-section">
        <h2>تنبيهات الحوكمة</h2>
        <p>مشتقة عند فتح الصفحة؛ السبب والمصدر متاحان لكل تنبيه.</p>
        {s.alerts.length ? (
          s.alerts.map((a) => (
            <article key={a.id} className="gov-row">
              <div>
                <Link href={a.href}>{a.title}</Link>
                <p>{a.reason}</p>
              </div>
              <span className="subtle-chip">
                {a.severity === "high" ? "تحتاج متابعة قريبة" : "متابعة"}
              </span>
            </article>
          ))
        ) : (
          <p>لا توجد تنبيهات مشتقة في النطاق الحالي.</p>
        )}
      </section>
      <section className="panel gov-section">
        <h2>قرارات تنتظرك</h2>
        {s.actions.length ? (
          s.actions.map((a) => (
            <p key={a.id}>
              <Link href={a.href}>
                {a.title} — {a.action}
              </Link>
              <br />
              <small>{a.reason}</small>
            </p>
          ))
        ) : (
          <p>لا توجد مراجعات أو اعتمادات مسندة متاحة.</p>
        )}
      </section>
    </>
  );
}
function CreateGovernance({
  kind,
  lists,
  options,
}: {
  kind: GovernanceKind;
  lists: Lists;
  options: Options;
}) {
  const router = useRouter();
  const permission = createPermission(kind);
  const [open, setOpen] = useState(false);
  const contexts = options.contexts.filter((x) =>
    x.permissions.includes(permission),
  );
  const [contextIndex, setContextIndex] = useState("0");
  const [goalId, setGoalId] = useState("");
  if (!contexts.length)
    return (
      <p className="muted">
        {options.activeTermCount === 0
          ? "الإنشاء غير متاح: لا يوجد فصل أكاديمي نشط. اطلب من مسؤول التنظيم تفعيل الفصل."
          : "للقراءة فقط: لا تملك صلاحية إنشاء هذا النوع ضمن فصل ولجنة نشطين."}
      </p>
    );
  const context = contexts[Number(contextIndex)] ?? contexts[0];
  const goals = lists.goals.filter(
    (g) =>
      contexts.some(
        (c) =>
          c.academicTermId === g.academicTermId &&
          c.committeeId === g.committeeId,
      ) &&
      (kind !== "kpis" ||
        (g.academicTermId === context.academicTermId &&
          g.committeeId === context.committeeId)),
  );
  const selectedGoal = goals.find((g) => g.id === goalId);
  const ownerScope = kind === "initiatives" ? selectedGoal : context;
  const canCreateIn = (r: {
    academicTermId: string;
    committeeId: string | null;
  }) =>
    contexts.some(
      (c) =>
        c.academicTermId === r.academicTermId &&
        c.committeeId === r.committeeId,
    );
  const canReference = (r: {
    academicTermId: string;
    committeeId: string | null;
  }) => contexts.some((c) => c.academicTermId === r.academicTermId);
  const sources = [
    ...goals.map((r) => ({ id: r.id, type: "goal", title: r.title })),
    ...lists.initiatives
      .filter((r) => goals.some((g) => g.id === r.goalId))
      .map((r) => ({
        id: r.id,
        type: "initiative",
        title: r.title,
      })),
    ...lists.kpis
      .filter(canReference)
      .map((r) => ({ id: r.id, type: "kpi", title: r.name })),
    ...lists.reports
      .filter(
        (r) =>
          canReference(r) &&
          ["draft", "changes_requested", "rejected"].includes(r.status),
      )
      .map((r) => ({ id: r.id, type: "report", title: r.title })),
  ];
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="gov-section">
        <Dialog.Trigger asChild>
          <button className="button primary">{createLabels[kind]}</button>
        </Dialog.Trigger>
        {!lists[kind].length && (
          <p>
            <button className="button" onClick={() => setOpen(true)}>
              {firstLabels[kind]}
            </button>
          </p>
        )}
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog create-dialog" dir="rtl">
          <Dialog.Close className="dialog-close icon-button" aria-label="إغلاق">
            ×
          </Dialog.Close>
          <Dialog.Title>{createLabels[kind]}</Dialog.Title>
          <Dialog.Description>
            أنشئ سجلًا موثقًا ضمن نطاقك. الحقول تختلف حسب نوع السجل.
          </Dialog.Description>
          <GovernanceForm
            label={`إنشاء ${singular[kind]}`}
            submit={async (f) => {
              const context =
                contexts.find((_, n) => String(n) === value(f, "context")) ??
                contexts[0];
              const scope = {
                academicTermId: context.academicTermId,
                committeeId: context.committeeId ?? undefined,
              };
              let input: unknown;
              if (kind === "goals")
                input = {
                  ...scope,
                  title: value(f, "title"),
                  description: value(f, "description"),
                  dueAt: when(f, "dueAt"),
                };
              if (kind === "initiatives")
                input = {
                  title: value(f, "title"),
                  description: value(f, "description"),
                  goalId: value(f, "goalId"),
                  ownerUserId: optional(f, "ownerUserId"),
                  dueAt: when(f, "dueAt"),
                };
              if (kind === "kpis")
                input = {
                  ...scope,
                  name: value(f, "title"),
                  description: value(f, "description"),
                  goalId: optional(f, "goalId"),
                  unit: value(f, "unit"),
                  direction: value(f, "direction"),
                  targetValue: Number(value(f, "targetValue")),
                  measurementFrequency: value(f, "frequency"),
                  dueAt: when(f, "dueAt"),
                };
              if (kind === "reports")
                input = {
                  ...scope,
                  title: value(f, "title"),
                  summary: value(f, "description"),
                  typeId: value(f, "typeId"),
                  periodStart: when(f, "periodStart"),
                  periodEnd: when(f, "periodEnd"),
                  sectionKeys: ["achievements", "challenges", "next_plan"],
                };
              if (kind === "evidence") {
                const source = sources.find(
                  (x) => `${x.type}:${x.id}` === value(f, "source"),
                );
                if (!source) throw new Error("اختر مصدر الدليل");
                const file = f.get("file");
                input = {
                  title: value(f, "title"),
                  description: value(f, "description"),
                  sourceEntityType: source.type,
                  sourceEntityId: source.id,
                  evidenceType:
                    file instanceof File && file.size ? "file" : "manual",
                  url: optional(f, "url"),
                  classification: value(f, "classification"),
                };
                if (file instanceof File && file.size) {
                  const form = new FormData();
                  form.set("input", JSON.stringify(input));
                  form.set("file", file);
                  input = form;
                }
              }
              const created = await send(kind, input);
              setOpen(false);
              router.push(href(kind, created.id));
              router.refresh();
            }}
          >
            <GovernanceField
              label={`عنوان ${singular[kind]}`}
              name="title"
              required
              minLength={3}
              maxLength={200}
            />
            <Text
              label={kind === "reports" ? "ملخص التقرير" : "الوصف"}
              name="description"
            />
            {["goals", "kpis", "reports"].includes(kind) && (
              <label className="gov-field">
                <span>الفصل واللجنة</span>
                <select
                  name="context"
                  value={contextIndex}
                  onChange={(e) => {
                    setContextIndex(e.target.value);
                    setGoalId("");
                  }}
                >
                  {contexts.map((c, n) => (
                    <option key={n} value={n}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(kind === "initiatives" || kind === "kpis") && (
              <label className="gov-field">
                <span>الهدف المرتبط</span>
                <select
                  name="goalId"
                  required={kind === "initiatives"}
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                >
                  <option value="">اختر الهدف</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {kind === "initiatives" && (
              <>
                <p>
                  الفصل واللجنة موروثان من الهدف المرتبط.
                  {selectedGoal &&
                    ` ${contexts.find((c) => c.academicTermId === selectedGoal.academicTermId && c.committeeId === selectedGoal.committeeId)?.label}`}
                </p>
                {!goals.length && <p>أنشئ هدفًا ضمن نطاقك أولًا.</p>}
                <Select key={goalId} label="مسؤول المبادرة" name="ownerUserId">
                  <option value="">أنا</option>
                  {options.people
                    .filter(
                      (p) =>
                        ownerScope &&
                        p.scopes.some(
                          (s) =>
                            s.academicTermId === ownerScope.academicTermId &&
                            s.committeeId === ownerScope.committeeId &&
                            s.permissions.includes("initiative.view"),
                        ),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </>
            )}
            {["goals", "initiatives", "kpis"].includes(kind) && (
              <GovernanceField
                label="الموعد المستهدف"
                name="dueAt"
                type="date"
              />
            )}
            {kind === "kpis" && (
              <>
                <GovernanceField
                  label="وحدة القياس"
                  name="unit"
                  required
                  maxLength={50}
                />
                <GovernanceField
                  label="القيمة المستهدفة"
                  name="targetValue"
                  type="number"
                  step={1}
                  required
                />
                <Select label="اتجاه المؤشر" name="direction">
                  <option value="higher_is_better">الأعلى أفضل</option>
                  <option value="lower_is_better">الأقل أفضل</option>
                  <option value="target_exact">قيمة دقيقة</option>
                </Select>
                <Select label="دورية القياس" name="frequency">
                  <option value="weekly">أسبوعية</option>
                  <option value="monthly">شهرية</option>
                  <option value="daily">يومية</option>
                  <option value="quarterly">ربع سنوية</option>
                  <option value="annual">سنوية</option>
                </Select>
              </>
            )}
            {kind === "reports" && (
              <>
                <Select label="نوع التقرير" name="typeId">
                  {options.reportTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <GovernanceField
                  label="بداية الفترة"
                  name="periodStart"
                  type="date"
                  required
                />
                <GovernanceField
                  label="نهاية الفترة"
                  name="periodEnd"
                  type="date"
                  required
                />
              </>
            )}
            {kind === "evidence" && (
              <>
                <Select label="مصدر الدليل" name="source" required>
                  <option value="">اختر المصدر</option>
                  {sources.map((s) => (
                    <option
                      key={`${s.type}:${s.id}`}
                      value={`${s.type}:${s.id}`}
                    >
                      {s.title}
                    </option>
                  ))}
                </Select>
                <Select
                  label="تصنيف الدليل"
                  name="classification"
                  defaultValue="internal"
                >
                  {Object.entries(evidenceClassificationLabels).map(
                    ([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ),
                  )}
                </Select>
                <GovernanceField
                  label="رابط المصدر HTTPS"
                  name="url"
                  type="url"
                />
                <GovernanceField
                  label="ملف الدليل (PNG/JPEG/TXT حتى ٥ ميغابايت)"
                  name="file"
                  type="file"
                  accept=".png,.jpg,.jpeg,.txt"
                />
              </>
            )}
          </GovernanceForm>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function GovernanceRecord({
  detail: d,
  lists,
  options,
  userId,
  refresh,
}: {
  detail: Detail;
  lists: Lists;
  options: Options;
  userId: string;
  refresh: () => void;
}) {
  const r = d.row,
    can = (p: string) => d.permissions.includes(p),
    path = `${d.kind}/${r.id}`;
  const editableReport =
    "sections" in r &&
    ["draft", "changes_requested", "rejected"].includes(r.status);
  const transitions =
    "targetType" in r
      ? goalStatusTransitions[r.status]
      : "goal" in r
        ? initiativeStatusTransitions[r.status]
        : "unit" in r
          ? kpiStatusTransitions[r.status]
          : [];
  const editPermission =
    d.kind === "goals"
      ? "goal.update"
      : d.kind === "initiatives"
        ? "initiative.update"
        : d.kind === "kpis"
          ? "kpi.update"
          : "report.update";
  return (
    <>
      <Link href={`/governance?tab=${d.kind}`}>
        العودة إلى {labels[d.kind]}
      </Link>
      <section className="panel gov-section">
        <span className="eyebrow">{singular[d.kind]}</span>
        <h2>{"name" in r ? r.name : r.title}</h2>
        <p>{"description" in r ? r.description : r.summary}</p>
        <span className="subtle-chip">
          {
            statusLabels[
              "verificationStatus" in r ? r.verificationStatus : r.status
            ]
          }
        </span>
        <p className="muted">أُنشئ {formatDate(r.createdAt)}</p>
        {transitions.length > 0 && can(editPermission) && (
          <GovernanceForm
            label="تحديث الحالة"
            onDone={refresh}
            submit={async (f) => {
              await send(`${path}/edit`, { status: value(f, "status") });
            }}
          >
            <Select label="الحالة التالية" name="status">
              {transitions.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </Select>
          </GovernanceForm>
        )}
      </section>
      {!d.permissions.length && (
        <p className="panel gov-section">
          للقراءة فقط: لا تملك صلاحية تعديل هذا السجل أو أن فصله غير نشط.
        </p>
      )}
      {"academicTermId" in r && (
        <p className="muted">
          النطاق:{" "}
          {options.contexts.find(
            (c) =>
              c.academicTermId === r.academicTermId &&
              c.committeeId === r.committeeId,
          )?.label ?? "الفصل واللجنة المرتبطان بالسجل"}
        </p>
      )}
      {"targetType" in r && (
        <section className="panel gov-section">
          <h3>المبادرات والمؤشرات المرتبطة</h3>
          {lists.initiatives
            .filter((i) => i.goalId === r.id)
            .map((i) => (
              <p key={i.id}>
                <Link href={href("initiatives", i.id)}>{i.title}</Link>
              </p>
            ))}
          {lists.kpis
            .filter((k) => k.goalId === r.id)
            .map((k) => (
              <p key={k.id}>
                <Link href={href("kpis", k.id)}>{k.name}</Link>
              </p>
            ))}
          <Link href="/governance?tab=initiatives">افتح المبادرات</Link> ·{" "}
          <Link href="/governance?tab=kpis">افتح المؤشرات</Link>
        </section>
      )}
      {"goal" in r && can("initiative.update") && (
        <section className="panel gov-section">
          <h3>تعديل المبادرة</h3>
          {options.contexts.some(c => c.academicTermId === r.academicTermId && c.committeeId === r.committeeId && c.permissions.includes('initiative.create')) && <GovernanceForm
            label="تحديث الهدف المرتبط"
            onDone={refresh}
            submit={async (f) => {
              await send(`${path}/goal`, { goalId: value(f, "goalId") });
            }}
          >
            <Select label="الهدف المرتبط" name="goalId" defaultValue={r.goalId}>
              {lists.goals
                .filter(
                  (g) =>
                    g.academicTermId === r.academicTermId &&
                    g.committeeId === r.committeeId &&
                    options.contexts.some(
                      (c) =>
                        c.academicTermId === g.academicTermId &&
                        c.committeeId === g.committeeId &&
                        c.permissions.includes("initiative.create"),
                    ),
                )
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </Select>
          </GovernanceForm>}
          <GovernanceForm
            onDone={refresh}
            submit={async (f) => {
              await send(`${path}/edit`, {
                title: value(f, "title"),
                description: value(f, "description"),
                dueAt: when(f, "dueAt") ?? null,
              });
            }}
          >
            <GovernanceField
              label="عنوان المبادرة"
              name="title"
              defaultValue={r.title}
              required
            />
            <Text
              label="وصف المبادرة"
              name="description"
              defaultValue={r.description}
            />
            <GovernanceField
              label="الموعد المستهدف"
              name="dueAt"
              type="date"
              defaultValue={r.dueAt?.slice(0, 10)}
            />
          </GovernanceForm>
          <p>
            المسؤول:{" "}
            {options.people.find((p) => p.id === r.ownerUserId)?.name ??
              "المسؤول المسند"}
          </p>
        </section>
      )}
      {"unit" in r && (
        <section className="panel gov-section">
          <h3>تعريف المؤشر وطريقة حسابه</h3>
          <p>
            القيمة الحالية مأخوذة من أحدث قياس بحسب تاريخ القياس. القياس اليدوي
            موثق بمصدره، ولا يمثل حسابًا آليًا من الأعمال.
          </p>
          <p>
            شرط تحقق المستهدف: القيمة{" "}
            {r.direction === "higher_is_better"
              ? "≥"
              : r.direction === "lower_is_better"
                ? "≤"
                : "="}{" "}
            {r.targetValue} {r.unit}.
          </p>
          {r.goalId && (
            <Link href={href("goals", r.goalId)}>افتح الهدف المرتبط</Link>
          )}
          {can("kpi.update") && (
            <>
              <h3>تعديل المؤشر</h3>
              <GovernanceForm
                onDone={refresh}
                submit={async (f) => {
                  await send(`${path}/edit`, {
                    name: value(f, "name"),
                    description: value(f, "description"),
                    unit: value(f, "unit"),
                    targetValue: Number(value(f, "targetValue")),
                    measurementFrequency: value(f, "frequency"),
                    dueAt: when(f, "dueAt") ?? null,
                  });
                }}
              >
                <GovernanceField
                  label="عنوان المؤشر"
                  name="name"
                  defaultValue={r.name}
                  required
                />
                <Text
                  label="وصف المؤشر"
                  name="description"
                  defaultValue={r.description}
                />
                <GovernanceField
                  label="وحدة القياس"
                  name="unit"
                  defaultValue={r.unit}
                  required
                />
                <GovernanceField
                  label="القيمة المستهدفة"
                  name="targetValue"
                  type="number"
                  step={1}
                  defaultValue={r.targetValue}
                  required
                />
                <Select
                  label="دورية القياس"
                  name="frequency"
                  defaultValue={r.measurementFrequency}
                >
                  <option value="daily">يومية</option>
                  <option value="weekly">أسبوعية</option>
                  <option value="monthly">شهرية</option>
                  <option value="quarterly">ربع سنوية</option>
                  <option value="annual">سنوية</option>
                </Select>
                <GovernanceField
                  label="الموعد المستهدف"
                  name="dueAt"
                  type="date"
                  defaultValue={r.dueAt?.slice(0, 10)}
                />
              </GovernanceForm>
            </>
          )}
        </section>
      )}
      {"targetType" in r && can("goal.update") && (
        <section className="panel gov-section">
          <h3>تحديث الهدف</h3>
          <GovernanceForm
            onDone={refresh}
            submit={async (f) => {
              await send(`${path}/edit`, {
                title: value(f, "title"),
                description: value(f, "description"),
                dueAt: when(f, "dueAt"),
                currentValue:
                  can("goal.measure") && value(f, "currentValue")
                    ? Number(value(f, "currentValue"))
                    : undefined,
              });
            }}
          >
            <GovernanceField
              label="عنوان الهدف"
              name="title"
              defaultValue={r.title}
              required
            />
            <Text
              label="وصف الهدف"
              name="description"
              defaultValue={r.description}
            />
            <GovernanceField
              label="الموعد المستهدف"
              name="dueAt"
              type="date"
              defaultValue={r.dueAt?.slice(0, 10)}
            />
            {can("goal.measure") && (
              <GovernanceField
                label="قيمة التقدم الموثقة"
                name="currentValue"
                type="number"
                step={1}
                defaultValue={r.currentValue ?? ""}
              />
            )}
          </GovernanceForm>
        </section>
      )}
      {"goal" in r && (
        <section className="panel gov-section">
          <h3>العمل المرتبط بالمبادرة</h3>
          <p>
            <Link href={href("goals", r.goal.id)}>{r.goal.title}</Link>
          </p>
          {d.work.map((w) => (
            <p key={w.id}>
              <Link
                href={
                  w.kind === "event" ? `/events/${w.id}` : `/work?item=${w.id}`
                }
              >
                {w.title}
              </Link>
            </p>
          ))}
          {can("initiative.update") && (
            <GovernanceForm
              label="ربط العمل"
              onDone={refresh}
              submit={async (f) => {
                await send(`${path}/link`, { workId: value(f, "workId") });
              }}
            >
              <GovernanceField
                label="معرّف عنصر العمل"
                name="workId"
                required
              />
              <small>يُتحقق من الصلاحية والفصل واللجنة قبل الربط.</small>
            </GovernanceForm>
          )}
        </section>
      )}
      {"unit" in r && (
        <section className="panel gov-section">
          <h3>سجل القياسات</h3>
          <p>
            المستهدف {r.targetValue} {r.unit} · الحالي{" "}
            {r.currentValue ?? "لم يقس بعد"}
          </p>
          {d.measurements.map((m) => (
            <article className="gov-row" key={m.id}>
              <span>
                {m.value} {r.unit}
              </span>
              <span>{formatDate(m.measuredAt)}</span>
              <p>
                {m.note} ·{" "}
                {m.sourceType === "manual" ? "إدخال يدوي" : m.sourceType}
              </p>
              <small>مرجع القياس: {m.id}</small>
              {can("kpi.measure") && lists.evidence.length > 0 && (
                <GovernanceForm
                  label="ربط دليل بالقياس"
                  onDone={refresh}
                  submit={async (f) => {
                    await send(`evidence/${value(f, "evidenceId")}/link`, {
                      measurementId: m.id,
                    });
                  }}
                >
                  <Select
                    label="الدليل المرتبط بالقياس"
                    name="evidenceId"
                    required
                  >
                    <option value="">اختر الدليل</option>
                    {lists.evidence
                      .filter(
                        (e) =>
                          e.sourceEntityType === "kpi" &&
                          e.sourceEntityId === r.id,
                      )
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                  </Select>
                  <small>
                    أضف دليلًا مرتبطًا بهذا المؤشر من خزنة الأدلة أولًا.
                  </small>
                </GovernanceForm>
              )}
              {d.linkedEvidence
                .filter((l) => l.kpiMeasurementId === m.id)
                .map((l) => (
                  <Link
                    key={l.evidenceId}
                    href={href("evidence", l.evidenceId)}
                  >
                    افتح الدليل المرتبط
                  </Link>
                ))}
            </article>
          ))}
          {can("kpi.measure") && r.status === "active" && (
            <GovernanceForm
              label="إضافة قياس"
              onDone={refresh}
              submit={async (f) => {
                await send(`${path}/measure`, {
                  value: Number(value(f, "value")),
                  measuredAt: new Date(
                    `${value(f, "measuredAt")}T00:00:00+03:00`,
                  ).toISOString(),
                  note: value(f, "note"),
                });
              }}
            >
              <GovernanceField
                label="قيمة القياس"
                name="value"
                type="number"
                step={1}
                required
              />
              <GovernanceField
                label="تاريخ القياس"
                name="measuredAt"
                type="date"
                required
              />
              <Text label="ملاحظة المصدر وطريقة القياس" name="note" />
            </GovernanceForm>
          )}
        </section>
      )}
      {"sourceEntityType" in r && (
        <section className="panel gov-section">
          <h3>مصدر الدليل والتحقق</h3>
          <p>
            {evidenceClassificationLabels[r.classification]} · التحقق حالة
            للدليل، وليس اعتماد التقرير.
          </p>
          <p>
            المصدر: {r.sourceEntityType} · {r.sourceEntityId}
          </p>
          {r.url && (
            <p>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                فتح رابط المصدر الخارجي
              </a>
            </p>
          )}
          {r.fileId && (
            <p>
              <a href={`/api/governance/evidence/${r.id}/download`}>
                تنزيل الدليل المحمي
              </a>
            </p>
          )}
          {can("evidence.verify") &&
            r.uploadedBy !== userId &&
            r.verificationStatus === "unreviewed" && (
              <GovernanceForm
                label="تسجيل قرار التحقق"
                onDone={refresh}
                submit={async (f) => {
                  await send(`${path}/verify`, {
                    decision: value(f, "decision"),
                    comment: value(f, "comment"),
                  });
                }}
              >
                <Select label="قرار التحقق" name="decision">
                  <option value="reviewed">تمت المراجعة والتحقق</option>
                  <option value="rejected">مرفوض</option>
                </Select>
                <Text label="ملاحظة التحقق" name="comment" />
              </GovernanceForm>
            )}
          {can("kpi.measure") && (
            <GovernanceForm
              label="ربط بقياس"
              onDone={refresh}
              submit={async (f) => {
                await send(`${path}/link`, {
                  measurementId: value(f, "measurementId"),
                });
              }}
            >
              <GovernanceField
                label="معرّف القياس من سجل المؤشر"
                name="measurementId"
                required
              />
            </GovernanceForm>
          )}
          {can("evidence.create") &&
            r.uploadedBy === userId &&
            r.verificationStatus === "unreviewed" && (
              <>
                <h3>تعديل الدليل</h3>
                <GovernanceForm
                  onDone={refresh}
                  submit={async (f) => {
                    await send(`${path}/edit`, {
                      title: value(f, "title"),
                      description: value(f, "description"),
                      classification: value(f, "classification"),
                    });
                  }}
                >
                  <GovernanceField
                    label="عنوان الدليل"
                    name="title"
                    defaultValue={r.title}
                    required
                  />
                  <Text
                    label="وصف الدليل"
                    name="description"
                    defaultValue={r.description}
                  />
                  <Select
                    label="تصنيف الدليل"
                    name="classification"
                    defaultValue={r.classification}
                  >
                    {Object.entries(evidenceClassificationLabels).map(
                      ([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ),
                    )}
                  </Select>
                </GovernanceForm>
              </>
            )}
        </section>
      )}
      {"sections" in r && (
        <>
          {editableReport && can("report.update") && (
            <section className="panel gov-section">
              <h3>تحرير ملخص التقرير</h3>
              <GovernanceForm
                onDone={refresh}
                submit={async (f) => {
                  await send(`${path}/edit`, {
                    summary: value(f, "summary"),
                    title: value(f, "title"),
                    periodStart: when(f, "periodStart"),
                    periodEnd: when(f, "periodEnd"),
                  });
                }}
              >
                <GovernanceField
                  label="عنوان التقرير"
                  name="title"
                  defaultValue={r.title}
                  required
                />
                <GovernanceField
                  label="بداية الفترة"
                  name="periodStart"
                  type="date"
                  defaultValue={r.periodStart.slice(0, 10)}
                  required
                />
                <GovernanceField
                  label="نهاية الفترة"
                  name="periodEnd"
                  type="date"
                  defaultValue={r.periodEnd.slice(0, 10)}
                  required
                />
                <Text
                  label="ملخص التقرير"
                  name="summary"
                  defaultValue={r.summary}
                  required
                />
              </GovernanceForm>
            </section>
          )}
          {r.sections.map((section) => (
            <section key={section.id} className="panel gov-section">
              <h3>{reportSectionLabels[section.sectionKey]}</h3>
              {editableReport && can("report.update") ? (
                <GovernanceForm
                  onDone={refresh}
                  submit={async (f) => {
                    await send(`${path}/section`, {
                      sectionId: section.id,
                      content: value(f, "content"),
                    });
                  }}
                >
                  <Text
                    label={reportSectionLabels[section.sectionKey]}
                    name="content"
                    defaultValue={section.content}
                    required
                  />
                </GovernanceForm>
              ) : (
                <p className="gov-prose">{section.content}</p>
              )}
            </section>
          ))}
          <section className="panel gov-section">
            <h3>المراجعة والاعتماد</h3>
            <p>المراجعة تسجل توصية. الاعتماد قرار منفصل بصلاحية مستقلة.</p>
            {d.reviewers.map((person) => (
              <p key={person.id}>
                {person.name} —{" "}
                {person.decision === "approved"
                  ? "توصية بالموافقة"
                  : (statusLabels[person.decision] ?? "بانتظار المراجعة")}
                {person.comment && `: ${person.comment}`}
              </p>
            ))}
            {editableReport && can("report.update") && (
              <GovernanceForm
                label="تعيين المراجع"
                onDone={refresh}
                submit={async (f) => {
                  await send(`${path}/reviewers`, {
                    userIds: [value(f, "reviewerId")],
                  });
                }}
              >
                <Select label="المراجع المستقل" name="reviewerId" required>
                  <option value="">اختر المراجع</option>
                  {options.people
                    .filter(
                      (p) =>
                        p.id !== r.createdBy &&
                        p.scopes.some(
                          (s) =>
                            s.academicTermId === r.academicTermId &&
                            s.committeeId === r.committeeId &&
                            s.permissions.includes("report.review") &&
                            s.permissions.includes("report.view"),
                        ),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </GovernanceForm>
            )}
            {editableReport && can("report.submit") && (
              <GovernanceForm
                label="تقديم للمراجعة"
                onDone={refresh}
                submit={async () => {
                  await send(`${path}/submit`, {});
                }}
              >
                <p>أكمل الملخص وجميع الأقسام وعيّن مراجعًا مستقلًا قبل التقديم. ستقفل الحقول وأدلة التقرير عند التقديم.</p>
              </GovernanceForm>
            )}
            {["submitted", "under_review"].includes(r.status) &&
              can("report.review") &&
              d.reviewers.some(
                (p) => p.id === userId && p.decision === "pending",
              ) && (
                <GovernanceForm
                  label="تسجيل توصية المراجعة"
                  onDone={refresh}
                  submit={async (f) => {
                    await send(`${path}/review`, {
                      decision: value(f, "decision"),
                      comment: value(f, "comment"),
                    });
                  }}
                >
                  <Select label="قرار المراجعة" name="decision">
                    <option value="approved">أوصي بالموافقة</option>
                    <option value="changes_requested">طلب تعديل</option>
                    <option value="rejected">رفض</option>
                  </Select>
                  <Text label="ملاحظة المراجعة" name="comment" />
                </GovernanceForm>
              )}
            {r.status === "under_review" &&
              r.createdBy !== userId &&
              can("report.approve") &&
              d.reviewers.length > 0 &&
              d.reviewers.every((p) => p.decision === "approved") && (
                <GovernanceForm
                  label="اعتماد التقرير"
                  onDone={refresh}
                  submit={async () => {
                    await send(`${path}/approve`, {});
                  }}
                >
                  <p>اكتملت توصيات المراجعة.</p>
                </GovernanceForm>
              )}
            {r.status === "approved" && can("report.update") && (
              <GovernanceForm
                label="أرشفة التقرير"
                onDone={refresh}
                submit={async () => {
                  await send(`${path}/archive`, {});
                }}
              >
                <p>يبقى التقرير متاحًا للقراءة ضمن النطاق.</p>
              </GovernanceForm>
            )}
          </section>
        </>
      )}
      {d.evidence.length > 0 && (
        <section className="panel gov-section">
          <h3>الأدلة المرتبطة</h3>
          {d.evidence.map((e) => (
            <p key={e.id}>
              <Link href={href("evidence", e.id)}>{e.title}</Link> —{" "}
              {evidenceVerificationLabels[e.verificationStatus]}
            </p>
          ))}
        </section>
      )}
      <section className="panel gov-section">
        <h3>مسار التوثيق</h3>
        {d.timeline.length ? (
          d.timeline.map((e, n) => (
            <article key={n} className="gov-row">
              <span>
                {e.actor ?? "حساب غير متاح"} · {formatDate(e.createdAt)}
              </span>
              <span>
                {(
                  {
                    created: "إنشاء",
                    updated: "تعديل",
                    measured: "قياس موثق",
                    submitted: "تقديم للمراجعة",
                    reviewed: "توصية مراجعة",
                    approved: "اعتماد",
                    verified: "تحقق من دليل",
                    archived: "أرشفة",
                    linked: "ربط مصدر",
                    "section.updated": "تحديث قسم",
                    "reviewers.assigned": "تعيين مراجعين",
                    "evidence.linked": "ربط دليل",
                  } as Record<string, string>
                )[e.action] ?? e.action}
              </span>
              <details>
                <summary>تفاصيل المصدر والقرار</summary>
                <pre className="gov-provenance">
                  {JSON.stringify(e.metadata, null, 2)}
                </pre>
              </details>
            </article>
          ))
        ) : (
          <p>لا توجد أحداث مسجلة.</p>
        )}
      </section>
    </>
  );
}
