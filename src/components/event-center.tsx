"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, CalendarDays, Plus, X, ChevronLeft } from "lucide-react";
import { stageLabels, stages } from "@/lib/events/model";
import type {
  eventDetail,
  eventOptions,
  listEvents,
} from "@/lib/events/queries";
import { EventPanels } from "./event-panels";
type Json<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
export type EventDetail = Json<Awaited<ReturnType<typeof eventDetail>>>;
export type EventOptions = Json<Awaited<ReturnType<typeof eventOptions>>>;
type Row = Json<Awaited<ReturnType<typeof listEvents>>>[number];
export const eventDate = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("ar-SA", {
        timeZone: "Asia/Riyadh",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "لم يحدد";
export const formText = (f: FormData, key: string) => String(f.get(key) || "");
export const eventInstant = (v: string) =>
  v ? new Date(`${v}:00+03:00`).toISOString() : null;
export async function eventApi(path: string, data?: unknown) {
  const r = await fetch(
    `/api/events${path}`,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const body = await r.json();
  if (!r.ok) throw new Error(body.message);
  return body;
}
export function EventField({
  label,
  name,
  type = "text",
  required = false,
  value,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  value?: string | number;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={value}
        step={type === "number" ? "0.01" : undefined}
      />
    </label>
  );
}
export function EventForm({
  children,
  submit,
  label,
  busy,
}: {
  children: ReactNode;
  submit: (f: FormData) => Promise<void>;
  label: string;
  busy: boolean;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <form
      className="event-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        void submit(new FormData(ev.currentTarget));
      }}
    >
      <fieldset disabled={!hydrated || busy} className="event-form-fields">
        {children}
        <button className="button primary" disabled={!hydrated || busy}>
          {label}
        </button>
      </fieldset>
    </form>
  );
}
export function EventCenter({
  initial,
  items,
  options,
  userId,
  create = false,
}: {
  initial: EventDetail | null;
  items: Row[];
  options: EventOptions;
  userId: string;
  create?: boolean;
}) {
  const [e, setEvent] = useState(initial),
    [creating, setCreating] = useState(create),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [tab, setTab] = useState("overview"),
    [q, setQ] = useState(""),
    [calendar, setCalendar] = useState(false),
    [context, setContext] = useState("");
  useEffect(() => setReady(true), []);
  const chosen =
    options.contexts.find((c) => `${c.termId}:${c.committeeId}` === context) ||
    options.contexts[0];
  async function perform(action: string, data: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      await eventApi(`/${e!.id}/${action}`, data);
      setEvent(await eventApi(`/${e!.id}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const people = options.people.filter((p) =>
    p.scopes.some(
      (s) =>
        s.termId === chosen?.termId && s.committeeId === chosen?.committeeId,
    ),
  );
  const reviewers = people.filter(
    (p) =>
      p.id !== userId &&
      p.scopes.some(
        (s) =>
          s.termId === chosen?.termId &&
          s.committeeId === chosen?.committeeId &&
          s.approve,
      ),
  );
  const tabs = [
    ["overview", "المشهد التشغيلي"],
    ["readiness", "الجاهزية"],
    ["work", "المهام والطلبات"],
    ["team", "الفريق"],
    ["attendance", "التسجيل والحضور"],
    ["media", "الإعلام والملفات"],
    ["report", "التقرير النهائي"],
    ["timeline", "الخط الزمني"],
  ];
  const groups: [string, Row[]][] = calendar
    ? [
        [
          "المواعيد",
          [...items].sort((a, b) =>
            (a.startAt || "").localeCompare(b.startAt || ""),
          ),
        ],
      ]
    : [
        [
          "قريبًا",
          items.filter((i) =>
            ["approved", "registration_open", "ready"].includes(i.status),
          ),
        ],
        [
          "قيد التجهيز",
          items.filter((i) =>
            ["idea", "planning", "preparing", "running"].includes(i.status),
          ),
        ],
        [
          "بانتظار اعتماد",
          items.filter((i) => i.status === "pending_approval"),
        ],
        [
          "منفذة مؤخرًا",
          items.filter((i) =>
            ["evaluation", "final_report", "archived"].includes(i.status),
          ),
        ],
        ["ملغاة", items.filter((i) => i.status === "cancelled")],
      ];
  return (
    <div className="event-center" inert={!ready} aria-busy={!ready}>
      {!e ? (
        <>
          <div className="event-list-header">
            <div>
              <span className="eyebrow">من الفكرة إلى الأثر</span>
              <h1>الفعاليات</h1>
              <p>كل فعالية مساحة لفريقها، وقراراتها، وما يلزم لإنجازها.</p>
            </div>
            {options.contexts.length > 0 && (
              <button
                className="button primary"
                onClick={() => setCreating(true)}
              >
                <Plus size={18} />
                إنشاء فعالية
              </button>
            )}
          </div>
          <div className="event-list-tools">
            <label>
              البحث عن فعالية
              <input
                value={q}
                onChange={(v) => setQ(v.target.value)}
                placeholder="عنوان الفعالية"
              />
            </label>
            <button
              className="button secondary"
              onClick={() => setCalendar(!calendar)}
            >
              {calendar ? "عرض المجموعات" : "ترتيب بالمواعيد"}
            </button>
          </div>
          {groups.map(([label, rows]) => (
            <section className="event-group" key={label}>
              <h2>{label}</h2>
              {rows.filter((r) => r.title.includes(q)).length ? (
                <div className="event-cards">
                  {rows
                    .filter((r) => r.title.includes(q))
                    .map((r) => (
                      <Link
                        href={`/events/${r.id}`}
                        className="event-card"
                        key={r.id}
                      >
                        <span className="eyebrow">
                          {r.eventType} · {stageLabels[r.status]}
                        </span>
                        <h3>{r.title}</h3>
                        <p>
                          <CalendarDays size={16} />
                          {eventDate(r.startAt)}
                        </p>
                        <small>{r.location || "الموقع لم يحدد"}</small>
                        <ArrowLeft size={20} />
                      </Link>
                    ))}
                </div>
              ) : (
                <p className="event-empty">
                  لا توجد فعاليات متاحة في هذه المجموعة.
                </p>
              )}
            </section>
          ))}
        </>
      ) : (
        <>
          <Link className="event-back" href="/events">
            الفعاليات <ChevronLeft size={15} />
          </Link>
          <div className="event-hero">
            <div>
              <span className="eyebrow">
                غرفة عمليات الفعالية · {e.eventType}
              </span>
              <h1>{e.title}</h1>
              <p>
                {e.description || "سياق العمل، جاهزية الفريق، والقرار التالي."}
              </p>
              <div className="event-facts">
                <span>
                  <CalendarDays size={16} />
                  {eventDate(e.startAt)} — {eventDate(e.endAt)}
                </span>
                <span>{e.locationText || "موقع إلكتروني"}</span>
                {e.meetingUrl && (
                  <a href={e.meetingUrl} target="_blank" rel="noreferrer">
                    رابط اللقاء
                  </a>
                )}
              </div>
            </div>
            <button
              className="readiness-button"
              onClick={() => setTab("readiness")}
              aria-label="تفاصيل الجاهزية"
            >
              <strong>
                {e.readiness.percentage === null
                  ? "—"
                  : `${e.readiness.percentage}%`}
              </strong>
              <span>الجاهزية</span>
              <small>
                {e.readiness.completed} من {e.readiness.total} متطلبات
              </small>
            </button>
          </div>
          <ol className="stage-rail" aria-label="مراحل الفعالية">
            {stages
              .filter((s) => s !== "cancelled" || e.status === "cancelled")
              .map((s, i) => (
                <li
                  key={s}
                  aria-current={s === e.status ? "step" : undefined}
                  className={
                    s === e.status
                      ? "current"
                      : stages.indexOf(s) <
                          stages.indexOf(e.status as (typeof stages)[number])
                        ? "passed"
                        : ""
                  }
                >
                  <span>{i + 1}</span>
                  {stageLabels[s]}
                </li>
              ))}
          </ol>
          <nav className="event-tabs" aria-label="أقسام غرفة العمليات">
            {tabs.map(([id, name]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {name}
              </button>
            ))}
          </nav>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <EventPanels
            e={e}
            options={options}
            userId={userId}
            tab={tab}
            busy={busy}
            perform={perform}
            refresh={async () => setEvent(await eventApi(`/${e.id}`))}
            fail={setError}
          />
        </>
      )}
      <Dialog.Root open={creating} onOpenChange={setCreating}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content
            className="dialog create-dialog event-create"
            dir="rtl"
          >
            <Dialog.Close
              className="dialog-close icon-button"
              aria-label="إغلاق الإنشاء"
            >
              <X />
            </Dialog.Close>
            <Dialog.Title>إنشاء فعالية</Dialog.Title>
            <Dialog.Description>
              ابدأ بفريق واضح وقالب تشغيل قابل للتكييف.
            </Dialog.Description>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {chosen ? (
              <EventForm
                busy={busy}
                label="إنشاء غرفة العمليات"
                submit={async (f) => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await eventApi("", {
                      title: formText(f, "title"),
                      description: formText(f, "description"),
                      termId: chosen.termId,
                      committeeId: chosen.committeeId,
                      leadId: formText(f, "leadId"),
                      approverId: formText(f, "approverId"),
                      eventType: formText(f, "eventType"),
                      playbookId: formText(f, "playbookId") || undefined,
                      startAt: eventInstant(formText(f, "startAt")),
                      endAt: eventInstant(formText(f, "endAt")),
                      locationType: formText(f, "locationType"),
                      locationText: formText(f, "locationText"),
                      meetingUrl: formText(f, "meetingUrl") || undefined,
                      targetAudience: formText(f, "targetAudience"),
                      capacity: formText(f, "capacity")
                        ? Number(f.get("capacity"))
                        : undefined,
                      registrationUrl:
                        formText(f, "registrationUrl") || undefined,
                      plannedBudget: formText(f, "plannedBudget")
                        ? Math.round(Number(f.get("plannedBudget")) * 100)
                        : undefined,
                      reportRequired: f.get("reportRequired") === "on",
                    });
                    window.location.assign(`/events/${result.id}`);
                  } catch (err) {
                    setError((err as Error).message);
                    setBusy(false);
                  }
                }}
              >
                <label>
                  السياق
                  <select
                    value={`${chosen.termId}:${chosen.committeeId}`}
                    onChange={(v) => setContext(v.target.value)}
                  >
                    {options.contexts.map((c) => (
                      <option
                        key={`${c.termId}:${c.committeeId}`}
                        value={`${c.termId}:${c.committeeId}`}
                      >
                        {c.committeeName} · {c.termName}
                      </option>
                    ))}
                  </select>
                </label>
                <EventField name="title" label="عنوان الفعالية" required />
                <label>
                  وصف الفعالية
                  <textarea name="description" />
                </label>
                <div className="form-two">
                  <EventField
                    name="eventType"
                    label="نوع الفعالية"
                    value="ورشة عمل"
                    required
                  />
                  <label>
                    قالب التشغيل
                    <select name="playbookId">
                      <option value="">دون قالب</option>
                      {options.playbooks.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · الإصدار {p.version}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-two">
                  <label>
                    قائد الفعالية
                    <select name="leadId" defaultValue={userId}>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    المعتمد المستقل
                    <select name="approverId" required>
                      <option value="">اختر معتمدًا</option>
                      {reviewers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-two">
                  <EventField
                    name="startAt"
                    label="البداية بتوقيت الرياض"
                    type="datetime-local"
                    required
                  />
                  <EventField
                    name="endAt"
                    label="النهاية بتوقيت الرياض"
                    type="datetime-local"
                    required
                  />
                </div>
                <label>
                  نوع الموقع
                  <select name="locationType">
                    <option value="onsite">حضوري</option>
                    <option value="online">عن بعد</option>
                    <option value="hybrid">هجين</option>
                  </select>
                </label>
                <EventField name="locationText" label="الموقع" />
                <EventField name="meetingUrl" label="رابط اللقاء" type="url" />
                <EventField
                  name="targetAudience"
                  label="الجمهور المستهدف"
                  required
                />
                <div className="form-two">
                  <EventField
                    name="capacity"
                    label="السعة الاختيارية"
                    type="number"
                  />
                  <EventField
                    name="plannedBudget"
                    label="الميزانية التقديرية بالريال"
                    type="number"
                  />
                </div>
                <EventField
                  name="registrationUrl"
                  label="رابط التسجيل الخارجي"
                  type="url"
                />
                <label className="checkbox-label">
                  <input type="checkbox" name="reportRequired" defaultChecked />
                  التقرير النهائي إلزامي للأرشفة
                </label>
              </EventForm>
            ) : (
              <p>لا يوجد سياق يتيح إنشاء فعالية.</p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
