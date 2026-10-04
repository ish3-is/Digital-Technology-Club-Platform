"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  memberStatusLabels,
  memberStatusTransitions,
  applicationDecisionLabels,
  applicationStatusLabels,
  assignmentTypeLabels,
  achievementCategoryLabels,
  achievementVerificationLabels,
  achievementVisibilityLabels,
  handoverKindLabels,
  memberRoleLabels,
  mentorStatusLabels,
  onboardingStepLabels,
  transferStatusLabels,
  volunteerSourceLabels,
  volunteerStatusLabels,
  xpLevels,
} from "@/lib/people/types";
import type * as PeopleQueries from "@/lib/people/queries";
import type * as PeopleMembers from "@/lib/people/members.service";
import type * as PeopleVolunteer from "@/lib/people/volunteer.service";

type Json<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
type Lists = Json<Awaited<ReturnType<typeof PeopleQueries.peopleLists>>>;
type Options = Json<Awaited<ReturnType<typeof PeopleQueries.peopleOptions>>>;
type MemberDetail = Json<
  Awaited<ReturnType<typeof PeopleQueries.memberDetail>>
>;
type InboxItems = Json<Awaited<ReturnType<typeof PeopleQueries.peopleInbox>>>;
type Member = Json<
  Awaited<ReturnType<typeof PeopleMembers.listMembers>>[number]
>;
type Hour = Json<Awaited<ReturnType<typeof PeopleVolunteer.listHours>>[number]>;

