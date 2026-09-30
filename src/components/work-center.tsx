"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Plus,
  X,
  ArrowLeft,
  List,
  Columns3,
  MessageSquare,
  Paperclip,
  CheckCircle2,
  Clock3,
  Search,
  Users,
  Link2,
  CalendarDays,
} from "lucide-react";
import {
  stateLabels,
  priorityLabels,
  kindLabels,
  riyadhDay,
  type Kind,
} from "@/lib/work/model";
import type { listWork, detail, workOptions, inbox } from "@/lib/work/queries";
type Json<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
type Item = Json<Awaited<ReturnType<typeof listWork>>>[number];
type Detail = Json<Awaited<ReturnType<typeof detail>>>;
type Options = Json<Awaited<ReturnType<typeof workOptions>>>;
type InboxItem = Json<Awaited<ReturnType<typeof inbox>>>[number];
export type WorkMode =
  "mine" | "tasks" | "requests" | "meetings" | "decisions" | "inbox";
const tabs = [
  ["mine", "عملي", "/work"],
  ["tasks", "كل المهام", "/work/tasks"],
  ["requests", "الطلبات", "/work/requests"],
  ["meetings", "الاجتماعات", "/work/meetings"],
  ["decisions", "سجل القرارات", "/work/decisions"],
] as const;
const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("ar-SA", {
        timeZone: "Asia/Riyadh",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "بلا موعد";
async function api(path: string, body?: unknown) {
  const response = await fetch(
    `/api/work${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "تعذر إكمال العملية");
  return data;
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <CheckCircle2 size={28} />
      </span>
      <h3>{text}</h3>
      <p>ستظهر هنا الأعمال الفعلية المتاحة لك بحسب دورك.</p>
    </div>
  );
}
export function WorkCenter({
  initialItems,
  initialInbox,
  options,
  userId,
  mode = "mine",
  committeeId,
  openId,
  createKind,
  eventId,
}: {
  initialItems: Item[];
  initialInbox: InboxItem[];
  options: Options;
  userId: string;
  mode?: WorkMode;
  committeeId?: string;
  openId?: string;
  createKind?: Kind;
  eventId?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [inboxItems, setInbox] = useState(initialInbox);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [create, setCreate] = useState<Kind | null>(null);
  const [source, setSource] = useState<Detail | null>(null);
  const [filter, setFilter] = useState({
    q: "",
    committee: committeeId || "",
    status: "",
    priority: "",
  });
  const open = useCallback(async (id: string) => {
    if (initialItems.some((w) => w.id === id && w.kind === "event")) {
      window.location.assign(`/events/${id}`);
      return;
    }
    setError("");
    setLoading(true);
    try {
      setSelected(await api(`/${id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setItems(initialItems);
    setInbox(initialInbox);
  }, [initialItems, initialInbox]);
  useEffect(() => {
    if (openId) void open(openId);
  }, [openId, open]);
  useEffect(() => {
    if (
      createKind &&
      options.contexts.some((c) => c.create.includes(createKind))
    )
      setCreate(createKind);
  }, [createKind, options]);
  async function refresh(id?: string) {
    const [all, actions] = await Promise.all([api(""), api("/inbox")]);
    setItems(all);
    setInbox(actions);
    if (id) setSelected(await api(`/${id}`));
  }
  async function perform(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
      await refresh(selected?.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const desired =
    mode === "requests"
      ? "request"
      : mode === "meetings"
        ? "meeting"
        : mode === "decisions"
          ? "decision"
          : "task";
  const visible = items.filter(
    (w) =>
      w.kind === desired &&
      (mode !== "mine" || w.assignments.some((a) => a.userId === userId)) &&
      (!filter.committee || w.committeeId === filter.committee) &&
      (!filter.status || w.status === filter.status) &&
      (!filter.priority || w.priority === filter.priority) &&
      w.title.includes(filter.q),
  );
  const newKind = desired === "decision" ? null : (desired as Kind);
  const canCreate =
    newKind &&
    options.contexts.some(
      (c) =>
        c.create.includes(newKind) &&
        (!committeeId || c.committeeId === committeeId),
    );
  const title =
    mode === "inbox"
      ? "صندوق الوارد"
      : tabs.find((t) => t[0] === mode)?.[1] || "عملي";
  function card(w: Item | InboxItem) {
    return (
      <button className="work-card" key={w.id} onClick={() => void open(w.id)}>
        <span className="work-card-top">
          <span
            className={`work-priority ${w.priority === "urgent" ? "urgent" : ""}`}
          >
            {priorityLabels[w.priority]}
          </span>
          <span className={w.overdue ? "work-overdue" : "muted"}>
            {w.overdue ? "متأخرة" : stateLabels[w.status]}
          </span>
        </span>
        <strong>{w.title}</strong>
        {"decisionSummary" in w && w.decisionSummary && (
          <span className="muted">
            {w.decisionSummary.decider} · {date(w.decisionSummary.date)}
            <br />
            {w.decisionSummary.meeting || "اجتماع غير متاح"}
            {w.decisionSummary.tasks.map((t, i) => (
              <small key={i}>
                {" "}
                · {t.title}: {stateLabels[t.status]}
              </small>
            ))}
          </span>
        )}
        {"action" in w && <span className="next-action">{w.action}</span>}
        <span className="work-card-meta">
          <span>
            <Clock3 size={13} />
            {date(w.dueAt)}
          </span>
          <span>
            {w.assignments.find((a) => a.role === "responsible")?.name ||
              kindLabels[w.kind]}
          </span>
        </span>
        {"reason" in w && <small>{w.reason}</small>}
      </button>
    );
  }
  let groups: { title: string; rows: (Item | InboxItem)[] }[] = [];
  if (mode === "inbox")
    groups = ["عاجل", "اليوم", "هذا الأسبوع", "لاحقًا"].map((bucket) => ({
      title: bucket,
      rows: inboxItems.filter((w) => w.bucket === bucket),
    }));
  else if (mode === "mine")
    groups = [
      { title: "متأخر", rows: visible.filter((w) => w.overdue) },
      {
        title: "اليوم",
        rows: visible.filter(
          (w) =>
            !w.overdue &&
            w.status !== "review" &&
            !["completed", "cancelled"].includes(w.status) &&
            w.dueAt &&
            riyadhDay(w.dueAt) === riyadhDay(new Date()),
        ),
      },
      {
        title: "قادم",
        rows: visible.filter(
          (w) =>
            !w.overdue &&
            !["review", "completed", "cancelled"].includes(w.status) &&
            (!w.dueAt || riyadhDay(w.dueAt) !== riyadhDay(new Date())),
        ),
      },
      {
        title: "بانتظار المراجعة",
        rows: visible.filter((w) => w.status === "review" && !w.overdue),
      },
      {
        title: "أكملتها مؤخرًا",
        rows: visible.filter(
          (w) =>
            w.status === "completed" &&
            w.completedAt &&
            new Date(w.completedAt).getTime() >= Date.now() - 30 * 86400000,
        ),
      },
    ];
  else groups = [{ title: "", rows: visible }];
  return (
    <section className="work-center" inert={!ready} aria-busy={!ready}>
      <div className="work-heading">
        <div>
          <span className="eyebrow">العمل الذي يصنع الأثر</span>
          <h1>{title}</h1>
          <p>
            {mode === "inbox"
              ? "ما يحتاج إجراءك الآن. الترتيب حسب الأولوية والموعد بتوقيت الرياض."
              : mode === "decisions"
                ? "ذاكرة الفريق: من القرار إلى العمل الناتج عنه."
                : "سياق واضح، ومسؤول معروف، وخطوة تالية."}
          </p>
        </div>
        {canCreate && (
          <button
            className="button primary"
            onClick={() => {
              setSource(null);
              setCreate(newKind);
            }}
          >
            <Plus size={18} />{" "}
            {newKind === "task"
              ? "مهمة جديدة"
              : newKind === "request"
                ? "طلب جديد"
                : "اجتماع جديد"}
          </button>
        )}
      </div>
      {mode !== "inbox" && (
        <nav className="work-tabs" aria-label="مساحات العمل">
          {tabs.map(([id, label, href]) => (
            <Link
              className={mode === id ? "selected" : ""}
              key={id}
              href={
                committeeId
                  ? `${href}?committee=${encodeURIComponent(committeeId)}`
                  : href
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">جارٍ فتح التفاصيل...</p>}
      {mode !== "inbox" && (
        <div className="work-filters">
          <label>
            <span className="sr-only">البحث في العمل</span>
            <input
              placeholder="ابحث بعنوان العمل"
              value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
            />
          </label>
          <select
            aria-label="تصفية حسب اللجنة"
            value={filter.committee}
            onChange={(e) =>
              setFilter({ ...filter, committee: e.target.value })
            }
          >
            <option value="">كل اللجان المتاحة</option>
            {Array.from(
              new Map(
                options.contexts
                  .filter((c) => c.committeeId)
                  .map((c) => [c.committeeId, c]),
              ).values(),
            ).map((c) => (
              <option key={c.committeeId} value={c.committeeId!}>
                {c.committeeName}
              </option>
            ))}
          </select>
          <select
            aria-label="تصفية حسب الحالة"
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="">كل الحالات</option>
            {Array.from(
              new Set(
                items.filter((w) => w.kind === desired).map((w) => w.status),
              ),
            ).map((s) => (
              <option key={s} value={s}>
                {stateLabels[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="تصفية حسب الأولوية"
            value={filter.priority}
            onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
          >
            <option value="">كل الأولويات</option>
            {Object.entries(priorityLabels).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
          {desired === "task" && (
            <div className="view-switch">
              <button
                aria-label="عرض القائمة"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={18} />
              </button>
              <button
                aria-label="عرض اللوحة"
                aria-pressed={view === "kanban"}
                onClick={() => setView("kanban")}
              >
                <Columns3 size={18} />
              </button>
            </div>
          )}
        </div>
      )}
      {view === "kanban" && desired === "task" && mode !== "inbox" ? (
        <>
          <p className="muted board-hint">
            افتح بطاقة واختر الحالة التالية؛ النقل يمر بالصلاحيات، والإكمال يمر
            بالمراجعة.
          </p>
          <div className="kanban">
            {[
              "not_started",
              "in_progress",
              "review",
              "completed",
              "cancelled",
            ].map((state) => (
              <section className="kanban-column" key={state}>
                <h2>{stateLabels[state]}</h2>
                {visible.filter((w) => w.status === state).map(card)}
                {!visible.some((w) => w.status === state) && (
                  <p className="muted">لا توجد مهام</p>
                )}
              </section>
            ))}
          </div>
        </>
      ) : (
        groups.map((g) => (
          <section className="work-group" key={g.title}>
            <h2>{g.title}</h2>
            {g.rows.length ? (
              <div className="work-list">{g.rows.map(card)}</div>
            ) : (
              <Empty
                text={
                  mode === "inbox"
                    ? "لا توجد عناصر تحتاج إجراء."
                    : mode === "decisions"
                      ? "لم تُسجل قرارات بعد."
                      : g.title === "متأخر"
                        ? "رائع! ما عندك مهام متأخرة."
                        : g.title === "اليوم"
                          ? "ما عندك مهام اليوم."
                          : mode === "meetings"
                            ? "أنشئ أول اجتماع لتوثيق قرارات الفريق."
                            : "لا توجد أعمال في هذه المساحة."
                }
              />
            )}
          </section>
        ))
      )}
      <Dialog.Root
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) {
            setSelected(null);
            setError("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="work-drawer" dir="rtl">
            <Dialog.Close
              className="dialog-close icon-button"
              aria-label="إغلاق التفاصيل"
            >
              <X />
            </Dialog.Close>
            {selected && (
              <>
                {selected.parentEvent && (
                  <Link
                    className="context-note"
                    href={`/events/${selected.parentEvent.id}`}
                  >
                    غرفة عمليات: {selected.parentEvent.title}
                  </Link>
                )}
                <span className="eyebrow">
                  {kindLabels[selected.kind]} · {stateLabels[selected.status]}
                </span>
                <Dialog.Title>{selected.title}</Dialog.Title>
                <Dialog.Description>
                  {selected.description ||
                    "كل سياق العمل وتحديثاته في هذه المساحة."}
                </Dialog.Description>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <div className="detail-facts">
                  <span>
                    الأولوية <b>{priorityLabels[selected.priority]}</b>
                  </span>
                  <span>
                    الموعد <b>{date(selected.dueAt)}</b>
                  </span>
                  <span>
                    المسؤول{" "}
                    <b>
                      {selected.assignments.find(
                        (a) => a.role === "responsible",
                      )?.name || "لم يُعيّن"}
                    </b>
                  </span>
                  {selected.task && (
                    <span>
                      التقدم{" "}
                      <b>{selected.task.progress.toLocaleString("ar-SA")}٪</b>
                    </span>
                  )}
                </div>
                <div className="detail-actions">
                  {selected.transitions.map((to) => (
                    <button
                      disabled={busy}
                      className="button secondary small"
                      key={to}
                      onClick={() =>
                        perform(`/${selected.id}/transition`, {
                          to,
                          version: selected.version,
                        })
                      }
                    >
                      {to === "review"
                        ? "طلب المراجعة"
                        : to === "received"
                          ? "استلام الطلب"
                          : to === "in_progress"
                            ? "بدء التنفيذ"
                            : stateLabels[to]}
                    </button>
                  ))}
                </div>
                {selected.canReview && (
                  <form
                    className="review-box"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const reason = String(f.get("overrideReason") || "");
                      void perform(`/${selected.id}/review`, {
                        decision: f.get("decision"),
                        comment: f.get("comment"),
                        version: selected.version,
                        ...(reason ? { overrideReason: reason } : {}),
                      });
                    }}
                  >
                    <h3>قرارك يفتح الخطوة التالية</h3>
                    <label>
                      القرار
                      <select name="decision">
                        <option value="approved">اعتماد</option>
                        <option value="changes_requested">طلب تعديل</option>
                        <option value="rejected">رفض</option>
                      </select>
                    </label>
                    <label>
                      تعليق المراجعة
                      <textarea name="comment" maxLength={2000} />
                    </label>
                    {selected.canOverride && selected.blockedCount > 0 && (
                      <label>
                        سبب تجاوز الاعتمادية
                        <textarea name="overrideReason" minLength={5} />
                      </label>
                    )}
                    <button className="button primary" disabled={busy}>
                      تسجيل قرار المراجعة
                    </button>
                  </form>
                )}
                {selected.invitation && (
                  <section className="detail-section">
                    <h3>دعوتك للاجتماع</h3>
                    <p>
                      {selected.invitation.response === "pending"
                        ? "بانتظار ردك"
                        : selected.invitation.response === "accepted"
                          ? "أكدت الحضور"
                          : "اعتذرت عن الحضور"}
                    </p>
                    <div className="detail-actions">
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() =>
                          perform(`/${selected.id}/respond`, {
                            response: "accepted",
                          })
                        }
                      >
                        تأكيد الحضور
                      </button>
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() =>
                          perform(`/${selected.id}/respond`, {
                            response: "declined",
                          })
                        }
                      >
                        اعتذار
                      </button>
                    </div>
                  </section>
                )}
                {selected.meeting && (
                  <section className="detail-section">
                    <h3>تفاصيل اللقاء</h3>
                    <p>
                      {date(selected.startAt)} — {date(selected.meeting.endAt)}
                    </p>
                    <p className="preserve-text">{selected.meeting.location}</p>
                    <h3>جدول الأعمال</h3>
                    <p className="preserve-text">
                      {selected.meeting.agenda || "لم يُضف جدول أعمال."}
                    </p>
                    <h3>المحضر</h3>
                    <p className="preserve-text">
                      {selected.meeting.notes || "لم يُسجل محضر بعد."}
                    </p>
                  </section>
                )}
                {selected.decision && (
                  <section className="detail-section">
                    <h3>سياق القرار</h3>
                    <p>
                      {selected.decision.deciderName} ·{" "}
                      {date(selected.decision.decisionDate)}
                    </p>
                    {selected.parentMeeting && (
                      <button
                        className="text-button"
                        onClick={() => open(selected.parentMeeting!.id)}
                      >
                        {selected.parentMeeting.title}
                        <ArrowLeft size={15} />
                      </button>
                    )}
                  </section>
                )}
                {selected.canEdit &&
                  !["completed", "cancelled", "rejected", "review"].includes(
                    selected.status,
                  ) && (
                    <details className="detail-section">
                      <summary>تعديل التفاصيل</summary>
                      <form
                        key={selected.version}
                        className="edit-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void perform(`/${selected.id}/edit`, {
                            title: f.get("title"),
                            description: f.get("description"),
                            version: selected.version,
                            ...(selected.task
                              ? { progress: Number(f.get("progress")) }
                              : {}),
                            ...(selected.meeting
                              ? { notes: f.get("notes") }
                              : {}),
                          });
                        }}
                      >
                        <label>
                          العنوان
                          <input
                            name="title"
                            defaultValue={selected.title}
                            required
                            minLength={2}
                          />
                        </label>
                        <label>
                          الوصف
                          <textarea
                            name="description"
                            defaultValue={selected.description}
                          />
                        </label>
                        {selected.task && (
                          <label>
                            التقدم قبل الاعتماد
                            <input
                              name="progress"
                              type="number"
                              min={0}
                              max={99}
                              defaultValue={Math.min(
                                selected.task.progress,
                                99,
                              )}
                            />
                          </label>
                        )}
                        {selected.meeting && (
                          <label>
                            محضر الاجتماع
                            <textarea
                              name="notes"
                              defaultValue={selected.meeting.notes}
                            />
                          </label>
                        )}
                        <button className="button primary" disabled={busy}>
                          حفظ التفاصيل
                        </button>
                      </form>
                    </details>
                  )}
                <section className="detail-section">
                  <h3>الفريق</h3>
                  {selected.assignments.map((a) => (
                    <p key={a.id}>
                      {a.name}{" "}
                      <small>
                        ·{" "}
                        {
                          {
                            responsible: "المسؤول الرئيسي",
                            participant: "مشارك",
                            reviewer: "مراجع",
                            attendee: "مدعو",
                          }[a.role]
                        }
                      </small>
                    </p>
                  ))}
                  {selected.canAssign && (
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void perform(`/${selected.id}/assign`, {
                          userId: f.get("userId"),
                          role: f.get("role"),
                        });
                      }}
                    >
                      <select name="userId" aria-label="عضو التعيين" required>
                        {selected.people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <select name="role" aria-label="نوع التعيين">
                        {selected.kind === "meeting" ? (
                          <option value="attendee">مدعو</option>
                        ) : (
                          <>
                            <option value="responsible">مسؤول رئيسي</option>
                            <option value="participant">مشارك</option>
                            {selected.kind === "task" && (
                              <option value="reviewer">مراجع</option>
                            )}
                          </>
                        )}
                      </select>
                      <button
                        className="button secondary small"
                        disabled={busy}
                      >
                        تعيين
                      </button>
                    </form>
                  )}
                </section>
                {selected.kind === "task" && (
                  <section className="detail-section">
                    <h3>الاعتماديات</h3>
                    {selected.blockedCount > 0 ? (
                      <p className="blocking-note">
                        هذه المهمة متوقفة بسبب اعتماديات غير مكتملة. يجب إكمالها
                        قبل الاعتماد.
                      </p>
                    ) : (
                      <p>لا توجد اعتماديات غير مكتملة تمنع إغلاقها.</p>
                    )}
                    {selected.blockers.map((b) => (
                      <div className="list-row" key={b.id}>
                        <button
                          className="text-button"
                          onClick={() => open(b.id)}
                        >
                          {b.title} · {stateLabels[b.status]}
                        </button>
                        {selected.canDependency && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              perform(`/${selected.id}/dependencies`, {
                                blockerId: b.id,
                                remove: true,
                              })
                            }
                          >
                            إزالة
                          </button>
                        )}
                      </div>
                    ))}
                    {selected.unblocks.length > 0 && (
                      <>
                        <h3>إكمال هذه المهمة يفتح</h3>
                        {selected.unblocks.map((b) => (
                          <button
                            className="text-button"
                            key={b.id}
                            onClick={() => open(b.id)}
                          >
                            {b.title}
                            <ArrowLeft size={15} />
                          </button>
                        ))}
                      </>
                    )}
                    {selected.canDependency && (
                      <form
                        className="inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void perform(`/${selected.id}/dependencies`, {
                            blockerId: new FormData(e.currentTarget).get(
                              "blockerId",
                            ),
                          });
                        }}
                      >
                        <select
                          aria-label="المهمة المانعة"
                          name="blockerId"
                          required
                        >
                          <option value="">اختر مهمة تعتمد عليها</option>
                          {items
                            .filter(
                              (w) =>
                                w.kind === "task" &&
                                w.id !== selected.id &&
                                w.termId === selected.termId,
                            )
                            .map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.title}
                              </option>
                            ))}
                        </select>
                        <button
                          className="button secondary small"
                          disabled={busy}
                        >
                          إضافة اعتمادية
                        </button>
                      </form>
                    )}
                  </section>
                )}
                {(selected.canLink || selected.canDecision) && (
                  <div className="detail-actions">
                    {selected.canLink && (
                      <button
                        className="button primary"
                        onClick={() => {
                          setSource(selected);
                          setCreate("task");
                        }}
                      >
                        <Link2 size={17} />
                        إنشاء مهمة مرتبطة
                      </button>
                    )}
                    {selected.canDecision && (
                      <button
                        className="button primary"
                        onClick={() => {
                          setSource(selected);
                          setCreate("decision");
                        }}
                      >
                        تسجيل قرار
                      </button>
                    )}
                  </div>
                )}
                {selected.linkedTasks.length > 0 && (
                  <section className="detail-section">
                    <h3>المهام الناتجة</h3>
                    {selected.linkedTasks.map((w) => (
                      <button
                        key={w.id}
                        className="text-button"
                        onClick={() => open(w.id)}
                      >
                        {w.title} · {stateLabels[w.status]}
                      </button>
                    ))}
                    <p>
                      إكمال مهمة مرتبطة لا يغلق الطلب تلقائيًا؛ يلزم اعتماده.
                    </p>
                  </section>
                )}
                {selected.meetingDecisions.length > 0 && (
                  <section className="detail-section">
                    <h3>قرارات الاجتماع</h3>
                    {selected.meetingDecisions.map((w) => (
                      <button
                        key={w.id}
                        className="text-button"
                        onClick={() => open(w.id)}
                      >
                        {w.title}
                      </button>
                    ))}
                  </section>
                )}
                <section className="detail-section">
                  <h3>
                    <Paperclip size={17} /> المرفقات المحمية
                  </h3>
                  {selected.files.length ? (
                    selected.files.map((f) => (
                      <a
                        className="file-link"
                        key={f.id}
                        href={`/api/work/files/${f.id}`}
                      >
                        {f.name}
                        <span>
                          {Math.ceil(f.size / 1024).toLocaleString("ar-SA")}{" "}
                          كيلوبايت
                        </span>
                      </a>
                    ))
                  ) : (
                    <p>لم تُضف مرفقات بعد.</p>
                  )}
                  {selected.canComment && (
                    <form
                      className="upload-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setBusy(true);
                        setError("");
                        try {
                          const response = await fetch(
                            `/api/work/${selected.id}/attachments`,
                            {
                              method: "POST",
                              body: new FormData(e.currentTarget),
                            },
                          );
                          const result = await response.json();
                          if (!response.ok) throw new Error(result.message);
                          await refresh(selected.id);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <label>
                        إرفاق صورة أو ملف نصي
                        <input
                          name="file"
                          type="file"
                          accept=".png,.jpg,.jpeg,.txt"
                          required
                        />
                      </label>
                      <small>
                        حتى ٥ ميغابايت. التنزيل متاح فقط لمن يحق له فتح هذا
                        العمل.
                      </small>
                      <button
                        className="button secondary small"
                        disabled={busy}
                      >
                        رفع المرفق
                      </button>
                    </form>
                  )}
                </section>
                <section className="detail-section">
                  <h3>
                    <MessageSquare size={17} /> التعليقات والإشارات
                  </h3>
                  {selected.comments.map((c) => (
                    <article className="comment" key={c.id}>
                      <strong>{c.author}</strong>
                      <small>{date(c.createdAt)}</small>
                      <p className="preserve-text">{c.body}</p>
                    </article>
                  ))}
                  {selected.canComment && (
                    <form
                      className="edit-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void perform(`/${selected.id}/comments`, {
                          body: f.get("body"),
                          mentions: f.getAll("mentions"),
                        });
                        e.currentTarget.reset();
                      }}
                    >
                      <label>
                        تعليقك
                        <textarea name="body" required maxLength={4000} />
                      </label>
                      <label>
                        إشارة إلى زميل @
                        <select
                          name="mentions"
                          multiple
                          aria-label="إشارة إلى زميل"
                        >
                          {selected.people
                            .filter((p) => p.id !== userId)
                            .map((p) => (
                              <option value={p.id} key={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <small>
                        كل إشارة تطلب تأكيد الاطلاع في صندوق الوارد. لا تظهر إلا
                        أسماء من يمكنهم فتح العنصر.
                      </small>
                      <button className="button primary" disabled={busy}>
                        إضافة تعليق
                      </button>
                    </form>
                  )}
                  {inboxItems.find((w) => w.id === selected.id)?.mentionId && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        perform(
                          `/${inboxItems.find((w) => w.id === selected.id)!.mentionId}/acknowledge`,
                          {},
                        )
                      }
                    >
                      تأكيد الاطلاع على الإشارة
                    </button>
                  )}
                </section>
                {selected.approvals.length > 0 && (
                  <section className="detail-section">
                    <h3>سجل الاعتماد</h3>
                    {selected.approvals.map((a) => (
                      <div key={a.id} className="comment">
                        <strong>
                          {a.approverName} · {stateLabels[a.status]}
                        </strong>
                        <p>{a.comment}</p>
                        <small>{date(a.decidedAt)}</small>
                      </div>
                    ))}
                  </section>
                )}
                <section className="detail-section">
                  <h3>ما حدث في هذا العمل</h3>
                  {selected.timeline.map((t) => (
                    <div className="timeline-entry" key={t.id}>
                      <span />
                      <div>
                        <p>{t.label}</p>
                        <small>{date(t.createdAt)}</small>
                      </div>
                    </div>
                  ))}
                </section>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <CreateDialog
        kind={create}
        onClose={() => {
          setCreate(null);
          setSource(null);
        }}
        options={options}
        eventId={eventId}
        committeeId={committeeId}
        source={source}
        userId={userId}
        onCreated={async (id) => {
          setCreate(null);
          setSource(null);
          await refresh();
          await open(id);
        }}
      />
    </section>
  );
}
function CreateDialog({
  kind,
  eventId,
  onClose,
  options,
  committeeId,
  source,
  userId,
  onCreated,
}: {
  kind: Kind | null;
  eventId?: string;
  onClose: () => void;
  options: Options;
  committeeId?: string;
  source: Detail | null;
  userId: string;
  onCreated: (id: string) => Promise<void>;
}) {
  const [context, setContext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const candidates = options.contexts.filter(
    (c) =>
      kind &&
      c.create.includes(kind) &&
      (!committeeId || c.committeeId === committeeId) &&
      (!source ||
        (c.termId === source.termId &&
          (source.kind === "request"
            ? c.committeeId === source.request?.receivingCommitteeId
            : c.committeeId === source.committeeId))),
  );
  const contextKey = (c: Options["contexts"][number]) =>
    `${c.termId}:${c.committeeId || ""}`;
  const chosen =
    candidates.find((c) => contextKey(c) === context) || candidates[0];
  useEffect(() => {
    setError("");
    setContext("");
  }, [kind]);
  const people = options.people.filter((p) =>
    p.scopes.some(
      (c) =>
        c.termId === chosen?.termId && c.committeeId === chosen?.committeeId,
    ),
  );
  const reviewers = people.filter((p) =>
    p.scopes.some(
      (c) =>
        c.termId === chosen?.termId &&
        c.committeeId === chosen?.committeeId &&
        c.permissions.includes("approval.review") &&
        c.permissions.includes(
          kind === "request" ? "request.complete" : "task.review",
        ),
    ),
  );
  return (
    <Dialog.Root
      open={!!kind}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay create-overlay" />
        <Dialog.Content className="dialog create-dialog" dir="rtl">
          <Dialog.Close
            className="dialog-close icon-button"
            aria-label="إغلاق الإنشاء"
          >
            <X />
          </Dialog.Close>
          <Dialog.Title>
            {kind === "decision"
              ? "تسجيل قرار"
              : `إنشاء ${kindLabels[kind || "task"]}`}
          </Dialog.Title>
          <Dialog.Description>
            {source
              ? `مرتبط بـ: ${source.title}`
              : "ابدأ بسياق واضح ومسؤول معروف."}
          </Dialog.Description>
          {!chosen ? (
            <p className="error">
              لا يوجد فصل نشط أو نطاق يسمح بالإنشاء. تواصل مع مسؤول النادي.
            </p>
          ) : (
            <form
              className="create-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  const instant = (name: string) =>
                    f.get(name)
                      ? new Date(
                          `${String(f.get(name))}:00+03:00`,
                        ).toISOString()
                      : undefined;
                  const result = await api("", {
                    kind,
                    eventId,
                    track: f.get("track") || "general",
                    title: f.get("title"),
                    description: f.get("description"),
                    committeeId: chosen.committeeId,
                    termId: chosen.termId,
                    priority: f.get("priority") || "medium",
                    ...(kind === "task"
                      ? {
                          responsibleId: f.get("responsibleId"),
                          reviewerId: f.get("reviewerId"),
                          participantIds: f.getAll("participantIds"),
                        }
                      : {}),
                    ...(kind === "request"
                      ? {
                          receivingCommitteeId: f.get("receivingCommitteeId"),
                          reviewerId: f.get("reviewerId"),
                        }
                      : {}),
                    ...(kind === "meeting"
                      ? {
                          startAt: instant("startAt"),
                          endAt: instant("endAt"),
                          location: f.get("location"),
                          agenda: f.get("agenda"),
                          attendeeIds: f.getAll("attendeeIds"),
                        }
                      : { dueAt: instant("dueAt") }),
                    ...(source
                      ? kind === "decision"
                        ? { meetingId: source.id }
                        : { sourceId: source.id }
                      : {}),
                  });
                  await onCreated(result.id);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                العنوان
                <input
                  name="title"
                  minLength={2}
                  maxLength={160}
                  required
                  autoFocus
                />
              </label>
              <label>
                الوصف
                <textarea name="description" maxLength={6000} />
              </label>
              {eventId && (
                <label>
                  مسار العمل
                  <select
                    name="track"
                    defaultValue={
                      typeof window !== "undefined" &&
                      new URLSearchParams(window.location.search).get(
                        "track",
                      ) === "media"
                        ? "media"
                        : "general"
                    }
                  >
                    <option value="general">عام</option>
                    <option value="media">الإعلام</option>
                    <option value="technical">التقنية</option>
                    <option value="organization">التنظيم</option>
                  </select>
                </label>
              )}
              {source || committeeId ? (
                <p className="context-note">
                  {chosen.committeeName} · {chosen.termName}
                </p>
              ) : (
                <label>
                  اللجنة والفصل
                  <select
                    value={contextKey(chosen)}
                    onChange={(e) => setContext(e.target.value)}
                  >
                    {candidates.map((c) => (
                      <option value={contextKey(c)} key={contextKey(c)}>
                        {c.committeeName} · {c.termName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {kind !== "meeting" && kind !== "decision" && (
                <div className="form-two">
                  <label>
                    الأولوية
                    <select name="priority" defaultValue="medium">
                      {Object.entries(priorityLabels).map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    الموعد بتوقيت الرياض
                    <input type="datetime-local" name="dueAt" />
                  </label>
                </div>
              )}
              {kind === "task" && (
                <>
                  <div className="form-two">
                    <label>
                      المسؤول الرئيسي
                      <select
                        name="responsibleId"
                        defaultValue={userId}
                        required
                      >
                        {people
                          .filter(
                            (p) => chosen.canAssignTask || p.id === userId,
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      المراجع
                      <select name="reviewerId" required defaultValue="">
                        <option value="" disabled>
                          اختر مراجعًا مختلفًا
                        </option>
                        {reviewers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {chosen.canAssignTask && (
                    <label>
                      مشاركون إضافيون
                      <select name="participantIds" multiple>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
              {kind === "request" && (
                <div className="form-two">
                  <label>
                    اللجنة المستلمة
                    <select name="receivingCommitteeId" required>
                      <option value="">اختر لجنة</option>
                      {options.receivingCommittees
                        .filter((c) => c.id !== chosen.committeeId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    مراجع الجهة الطالبة
                    <select name="reviewerId" required>
                      {reviewers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {kind === "meeting" && (
                <>
                  <div className="form-two">
                    <label>
                      البداية بتوقيت الرياض
                      <input type="datetime-local" name="startAt" required />
                    </label>
                    <label>
                      النهاية بتوقيت الرياض
                      <input type="datetime-local" name="endAt" required />
                    </label>
                  </div>
                  <label>
                    المكان أو رابط اللقاء
                    <input name="location" maxLength={500} />
                  </label>
                  <label>
                    جدول الأعمال
                    <textarea name="agenda" maxLength={6000} />
                  </label>
                  <label>
                    المدعوون
                    <select name="attendeeIds" multiple>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary" disabled={busy}>
                {busy ? "جارٍ الحفظ..." : "حفظ وفتح التفاصيل"}
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