const value = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const tags = (f: FormData, key: string) =>
  value(f, key)
    .split(/[،,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
const day = (v: string) => `${v}T12:00:00+03:00`;
const when = (f: FormData, key: string) => {
  const v = value(f, key);
  return v ? new Date(day(v)).toISOString() : undefined;
};
const formatDate = (v?: string | null) =>
  v
    ? new Date(v).toLocaleDateString("ar-SA", {
        dateStyle: "medium",
        timeZone: "Asia/Riyadh",
      })
    : "—";

async function send(path: string, data: unknown, method = "POST") {
  const r = await fetch(`/api/people/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(result.error ?? "تعذر إكمال العملية");
  return result;
}

export function PeopleField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
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
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="gov-field">
      <span>{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        required={required}
        rows={3}
        maxLength={4000}
      />
    </label>
  );
}

function Select({
  label,
  name,
  children,
  required,
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

export function PeopleForm({
  children,
  submit,
  label = "حفظ",
  onDone,
}: {
  children: ReactNode;
  submit: (f: FormData) => Promise<unknown>;
  label?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
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
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "تعذر الحفظ");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="gov-form">
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

const tabs = [
  { key: "overview", label: "نظرة" },
  { key: "members", label: "الأعضاء" },
  { key: "applications", label: "طلبات الانضمام" },
  { key: "onboarding", label: "التأهيل" },
  { key: "mentoring", label: "الإرشاد" },
  { key: "hours", label: "الساعات التطوعية" },
  { key: "achievements", label: "الإنجازات" },
  { key: "badges", label: "الشارات" },
  { key: "transfers", label: "التحويلات" },
  { key: "handovers", label: "التسليم" },
] as const;

export function PeopleCenter({
  lists,
  options,
  detail,
  inbox,
  tab = "overview",
  memberId,
  userId,
  loadError = null,
}: {
  lists: Lists;
  options: Options;
  detail: MemberDetail | null;
  inbox: InboxItems;
  tab?: string;
  memberId?: string;
  userId: string;
  loadError?: string | null;
}) {
  // Boundary normalization: the page always sends a well-formed structure, but a
  // client navigation or a partial failure must never reach `.members` on null.
  const data = normalizeLists(lists);
  const p = options.permissions;
  const noTerm = options.activeTermCount === 0;
  return (
    <div className="governance-center">
      <div className="page-heading">
        <span className="eyebrow">المرحلة الخامسة · الناس والعضوية</span>
        <h1>الناس والمساهمة</h1>
        <p>من الطلب إلى العضوية، ومن المساهمة إلى الأثر الموثّق.</p>
      </div>
      <nav className="gov-tabs" aria-label="مساحات الناس">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/people?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {loadError && (
        <p className="muted" role="status">
          تعذر تحميل بعض بيانات مساحة الناس: {loadError} — بقية المساحة متاحة.
        </p>
      )}
      {noTerm && !loadError && (
        <p className="muted" role="status">
          لا يوجد فصل أكاديمي نشط. تظهر القوائم والأرشيف كما هي، وتُعطّل
          إجراءات الإنشاء التي تحتاج فصلًا قائمًا.
        </p>
      )}
      {detail ? (
        <MemberPanel
          detail={detail}
          options={options}
          inbox={inbox}
          lists={data}
          userId={userId}
        />
      ) : (
        <PeopleTab
          tab={tab}
          lists={data}
          options={options}
          inbox={inbox}
          userId={userId}
        />
      )}
    </div>
  );
}

/** Coerces a possibly-missing People payload into a complete, array-shaped one. */
function normalizeLists(lists: Lists | null | undefined): Lists {
  const source = (lists ?? {}) as Partial<Lists>;
  return {
    members: source.members ?? [],
    applications: source.applications ?? [],
    plans: source.plans ?? [],
    hours: source.hours ?? [],
    achievements: source.achievements ?? [],
    mentorships: source.mentorships ?? [],
    transfers: source.transfers ?? [],
    handovers: source.handovers ?? [],
    badges: source.badges ?? [],
  };
}

function PeopleTab({
  tab,
  lists,
  options,
  inbox,
  userId,
}: {
  tab: string;
  lists: Lists;
  options: Options;
  inbox: InboxItems;
  userId: string;
}) {
  const p = options.permissions;
  if (tab === "members")
    return <MembersTab lists={lists} options={options} />;
  if (tab === "applications")
    return <ApplicationsTab lists={lists} options={options} />;
  if (tab === "onboarding")
    return <OnboardingTab lists={lists} options={options} />;
  if (tab === "mentoring")
    return <MentoringTab lists={lists} options={options} />;
  if (tab === "hours")
    return <HoursTab lists={lists} options={options} userId={userId} />;
  if (tab === "achievements")
    return <AchievementsTab lists={lists} options={options} />;
  if (tab === "badges")
    return <BadgesTab lists={lists} options={options} />;
  if (tab === "transfers")
    return <TransfersTab lists={lists} options={options} userId={userId} />;
  if (tab === "handovers")
    return <HandoversTab lists={lists} options={options} />;
  return (
    <>
      <section className="panel gov-section">
        <h2>مركز قيادة النادي</h2>
        <p>
          الأرقام من سجلات موجودة فعليًا. لا يوجد ترتيب للأعضاء ولا نقاط بلا مصدر.
        </p>
        <div className="gov-card-grid">
          {[
            { label: "أعضاء مرئون", value: lists.members.length },
            { label: "طلبات قيد المراجعة", value: lists.applications.length },
            { label: "مسارات تأهيل جارية", value: lists.plans.length },
            { label: "ساعات بانتظار الاعتماد", value: lists.hours.filter((h) => h.status === "pending").length },
          ].map((s) => (
            <article className="panel gov-card" key={s.label}>
              <h3>{s.label}</h3>
              <strong className="gov-value">{s.value}</strong>
            </article>
          ))}
        </div>
      </section>
      <section className="panel gov-section">
        <h2>ماذا يحتاج إجراءك</h2>
        {inbox.length ? (
          inbox.map((a) => (
            <article className="gov-row" key={a.id}>
              <div>
                <Link href={a.href}>{a.title}</Link>
                <p>{a.reason}</p>
              </div>
              <span className="subtle-chip">{a.action}</span>
            </article>
          ))
        ) : (
          <p>لا توجد عناصر تنتظر إجراءك في مساحة الناس.</p>
        )}
      </section>
    </>
  );
}

function MembersTab({
  lists,
  options,
}: {
  lists: Lists;
  options: Options;
}) {
  const [search, setSearch] = useState("");
  const rows = lists.members.filter((m) =>
    [m.name, m.major ?? "", m.studentId ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="section-title">
        <h2>الأعضاء</h2>
        <PeopleField
          label="بحث في الأعضاء"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ApplyApplication options={options} />
      {rows.length ? (
        <div className="gov-card-grid">
          {rows.map((m: Member) => (
            <Link className="panel gov-card" key={m.userId} href={`/people?tab=members&member=${m.userId}`}>
              <span className="eyebrow">{memberStatusLabels[m.status]}</span>
              <h3>{m.name}</h3>
              <p>{m.major || "التخصص غير مسجل"}</p>
              <span className="subtle-chip">
                {m.committees.map((c) => c.name).join("، ") || "بلا لجنة"}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h3>لا يوجد أعضاء مرئون</h3>
          <p>تظهر هنا الأعضاء الذين في نطاقك فقط.</p>
        </div>
      )}
    </>
  );
}

function ApplyApplication({ options }: { options: Options }) {
  const [open, setOpen] = useState(false);
  const p = options.permissions;
  if (!p.applicationView) return null;
  // An application needs an open term to attach to; say so rather than fail.
  if (options.activeTermCount === 0)
    return (
      <p className="muted">
        إنشاء الطلب متوقف: لا يوجد فصل أكاديمي نشط. اطلب من مسؤول التنظيم تفعيل
        الفصل.
      </p>
    );
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="gov-section">
        <Dialog.Trigger asChild>
          <button className="button primary">طلب انضمام جديد</button>
        </Dialog.Trigger>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog create-dialog" dir="rtl">
          <Dialog.Close className="dialog-close icon-button" aria-label="إغلاق">
            ×
          </Dialog.Close>
          <Dialog.Title>طلب انضمام</Dialog.Title>
          <Dialog.Description>
            سجّل بيانات المتقدم. تبقى الطلبات في سجلها ولا تُحذف.
          </Dialog.Description>
          <PeopleForm
            label="تسجيل الطلب"
            onDone={() => setOpen(false)}
            submit={(f) =>
              send("applications", {
                fullName: value(f, "fullName"),
                studentId: value(f, "studentId"),
                major: value(f, "major"),
                email: value(f, "email"),
                phone: value(f, "phone"),
                skills: tags(f, "skills"),
                interests: tags(f, "interests"),
                previousExperience: value(f, "previousExperience"),
                preferredCommitteeId: value(f, "preferredCommitteeId") || null,
                alternateCommitteeId: value(f, "alternateCommitteeId") || null,
                motivation: value(f, "motivation"),
                developmentGoals: tags(f, "developmentGoals"),
                availability: value(f, "availability"),
              })
            }
          >
            <PeopleField label="الاسم" name="fullName" required />
            <PeopleField label="الرقم الجامعي" name="studentId" required />
            <PeopleField label="التخصص" name="major" />
            <PeopleField label="البريد الإلكتروني" name="email" type="email" required />
            <PeopleField label="رقم الجوال" name="phone" />
            <PeopleField label="المهارات (مفصولة بفاصلة)" name="skills" />
            <PeopleField label="الاهتمامات (مفصولة بفاصلة)" name="interests" />
            <Text label="الخبرات السابقة" name="previousExperience" />
            <Select label="اللجنة المفضلة" name="preferredCommitteeId">
              <option value="">بدون</option>
              {options.committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select label="اللجنة البديلة" name="alternateCommitteeId">
              <option value="">بدون</option>
              {options.committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Text label="سبب الانضمام" name="motivation" />
            <PeopleField label="مهارات تريد تطويرها" name="developmentGoals" />
            <PeopleField label="الوقت المتاح" name="availability" />
          </PeopleForm>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ApplicationsTab({
  lists,
  options,
}: {
  lists: Lists;
  options: Options;
}) {
  const p = options.permissions;
  if (!p.applicationView)
    return (
      <div className="empty">
        <h3>للقراءة فقط</h3>
        <p>لا تملك صلاحية قراءة طلبات الانضمام ضمن نطاقك.</p>
      </div>
    );
  return (
    <>
      <h2>طلبات الانضمام</h2>
      {lists.applications.length ? (
        <div className="gov-card-grid">
          {lists.applications.map((a) => (
            <article className="panel gov-card" key={a.id}>
              <span className="eyebrow">{applicationStatusLabels[a.status]}</span>
              <h3>{a.fullName}</h3>
              <p>{a.major || "التخصص غير مسجل"}</p>
              <div className="gov-row">
                <ApplicationActions
                  id={a.id}
                  status={a.status}
                  options={options}
                  hasReviewer={Boolean(a.assignedReviewerId)}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h3>لا توجد طلبات</h3>
          <p>الطلبات المسجلة في الفصل الحالي تظهر هنا.</p>
        </div>
      )}
    </>
  );
}

function ApplicationActions({
  id,
  status,
  options,
  hasReviewer,
}: {
  id: string;
  status: keyof typeof applicationStatusLabels;
  options: Options;
  hasReviewer: boolean;
}) {
  const [open, setOpen] = useState(false);
  const p = options.permissions;
  const people = options.people;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="button">مراجعة الطلب</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog create-dialog" dir="rtl">
          <Dialog.Close className="dialog-close icon-button" aria-label="إغلاق">
            ×
          </Dialog.Close>
          <Dialog.Title>قرار الطلب</Dialog.Title>
          <Dialog.Description>
            كل قرار يُسجّل مع المراجع والوقت والسبب، ولا يُحذف سابقه.
          </Dialog.Description>
          {p.applicationReview && (
            <PeopleForm
              label="إسناد المراجع"
              submit={(f) =>
                send(`applications/${id}/reviewer`, {
                  reviewerId: value(f, "reviewerId"),
                })
              }
            >
              <Select label="المراجع" name="reviewerId" required defaultValue="">
                <option value="">اختر المراجع</option>
                {people.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
              {hasReviewer && <p className="muted">هذا الطلب مسند لمراجع حاليًا.</p>}
            </PeopleForm>
          )}
          {p.applicationReview && (
            <PeopleForm label="إضافة ملاحظة" submit={(f) => send(`applications/${id}/note`, { reason: value(f, "reason") })}>
              <Text label="ملاحظة المراجعة" name="reason" required />
            </PeopleForm>
          )}
          {p.applicationDecide &&
            (["shortlisted", "accepted", "rejected", "waitlisted"] as const).map(
              (decision) => (
                <PeopleForm
                  key={decision}
                  label={applicationDecisionLabels[decision]}
                  submit={(f) =>
                    send(`applications/${id}/decide`, {
                      decision,
                      reason: value(f, "reason"),
                    })
                  }
                >
                  <Text label="سبب القرار" name="reason" required />
                </PeopleForm>
              ),
            )}
          {p.applicationDecide && status === "accepted" && (
            <PeopleForm
              label="تحويل إلى عضو"
              submit={(f) =>
                send(`applications/${id}/convert`, {
                  userId: value(f, "userId"),
                  academicTermId: options.academicTermId!,
                  committeeId: value(f, "committeeId") || null,
                  clubRoleReason: value(f, "clubRoleReason") || "قبول طلب انضمام",
                })
              }
            >
              <Select label="الحساب المرتبط" name="userId" required>
                <option value="">اختر الحساب</option>
                {people.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
              <Select label="لجنة التوزيع" name="committeeId">
                <option value="">بدون لجنة</option>
                {options.committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <PeopleField label="سبب الدور" name="clubRoleReason" />
            </PeopleForm>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function OnboardingTab({
  lists,
  options,
}: {
  lists: Lists;
  options: Options;
}) {
  const p = options.permissions;
  if (!p.onboardingView)
    return (
      <div className="empty">
        <h3>للقراءة فقط</h3>
        <p>لا تملك صلاحية قراءة مسارات التأهيل.</p>
      </div>
    );
  return (
    <>
      <h2>مسارات التأهيل</h2>
      {p.onboardingManage && (
        <div className="gov-section">
          <PeopleForm
            label="بدء مسار تأهيل"
            submit={(f) =>
              send("onboarding/start", {
                userId: value(f, "userId"),
                academicTermId: options.academicTermId!,
              })
            }
          >
            <Select label="العضو" name="userId" required>
              <option value="">اختر العضو</option>
              {options.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </PeopleForm>
        </div>
      )}
      {lists.plans.length ? (
        <div className="gov-card-grid">
          {lists.plans.map((x) => (
            <article className="panel gov-card" key={x.id}>
              <span className="eyebrow">{x.completed} من {x.total}</span>
              <h3>{x.name}</h3>
              <strong className="gov-value">{x.percent}٪</strong>
              <p>لا تُغلق مرحلة دون تنفيذ مسجل.</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h3>لا توجد مسارات تأهيل</h3>
          <p>ابدأ مسارًا لعضو بعد قبول طلبه.</p>
        </div>
      )}
    </>
  );
}

function MentoringTab({
  lists,
  options,
}: {
  lists: Lists;
  options: Options;
}) {
  const p = options.permissions;
  if (!p.mentorView)
    return (
      <div className="empty">
        <h3>للقراءة فقط</h3>
        <p>لا تملك صلاحية قراءة الإرشاد.</p>
      </div>
    );
  return (
    <>
      <h2>الإرشاد</h2>
      {p.mentorAssign && (
        <div className="gov-section">
          <PeopleForm
            label="تعيين مرشد"
            submit={(f) =>
              send("mentoring/assign", {
                mentorId: value(f, "mentorId"),
                menteeId: value(f, "menteeId"),
                academicTermId: options.academicTermId!,
                followUpAt: when(f, "followUpAt"),
                notes: value(f, "notes"),
              })
            }
          >
            <Select label="المرشد" name="mentorId" required>
              <option value="">اختر المرشد</option>
              {options.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Select label="العضو" name="menteeId" required>
              <option value="">اختر العضو</option>
              {options.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <PeopleField label="موعد المتابعة" name="followUpAt" type="date" />
            <Text label="ملاحظات" name="notes" />
          </PeopleForm>
        </div>
      )}
      {lists.mentorships.length ? (
        lists.mentorships.map((m) => (
          <article className="panel gov-card" key={m.id}>
            <span className="eyebrow">{mentorStatusLabels[m.status]}</span>
            <h3>متابعة إرشاد</h3>
            <p>موعد المتابعة: {formatDate(m.followUpAt)}</p>
            {p.mentorUpdate && (
              <div className="gov-row">
                <PeopleForm
                  label="تحديث المتابعة"
                  submit={(f) =>
                    send(`mentoring/${m.id}/update`, {
                      status: value(f, "status"),
                      followUpAt: when(f, "followUpAt"),
                      notes: value(f, "notes"),
                    })
                  }
                >
                  <Select label="الحالة" name="status" defaultValue={m.status}>
                    <option value="active">جارٍ</option>
                    <option value="completed">مكتمل</option>
                    <option value="ended">منتهي</option>
                  </Select>
                  <PeopleField label="موعد المتابعة" name="followUpAt" type="date" />
                  <Text label="ملاحظات" name="notes" defaultValue={m.notes} />
                </PeopleForm>
              </div>
            )}
          </article>
        ))
      ) : (
        <div className="empty">
          <h3>لا توجد إرشادات مسجلة</h3>
          <p>أسند مرشدًا لعضو جديد لمتابعة أول ثلاثين يومًا.</p>
        </div>
      )}
    </>
  );
}

function HoursTab({
  lists,
  options,
  userId,
}: {
  lists: Lists;
  options: Options;
  userId: string;
}) {
  const p = options.permissions;
  if (!p.hoursView)
    return (
      <div className="empty">
        <h3>للقراءة فقط</h3>
        <p>لا تملك صلاحية قراءة الساعات التطوعية.</p>
      </div>
    );
  return (
    <>
      <h2>الساعات التطوعية</h2>
      {p.hoursSubmit && (
        <div className="gov-section">
          <PeopleForm
            label="تسجيل ساعات"
            submit={(f) =>
              send("hours", {
                memberId: value(f, "memberId") || userId,
                sourceType: value(f, "sourceType"),
                activityTitle: value(f, "activityTitle"),
                date: new Date(day(value(f, "date"))).toISOString(),
                hours: Number(value(f, "hours")),
                notes: value(f, "notes"),
              })
            }
          >
            <Select label="العضو" name="memberId" defaultValue={userId}>
              {options.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Select label="مصدر الساعات" name="sourceType" required defaultValue="event">
              {Object.entries(volunteerSourceLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <PeopleField label="عنوان النشاط" name="activityTitle" required />
            <PeopleField label="التاريخ" name="date" type="date" required />
            <PeopleField label="عدد الساعات" name="hours" type="number" min={1} max={24} required />
            <Text label="ملاحظات" name="notes" />
          </PeopleForm>
        </div>
      )}
      {lists.hours.length ? (
        lists.hours.map((h: Hour) => (
          <article className="panel gov-card" key={h.id}>
            <span className="eyebrow">{volunteerStatusLabels[h.status]}</span>
            <h3>{h.activityTitle}</h3>
            <p>
              {h.name} · {h.hours} ساعة · {formatDate(h.date)}
            </p>
            {p.hoursApprove && h.status === "pending" && (
              <div className="gov-row">
                {(["approved", "rejected"] as const).map((decision) => (
                  <PeopleForm
                    key={decision}
                    label={decision === "approved" ? "اعتماد الساعات" : "رفض الساعات"}
                    submit={(f) =>
                      send(`hours/${h.id}/decide`, {
                        decision,
                        reason: value(f, "reason"),
                      })
                    }
                  >
                    <Text label="ملاحظة القرار" name="reason" required />
                  </PeopleForm>
                ))}
              </div>
            )}
          </article>
        ))
      ) : (
        <div className="empty">
          <h3>لا توجد ساعات مسجلة</h3>
          <p>الساعات تعتمد من شخص مستقل قبل أن تُحتسب في Passport.</p>
        </div>
      )}
    </>
  );
}

function AchievementsTab({
  lists,
  options,
}: {
  lists: Lists;
  options: Options;
}) {
  const p = options.permissions;
  if (!p.achievementView)
    return (
      <div className="empty">
        <h3>للقراءة فقط</h3>
        <p>لا تملك صلاحية قراءة الإنجازات.</p>
      </div>
    );
  return (
    <>
      <h2>الإنجازات</h2>
      {p.achievementCreate && (
        <div className="gov-section">
          <PeopleForm
            label="تسجيل إنجاز"
            submit={(f) =>
              send("achievements", {
                memberId: value(f, "memberId"),
                title: value(f, "title"),
                description: value(f, "description"),
                category: value(f, "category"),
                achievedAt: new Date(day(value(f, "achievedAt"))).toISOString(),
                visibility: value(f, "visibility"),
              })
            }
          >
            <Select label="العضو" name="memberId" required>
              <option value="">اختر العضو</option>
              {options.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <PeopleField label="عنوان الإنجاز" name="title" required />
            <Text label="الوصف" name="description" />
            <Select label="الفئة" name="category" required defaultValue="project">
              {Object.entries(achievementCategoryLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <PeopleField label="تاريخ الإنجاز" name="achievedAt" type="date" required />
            <Select label="الظهور" name="visibility" defaultValue="members">
              {Object.entries(achievementVisibilityLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </PeopleForm>
        </div>
      )}
      {lists.achievements.length ? (
        lists.achievements.map((a) => (
          <article className="panel gov-card" key={a.id}>
            <span className="eyebrow">
              {achievementCategoryLabels[a.category]} ·{" "}
              {achievementVerificationLabels[a.verificationStatus]}
            </span>
            <h3>{a.title}</h3>
            <p>{a.description}</p>
            {p.achievementVerify && a.verificationStatus === "unreviewed" && (
              <div className="gov-row">
                {(["verified", "rejected"] as const).map((decision) => (
                  <PeopleForm
                    key={decision}
                    label={decision === "verified" ? "توثيق الإنجاز" : "رفض التوثيق"}
                    submit={(f) =>
                      send(`achievements/${a.id}/verify`, {
                        decision,
                        reason: value(f, "reason"),
                      })
                    }
                  >
                    <Text label="سبب القرار" name="reason" required />
                  </PeopleForm>
                ))}
              </div>
            )}
          </article>
        ))
      ) : (
        <div className="empty">
          <h3>لا توجد إنجازات</h3>
          <p>الإنجاز يحتاج توثيقًا مستقلًا قبل اعتماده.</p>
        </div>
      )}
    </>
  );
}

function BadgesTab({
  lists,
  options,
}: {
  lists: Lists;
  options: Options;
}) {
  const p = options.permissions;
  if (!p.badgeView)
    return (
      <div className="empty">
        <h3>للقراءة فقط</h3>
        <p>لا تملك صلاحية قراءة الشارات.</p>
      </div>
    );
  return (
    <>
      <h2>الشارات</h2>
      <p className="muted">تُمنح الشارات عند استيفاء شرطها المسجل فقط.</p>
      {p.badgeAward && (
        <div className="gov-section">
          <PeopleForm
            label="منح شارة"
            submit={(f) =>
              send("badges/award", {
                memberId: value(f, "memberId"),
                badgeKey: value(f, "badgeKey"),
                reason: value(f, "reason"),
                academicTermId: options.academicTermId!,
              })
            }
          >
            <Select label="العضو" name="memberId" required>
              <option value="">اختر العضو</option>
              {options.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Select label="الشارة" name="badgeKey" required>
              <option value="">اختر الشارة</option>
              {lists.badges.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.name}
                </option>
              ))}
            </Select>
            <PeopleField label="سبب المنح" name="reason" required />
          </PeopleForm>
        </div>
      )}
      <div className="gov-card-grid">
        {lists.badges.map((b) => (
          <article className="panel gov-card" key={b.key}>
            <span className="eyebrow">{b.name}</span>
            <h3>{b.description}</h3>
            <p>
              الشرط: {b.rule.threshold} {b.rule.unit}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}

function TransfersTab({
  lists,
  options,
  userId,
}: {
  lists: Lists;
  options: Options;
  userId: string;
}) {
  const p = options.permissions;
  if (!p.transferView)
    return (
      <div className="empty">
        <h3>للقراءة فقط</h3>
        <p>لا تملك صلاحية قراءة طلبات النقل.</p>
      </div>
    );
  return (
    <>
      <h2>التحويلات بين اللجان</h2>
      {p.transferRequest && (
        <div className="gov-section">
          <PeopleForm
            label="طلب نقل"
            submit={(f) =>
              send("transfers", {
                userId: value(f, "userId") || userId,
                toCommitteeId: value(f, "toCommitteeId"),
                reason: value(f, "reason"),
                notes: value(f, "notes"),
              })
            }
          >
            <Select label="العضو" name="userId" defaultValue={userId}>
              {options.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Select label="اللجنة الهدف" name="toCommitteeId" required>
              <option value="">اختر اللجنة</option>
              {options.committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Text label="سبب النقل" name="reason" required />
            <Text label="ملاحظات" name="notes" />
          </PeopleForm>
        </div>
      )}
      {lists.transfers.length ? (
        lists.transfers.map((t) => (
          <article className="panel gov-card" key={t.id}>
            <span className="eyebrow">{transferStatusLabels[t.status]}</span>
            <h3>طلب نقل</h3>
            <p>{t.reason}</p>
            {p.transferApprove && t.status === "requested" && (
              <div className="gov-row">
                {(["approved", "rejected"] as const).map((decision) => (
                  <PeopleForm
                    key={decision}
                    label={decision === "approved" ? "اعتماد النقل" : "رفض النقل"}
                    submit={(f) =>
                      send(`transfers/${t.id}/decide`, {
                        decision,
                        notes: value(f, "notes"),
                      })
                    }
                  >
                    <Text label="ملاحظة القرار" name="notes" required />
                  </PeopleForm>
                ))}
              </div>
            )}
          </article>
        ))
      ) : (
        <div className="empty">
          <h3>لا توجد طلبات نقل</h3>
          <p>النقل يوثّق التاريخ ولا يمحو اللجنة السابقة.</p>
        </div>
      )}
    </>
  );
}

function HandoversTab({
  lists,
  options,
}: {
  lists: Lists;
  options: Options;
}) {
  const p = options.permissions;
  if (!p.handoverView)
    return (
      <div className="empty">
        <h3>للقراءة فقط</h3>
        <p>لا تملك صلاحية قراءة عمليات التسليم.</p>
      </div>
    );
  return (
    <>
      <h2>عمليات التسليم</h2>
      {p.handoverManage && (
        <div className="gov-section">
          <PeopleForm
            label="فتح عملية تسليم"
            submit={(f) =>
              send("handovers", {
                userId: value(f, "userId"),
                kind: value(f, "kind"),
                academicTermId: options.academicTermId!,
                successorId: value(f, "successorId") || null,
                notes: value(f, "notes"),
              })
            }
          >
            <Select label="العضو" name="userId" required>
              <option value="">اختر العضو</option>
              {options.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Select label="نوع التسليم" name="kind" required defaultValue="exit">
              {Object.entries(handoverKindLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select label="الوارث" name="successorId">
              <option value="">بدون</option>
              {options.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Text label="ملاحظات" name="notes" />
          </PeopleForm>
        </div>
      )}
      {lists.handovers.length ? (
        lists.handovers.map((h) => (
          <article className="panel gov-card" key={h.id}>
            <span className="eyebrow">
              {handoverKindLabels[h.kind]} · {h.status === "completed" ? "مكتمل" : "معلّق"}
            </span>
            <h3>تسليم</h3>
            <p>{h.notes}</p>
            {p.handoverManage && h.status === "pending" && (
              <div className="gov-row">
                <PeopleForm
                  label="إتمام التسليم"
                  submit={(f) =>
                    send(`handovers/${h.id}/update`, {
                      responsibilities: value(f, "responsibilities"),
                      complete: true,
                    })
                  }
                >
                  <Text label="المسؤوليات المسلّمة" name="responsibilities" required />
                </PeopleForm>
              </div>
            )}
          </article>
        ))
      ) : (
        <div className="empty">
          <h3>لا توجد عمليات تسليم</h3>
          <p>يُفتح التسليم عند تغيير دور أو نقل أو خروج.</p>
        </div>
      )}
    </>
  );
}

function MemberPanel({
  detail,
  options,
  lists,
}: {
  detail: MemberDetail;
  options: Options;
  inbox: InboxItems;
  lists: Lists;
  userId: string;
}) {
  const p = options.permissions;
  const view = detail.view;
  const canManage = p.memberUpdate && (view.management || p.memberUpdate);
  return (
    <>
      <Link className="back-link" href="/people?tab=members">
        رجوع إلى الأعضاء
      </Link>
      <section className="panel gov-section">
        <h2>{detail.account.name}</h2>
        <p>{view.profile.major || "التخصص غير مسجل"}</p>
        <span className="subtle-chip">{memberStatusLabels[detail.row.status]}</span>
        {view.profile.studentId && (
          <p className="muted">الرقم الجامعي: {view.profile.studentId}</p>
        )}
        {view.private ? (
          view.profile.phone && <p className="muted">الجوال: {view.profile.phone}</p>
        ) : (
          <p className="muted">بيانات التواصل محجوبة عن هذا العرض.</p>
        )}
      </section>

      {canManage && (
        <section className="panel gov-section">
          <h2>تعديل الحالة</h2>
          <PeopleForm
            label="حفظ الحالة"
            submit={(f) =>
              send(`member/${detail.row.userId}/status`, {
                status: value(f, "status"),
                reason: value(f, "reason"),
              })
            }
          >
            <Select
              label="الحالة الجديدة"
              name="status"
              required
              defaultValue={detail.row.status}
            >
              {memberStatusTransitions[detail.row.status].map((s) => (
                <option key={s} value={s}>
                  {memberStatusLabels[s]}
                </option>
              ))}
            </Select>
            <Text label="سبب التغيير" name="reason" required />
          </PeopleForm>
        </section>
      )}

      {p.memberUpdate && (
        <section className="panel gov-section">
          <h2>تغيير الدور</h2>
          <PeopleForm
            label="تعيين الدور"
            submit={(f) =>
              send(`member/${detail.row.userId}/role`, {
                userId: detail.row.userId,
                clubRole: value(f, "clubRole"),
                committeeId: value(f, "committeeId") || null,
                academicTermId: options.academicTermId!,
                reason: value(f, "reason"),
              })
            }
          >
            <Select label="الدور" name="clubRole" required defaultValue="member">
              {Object.entries(memberRoleLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select label="اللجنة" name="committeeId">
              <option value="">النادي</option>
              {options.committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <PeopleField label="سبب التغيير" name="reason" />
          </PeopleForm>
        </section>
      )}

      {p.placementManage && (
        <section className="panel gov-section">
          <h2>توزيع اللجنة</h2>
          <PeopleForm
            label="تسجيل التوزيع"
            submit={(f) =>
              send("placement/assign", {
                userId: detail.row.userId,
                committeeId: value(f, "committeeId"),
                academicTermId: options.academicTermId!,
                assignmentType: value(f, "assignmentType"),
                reason: value(f, "reason"),
              })
            }
          >
            <Select label="اللجنة" name="committeeId" required>
              <option value="">اختر اللجنة</option>
              {options.committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select label="نوع التوزيع" name="assignmentType" defaultValue="permanent">
              {Object.entries(assignmentTypeLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <PeopleField label="السبب" name="reason" />
          </PeopleForm>
        </section>
      )}

      <section className="panel gov-section">
        <h2>الهوية والمسار</h2>
        <p>
          الخبرة: {detail.totals.xp} · الأثر: {detail.totals.impact} · المستوى:{" "}
          {detail.totals.level.name}
        </p>
        <p className="muted">{detail.totals.level.explanation}</p>
        <details>
          <summary>سلم المستويات</summary>
          {xpLevels.map((l) => (
            <p key={l.key}>
              {l.name} من {l.min}
            </p>
          ))}
        </details>
      </section>

      <section className="panel gov-section">
        <h2>الشارات</h2>
        {detail.badges.length ? (
          detail.badges.map((b) => (
            <p key={b.id}>
              {b.revokedAt ? "مسحوبة" : "ممنوحة"}: {b.name} — {b.reason}
            </p>
          ))
        ) : (
          <p>لا توجد شارات ممنوحة.</p>
        )}
      </section>

      {detail.sections.onboarding && detail.plan && (
        <section className="panel gov-section">
          <h2>التأهيل</h2>
          <p>
            {detail.plan.progress.completed} من {detail.plan.progress.total} مرحلة (
            {detail.plan.progress.percent}٪)
          </p>
          <p className="muted">{detail.plan.progress.explanation}</p>
          {detail.plan.challenge && (
            <>
              <h3>{detail.plan.challenge.name}</h3>
              {detail.plan.challenge.steps.map((s) => (
                <p key={s.key}>
                  {s.completed ? "✔" : "○"} {s.title}
                </p>
              ))}
            </>
          )}
          {p.onboardingManage &&
            detail.plan.steps
              .filter((s) => s.status === "pending")
              .map((s) => (
                <PeopleForm
                  key={s.id}
                  label={`إتمام: ${s.title}`}
                  submit={(f) =>
                    send(`steps/${s.id}/complete`, { note: value(f, "note") })
                  }
                >
                  <PeopleField label="سبب الإتمام" name="note" required />
                </PeopleForm>
              ))}
        </section>
      )}

      {detail.sections.mentoring && detail.mentorships.length > 0 && (
        <section className="panel gov-section">
          <h2>الإرشاد</h2>
          {detail.mentorships.map((m) => (
            <p key={m.id}>
              {mentorStatusLabels[m.status]} · متابعة {formatDate(m.followUpAt)}
            </p>
          ))}
        </section>
      )}

      <section className="panel gov-section">
        <h2>الساعات التطوعية</h2>
        {detail.hours.length ? (
          detail.hours.map((h) => (
            <p key={h.id}>
              {h.activityTitle} — {h.hours} ساعة ·{" "}
              {volunteerStatusLabels[h.status as keyof typeof volunteerStatusLabels]}
            </p>
          ))
        ) : (
          <p>لا توجد ساعات مسجلة.</p>
        )}
      </section>

      <section className="panel gov-section">
        <h2>الإنجازات</h2>
        {detail.achievements.length ? (
          detail.achievements.map((a) => (
            <p key={a.id}>
              {a.title} — {achievementVerificationLabels[a.verificationStatus]}
            </p>
          ))
        ) : (
          <p>لا توجد إنجازات موثقة.</p>
        )}
      </section>

      {detail.sections.history && (
        <>
          <section className="panel gov-section">
            <h2>سجل الدور</h2>
            {detail.roles.length ? (
              detail.roles.map((r) => (
                <p key={r.id}>
                  {memberRoleLabels[r.clubRole] ?? r.clubRole} —{" "}
                  {formatDate(r.startAt)} {r.reason && `· ${r.reason}`}
                </p>
              ))
            ) : (
              <p>لا يوجد سجل أدوار.</p>
            )}
          </section>
          <section className="panel gov-section">
            <h2>سجل اللجان</h2>
            {detail.placements.length ? (
              detail.placements.map((c) => (
                <p key={c.id}>
                  {c.committeeName} · {assignmentTypeLabels[c.assignmentType]} ·{" "}
                  {formatDate(c.startAt)}
                  {c.endAt ? ` → ${formatDate(c.endAt)}` : ""}
                </p>
              ))
            ) : (
              <p>لا يوجد سجل لجان.</p>
            )}
          </section>
          <section className="panel gov-section">
            <h2>سجل الحالة</h2>
            {detail.statusHistory.length ? (
              detail.statusHistory.map((h) => (
                <p key={h.id}>
                  {h.previousStatus ? memberStatusLabels[h.previousStatus as keyof typeof memberStatusLabels] : "—"} ←{" "}
                  {memberStatusLabels[h.newStatus as keyof typeof memberStatusLabels]} · {h.reason}
                </p>
              ))
            ) : (
              <p>لا يوجد سجل تغيير حالة.</p>
            )}
          </section>
        </>
      )}

      <section className="panel gov-section">
        <h2>الخط الزمني</h2>
        {detail.timeline.length ? (
          detail.timeline.map((t) => (
            <p key={t.id}>
              {formatDate(t.createdAt)} — {t.action}
            </p>
          ))
        ) : (
          <p>لا توجد أحداث مسجلة بعد.</p>
        )}
      </section>
    </>
  );
}

export { onboardingStepLabels };
