"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  Check,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Paperclip,
  Users,
} from "lucide-react";
import {
  EventForm as Form,
  EventField as Field,
  eventDate as date,
  eventInstant as instant,
  formText as text,
  type EventDetail as Detail,
  type EventOptions as Options,
} from "./event-center";
import { stageLabels } from "@/lib/events/model";
import { stateLabels, kindLabels } from "@/lib/work/model";
export function EventPanels({
  e,
  options,
  userId,
  tab,
  busy,
  perform,
  refresh,
  fail,
}: {
  e: Detail;
  options: Options;
  userId: string;
  tab: string;
  busy: boolean;
  perform: (action: string, data?: unknown) => Promise<void>;
  refresh: () => Promise<void>;
  fail: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const owners = [
    ...new Map(
      [
        ...e.team.map((p) => ({ id: p.userId, name: p.name })),
        ...options.people.filter((p) =>
          p.scopes.some(
            (s) => s.termId === e.termId && s.committeeId === e.committeeId,
          ),
        ),
      ].map((p) => [p.id, p]),
    ).values(),
  ];
  const ownerSelect = (
    <label>
      المسؤول
      <select name="ownerId" defaultValue={e.leadId}>
        {owners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  const linked = (kind: string) =>
    `/work?create=${kind}&event=${e.id}&committee=${e.committeeId}`;
  const canCreate = (k: string) =>
    options.contexts.some(
      (c) => c.termId === e.termId && c.committeeId === e.committeeId,
    );
  const workRows = (rows: Detail["work"]) =>
    rows.length ? (
      <div className="event-work-list">
        {rows.map((w) => (
          <Link href={`/work?item=${w.id}`} key={w.id}>
            <span>
              <small>
                {kindLabels[w.kind]} ·{" "}
                {w.track === "media"
                  ? "إعلام"
                  : options.committees.find((c) => c.id === w.committeeId)
                      ?.name}
              </small>
              <strong>{w.title}</strong>
            </span>
            <span>
              {w.blocked ? "متوقفة على اعتماديات" : stateLabels[w.status]}
              <ArrowLeft size={16} />
            </span>
          </Link>
        ))}
      </div>
    ) : (
      <p className="event-empty">لا توجد أعمال في هذه المجموعة.</p>
    );
  if (tab === "overview")
    return (
      <div className="event-overview">
        <div>
          <section className="event-section">
            <span className="eyebrow">القرار التالي</span>
            <h2>{stageLabels[e.status]}</h2>
            {!e.closed &&
              e.next.map((to) => (
                <div className="stage-action" key={to}>
                  <div>
                    <strong>{stageLabels[to]}</strong>
                    {e.gates[to]?.length ? (
                      <ul>
                        {e.gates[to].map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>لا توجد متطلبات غير مكتملة تمنع هذا الانتقال.</p>
                    )}
                  </div>
                  {(to === "pending_approval"
                    ? e.permissions.submit
                    : to === "archived"
                      ? e.permissions.archive
                      : e.permissions.update) && (
                    <Form
                      busy={busy}
                      label={
                        to === "pending_approval"
                          ? "إرسال للاعتماد"
                          : `الانتقال إلى ${stageLabels[to]}`
                      }
                      submit={async (f) =>
                        perform("transition", {
                          to,
                          version: e.version,
                          reason: text(f, "reason") || undefined,
                        })
                      }
                    >
                      {!!e.gates[to]?.length &&
                        e.permissions.override_stage && (
                          <Field
                            label="سبب التجاوز المصرح"
                            name="reason"
                            required
                          />
                        )}
                    </Form>
                  )}
                </div>
              ))}
            {e.closed && <p>هذه الفعالية مغلقة؛ سجلها متاح للقراءة.</p>}
          </section>
          <section className="event-section">
            <h2>الموافقات</h2>
            {e.approvals.length ? (
              e.approvals.map((a) => (
                <div key={a.id} className="event-line">
                  <ShieldCheck size={19} />
                  <div>
                    <strong>
                      {a.purpose === "report"
                        ? "التقرير النهائي"
                        : "اعتماد الفعالية"}{" "}
                      · {stateLabels[a.status]}
                    </strong>
                    <p>
                      {a.name} {a.comment && `— ${a.comment}`}
                    </p>
                    {a.status === "pending" &&
                      a.approverId === userId &&
                      a.requestedBy !== userId &&
                      e.permissions.approve &&
                      !e.closed && (
                        <Form
                          label="تسجيل قرار الاعتماد"
                          busy={busy}
                          submit={async (f) =>
                            perform("review", {
                              decision: text(f, "decision"),
                              comment: text(f, "comment"),
                              version: e.version,
                            })
                          }
                        >
                          <label>
                            القرار
                            <select name="decision">
                              <option value="approved">اعتماد</option>
                              <option value="changes_requested">
                                طلب تعديل
                              </option>
                              <option value="rejected">رفض</option>
                            </select>
                          </label>
                          <Field
                            label="تعليق المراجع"
                            name="comment"
                            required
                          />
                        </Form>
                      )}
                  </div>
                </div>
              ))
            ) : (
              <p className="event-empty">لم يرسل طلب اعتماد بعد.</p>
            )}
          </section>
          <section className="event-section">
            <h2>سجل المخاطر</h2>
            <p className="muted">
              تقدير تشغيلي داخلي من ١ إلى ٣ للاحتمال والأثر؛ ليس تصنيفًا جامعيًا
              رسميًا.
            </p>
            {e.risks.map((r) => (
              <div className="risk-row" key={r.id}>
                <AlertTriangle size={19} />
                <div>
                  <strong>{r.title}</strong>
                  <p>{r.description}</p>
                  <small>
                    الاحتمال {r.probability} · الأثر {r.impact} ·{" "}
                    {r.status === "closed"
                      ? "مغلق"
                      : r.status === "mitigating"
                        ? "قيد المعالجة"
                        : "مفتوح"}
                  </small>
                  <p>{r.mitigation}</p>
                  {!e.closed &&
                    r.status !== "closed" &&
                    (r.ownerId === userId || e.permissions.update) && (
                      <Form
                        busy={busy}
                        label="توثيق المعالجة"
                        submit={async (f) =>
                          perform("resolve-risk", {
                            id: r.id,
                            mitigation: text(f, "mitigation"),
                            status: text(f, "status"),
                          })
                        }
                      >
                        <Field
                          label="المعالجة"
                          name="mitigation"
                          required
                          value={r.mitigation}
                        />
                        <label>
                          حالة الخطر
                          <select name="status">
                            <option value="mitigating">قيد المعالجة</option>
                            <option value="closed">مغلق</option>
                          </select>
                        </label>
                      </Form>
                    )}
                </div>
              </div>
            ))}
            {!e.risks.length && (
              <p className="event-empty">لم تسجل مخاطر بعد.</p>
            )}
            {e.permissions.update && !e.closed && (
              <details>
                <summary>إضافة خطر</summary>
                <Form
                  busy={busy}
                  label="حفظ الخطر"
                  submit={async (f) =>
                    perform("risks", {
                      title: text(f, "title"),
                      description: text(f, "description"),
                      probability: Number(f.get("probability")),
                      impact: Number(f.get("impact")),
                      ownerId: text(f, "ownerId"),
                      mitigation: text(f, "mitigation"),
                    })
                  }
                >
                  <Field label="عنوان الخطر" name="title" required />
                  <Field label="وصف الخطر" name="description" />
                  {ownerSelect}
                  <div className="form-two">
                    {["probability", "impact"].map((n, i) => (
                      <label key={n}>
                        {i ? "الأثر" : "الاحتمال"}
                        <select name={n}>
                          <option value="1">منخفض — ١</option>
                          <option value="2">متوسط — ٢</option>
                          <option value="3">عالٍ — ٣</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <Field label="خطة المعالجة" name="mitigation" />
                </Form>
              </details>
            )}
          </section>
        </div>
        <aside>
          <section className="event-section event-quick">
            <h2>ابدأ من هنا</h2>
            {!e.closed &&
              canCreate("task") &&
              ["task", "request", "meeting"].map((k) => (
                <Link key={k} href={linked(k)} className="button secondary">
                  <Plus size={16} />
                  إنشاء {kindLabels[k]} مرتبطة
                </Link>
              ))}
            <p>الجمهور: {e.targetAudience}</p>
            <p>السعة: {e.capacity ?? "غير محددة"}</p>
            <p>
              أقرب موعد:{" "}
              {date(
                [
                  ...e.requirements
                    .filter((r) => r.status !== "completed")
                    .map((r) => r.dueAt),
                  ...e.work
                    .filter(
                      (w) => !["completed", "cancelled"].includes(w.status),
                    )
                    .map((w) => w.dueAt),
                ]
                  .filter((d): d is string => !!d)
                  .sort()[0] || e.startAt,
              )}
            </p>
          </section>
          <section className="event-section">
            <h2>الميزانية المختصرة</h2>
            {e.budget ? (
              <>
                <p>بالريال السعودي؛ بيانات مدخلة وليست كشف مصروفات.</p>
                {[
                  ["المخطط", e.budget.plannedBudget],
                  ["المعتمد", e.budget.approvedBudget],
                  ["الصرف الفعلي", e.budget.actualSpend],
                ].map(([label, v]) => (
                  <p key={String(label)}>
                    {label}:{" "}
                    {v === null ? "لم يسجل" : (Number(v) / 100).toFixed(2)}
                  </p>
                ))}
                {e.permissions.manage_budget &&
                  !e.closed &&
                  !["pending", "approved"].includes(e.report?.status || "") && (
                    <Form
                      busy={busy}
                      label="حفظ الميزانية"
                      submit={async (f) =>
                        perform("edit", {
                          version: e.version,
                          ...Object.fromEntries(
                            [
                              "plannedBudget",
                              "approvedBudget",
                              "actualSpend",
                            ].map((k) => [
                              k,
                              text(f, k)
                                ? Math.round(Number(f.get(k)) * 100)
                                : null,
                            ]),
                          ),
                        })
                      }
                    >
                      {["plannedBudget", "approvedBudget", "actualSpend"].map(
                        (k, i) => (
                          <Field
                            key={k}
                            label={
                              [
                                "المخطط بالريال",
                                "المعتمد بالريال",
                                "الصرف الفعلي بالريال",
                              ][i]
                            }
                            name={k}
                            type="number"
                            value={
                              e.budget?.[
                                k as keyof NonNullable<Detail["budget"]>
                              ] != null
                                ? Number(
                                    e.budget[
                                      k as keyof NonNullable<Detail["budget"]>
                                    ],
                                  ) / 100
                                : undefined
                            }
                          />
                        ),
                      )}
                    </Form>
                  )}
              </>
            ) : (
              <p>الميزانية متاحة لأصحاب الصلاحية المالية.</p>
            )}
          </section>
          {!e.closed &&
            e.permissions.update &&
            ["idea", "planning"].includes(e.status) && (
              <details className="event-section">
                <summary>تعديل وصف الفعالية</summary>
                <Form
                  busy={busy}
                  label="حفظ الوصف"
                  submit={async (f) =>
                    perform("edit", {
                      title: text(f, "title"),
                      description: text(f, "description"),
                      version: e.version,
                    })
                  }
                >
                  <Field
                    label="عنوان الفعالية"
                    name="title"
                    value={e.title}
                    required
                  />
                  <label>
                    الوصف
                    <textarea name="description" defaultValue={e.description} />
                  </label>
                </Form>
              </details>
            )}
          {!e.closed && e.permissions.cancel && (
            <details className="event-section">
              <summary>إلغاء الفعالية</summary>
              <p>يحفظ الإلغاء السجل ويغلق الإجراءات الجديدة.</p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void perform("transition", {
                    to: "cancelled",
                    version: e.version,
                  })
                }
              >
                تأكيد إلغاء الفعالية
              </button>
            </details>
          )}
        </aside>
      </div>
    );
  if (tab === "readiness")
    return (
      <section className="event-section">
        <div className="section-title">
          <h2>ما الذي ينقصنا؟</h2>
          <span>
            {e.readiness.completed} مكتمل · {e.readiness.remaining.length} متبقٍ
            · {e.readiness.overdue.length} متأخر
          </span>
        </div>
        <p>
          النسبة = المتطلبات المكتملة ÷ جميع المتطلبات. المتطلبات الإلزامية فقط
          تقفل المرحلة المحددة لها.
        </p>
        {e.requirements.map((r) => (
          <div className="readiness-row" key={r.id}>
            <span
              className={
                r.status === "completed"
                  ? "readiness-check done"
                  : "readiness-check"
              }
            >
              {r.status === "completed" ? <Check size={18} /> : "○"}
            </span>
            <div>
              <strong>{r.title}</strong>
              <p>
                {r.category} · {r.required ? "إلزامي" : "اختياري"} · قبل{" "}
                {stageLabels[r.gate]} · {date(r.dueAt)}
              </p>
              <small>
                {owners.find((p) => p.id === r.ownerId)?.name || "عضو الفريق"}
                {r.evidence && ` — ${r.evidence}`}
              </small>
            </div>
            {!e.closed &&
              (r.ownerId === userId || e.permissions.manage_readiness) && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform("readiness", {
                      id: r.id,
                      completed: r.status !== "completed",
                      evidence: r.evidence,
                    })
                  }
                >
                  {r.status === "completed" ? "إعادة فتح" : "إكمال المتطلب"}
                </button>
              )}
          </div>
        ))}
        {!e.requirements.length && (
          <p className="event-empty">لا توجد متطلبات؛ الجاهزية غير محددة.</p>
        )}
        {e.permissions.manage_readiness && !e.closed && (
          <details>
            <summary>إضافة متطلب جاهزية</summary>
            <Form
              busy={busy}
              label="حفظ المتطلب"
              submit={async (f) =>
                perform("requirements", {
                  title: text(f, "title"),
                  category: text(f, "category"),
                  ownerId: text(f, "ownerId"),
                  dueAt: instant(text(f, "dueAt")),
                  required: f.get("required") === "on",
                  gate: text(f, "gate"),
                  evidence: text(f, "evidence"),
                })
              }
            >
              <Field label="عنوان المتطلب" name="title" required />
              <Field label="التصنيف" name="category" required value="التنظيم" />
              {ownerSelect}
              <Field
                label="موعد المتطلب بتوقيت الرياض"
                name="dueAt"
                type="datetime-local"
              />
              <label>
                المرحلة المطلوبة
                <select name="gate">
                  {[
                    "pending_approval",
                    "registration_open",
                    "ready",
                    "final_report",
                    "archived",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {stageLabels[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="required" defaultChecked />
                إلزامي
              </label>
              <Field label="الدليل أو ملاحظة الإنجاز" name="evidence" />
            </Form>
          </details>
        )}
      </section>
    );
  if (tab === "work") {
    const groups: [string, Detail["work"]][] = [
      [
        "مهام حرجة",
        e.work.filter(
          (w) => w.kind === "task" && ["urgent", "high"].includes(w.priority),
        ),
      ],
      [
        "متأخرة",
        e.work.filter(
          (w) =>
            ["task", "request"].includes(w.kind) &&
            w.dueAt &&
            new Date(w.dueAt) < new Date() &&
            !["completed", "cancelled", "rejected"].includes(w.status),
        ),
      ],
      ["متوقفة على اعتماديات", e.work.filter((w) => w.blocked)],
      ["مكتملة", e.work.filter((w) => w.status === "completed")],
      ...options.committees
        .filter((c) =>
          e.work.some((w) => w.kind === "task" && w.committeeId === c.id),
        )
        .map(
          (c) =>
            [
              `مهام ${c.name}`,
              e.work.filter((w) => w.kind === "task" && w.committeeId === c.id),
            ] as [string, Detail["work"]],
        ),
      ["طلبات بين اللجان", e.work.filter((w) => w.kind === "request")],
      [
        "الاجتماعات والقرارات",
        e.work.filter((w) => ["meeting", "decision"].includes(w.kind)),
      ],
    ];
    return (
      <section className="event-section">
        <div className="section-title">
          <h2>العمل المرتبط</h2>
          {!e.closed && canCreate("task") && (
            <div className="event-actions">
              {["task", "request", "meeting"].map((k) => (
                <Link className="button secondary" key={k} href={linked(k)}>
                  إنشاء {kindLabels[k]}
                </Link>
              ))}
            </div>
          )}
        </div>
        {groups.map(([label, rows]) => (
          <div key={label} className="event-work-group">
            <h3>{label}</h3>
            {workRows(rows)}
          </div>
        ))}
      </section>
    );
  }
  if (tab === "team")
    return (
      <section className="event-section">
        <h2>فريق واحد، من لجان متعددة</h2>
        {e.team.map((p) => (
          <div className="event-line" key={p.id}>
            <Users size={18} />
            <div>
              <strong>{p.name}</strong>
              <p>
                {p.role} ·{" "}
                {options.committees.find((c) => c.id === p.committeeId)?.name ||
                  "فريق الفعالية"}{" "}
                · {date(p.startAt)} — {p.endAt ? date(p.endAt) : "مستمر"}
              </p>
            </div>
          </div>
        ))}
        {e.permissions.manage_team && !e.closed && (
          <details>
            <summary>تعيين عضو أو تحديث مدته</summary>
            <Form
              busy={busy}
              label="حفظ عضو الفريق"
              submit={async (f) =>
                perform("team", {
                  userId: text(f, "userId"),
                  roleId: text(f, "roleId"),
                  committeeId: text(f, "committeeId") || null,
                  startAt: instant(text(f, "startAt")),
                  endAt: instant(text(f, "endAt")),
                })
              }
            >
              <label>
                عضو الفريق
                <select name="userId">
                  {options.people
                    .filter((p) => p.scopes.some((s) => s.termId === e.termId))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                دور الفعالية
                <select name="roleId">
                  {options.roles
                    .filter((r) => r.id !== "lead")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                اللجنة الممثلة
                <select name="committeeId">
                  <option value="">دون لجنة ممثلة</option>
                  {options.committees.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="بداية التعيين بتوقيت الرياض"
                name="startAt"
                type="datetime-local"
                required
              />
              <Field
                label="نهاية التعيين بتوقيت الرياض"
                name="endAt"
                type="datetime-local"
              />
            </Form>
          </details>
        )}
      </section>
    );
  if (tab === "attendance")
    return (
      <section className="event-section">
        <h2>التسجيل والحضور</h2>
        {e.registrationUrl && (
          <a
            className="button secondary"
            href={e.registrationUrl}
            target="_blank"
            rel="noreferrer"
          >
            فتح التسجيل الخارجي
          </a>
        )}
        <p>
          إجمالي السجلات: {e.attendance.reduce((n, r) => n + r.count, 0)} · حضر:{" "}
          {e.attendance.find((r) => r.status === "present")?.count || 0} · غاب:{" "}
          {e.attendance.find((r) => r.status === "absent")?.count || 0}
        </p>
        {e.participants === null ? (
          <p>بيانات المشاركين محمية بصلاحية مستقلة.</p>
        ) : (
          <div className="participant-list">
            {e.participants.map((p) => (
              <div className="participant-row" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  {"email" in p && (
                    <small>
                      {p.email as string}{" "}
                      {"phone" in p ? (p.phone as string) : ""}{" "}
                      {"universityId" in p ? (p.universityId as string) : ""}
                    </small>
                  )}
                  <small>
                    {
                      {
                        registered: "مسجل",
                        present: "حضر",
                        absent: "غاب",
                        cancelled: "ملغى",
                      }[p.status as "registered"]
                    }
                  </small>
                </div>
                {e.permissions.manage_attendance && !e.closed && (
                  <label>
                    تحديث حضور {p.name}
                    <select
                      value={p.status}
                      disabled={busy}
                      onChange={(v) =>
                        void perform("attendance", {
                          participantId: p.id,
                          status: v.target.value,
                        })
                      }
                    >
                      {Object.entries({
                        registered: "مسجل",
                        present: "حضر",
                        absent: "غاب",
                        cancelled: "ملغى",
                      }).map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </div>
        )}
        {e.permissions.manage_participants && !e.closed && (
          <div className="event-form-columns">
            <details>
              <summary>إضافة مشارك يدويًا</summary>
              <Form
                busy={busy}
                label="تسجيل المشارك"
                submit={async (f) =>
                  perform("participants", {
                    participants: [
                      {
                        name: text(f, "name"),
                        email: text(f, "email") || undefined,
                        phone: text(f, "phone") || undefined,
                        universityId: text(f, "universityId") || undefined,
                        major: text(f, "major") || undefined,
                      },
                    ],
                  })
                }
              >
                <Field label="اسم المشارك" name="name" required />
                <Field label="البريد الإلكتروني" name="email" type="email" />
                <Field label="الهاتف" name="phone" />
                <Field label="الرقم الجامعي" name="universityId" />
                <Field label="التخصص" name="major" />
              </Form>
            </details>
            <details>
              <summary>استيراد CSV</summary>
              <p dir="ltr">name,email,phone,universityId,major,status</p>
              <p>
                حتى ٥٠٠ مشارك. الحالة registered / present / absent / cancelled.
                التكرار يرفض الملف كاملًا.
              </p>
              <Form
                busy={busy}
                label="استيراد المشاركين"
                submit={async (f) => {
                  const file = f.get("csv");
                  if (file instanceof File)
                    await perform("participants", { csv: await file.text() });
                }}
              >
                <label>
                  ملف CSV
                  <input
                    type="file"
                    name="csv"
                    accept=".csv,text/csv"
                    required
                  />
                </label>
              </Form>
            </details>
          </div>
        )}
      </section>
    );
  if (tab === "media")
    return (
      <>
        <section className="event-section">
          <h2>الإعلام</h2>
          <p>
            البوستر والتصوير والفيديو والمحتوى تُتابع عبر الأعمال والمرفقات
            المرتبطة.
          </p>
          {workRows(e.work.filter((w) => w.track === "media"))}
          {!e.closed && canCreate("request") && (
            <Link
              className="button secondary"
              href={linked("request") + "&track=media"}
            >
              إنشاء طلب تصميم
            </Link>
          )}
        </section>
        <section className="event-section">
          <h2>ملفات الفعالية</h2>
          {e.files.map((f) => (
            <a
              className="event-line"
              key={f.id}
              href={`/api/events/files/${f.id}`}
            >
              <Paperclip size={18} />
              <span>
                {f.name}
                <small>
                  {f.category} · {Math.ceil(f.size / 1024)} كيلوبايت
                </small>
              </span>
            </a>
          ))}
          {!e.files.length && (
            <p className="event-empty">لا توجد ملفات متاحة بعد.</p>
          )}
          {e.permissions.manage_files &&
            !e.closed &&
            !["pending", "approved"].includes(e.report?.status || "") && (
              <Form
                busy={busy || uploading}
                label="رفع ملف محمي"
                submit={async (f) => {
                  setUploading(true);
                  fail("");
                  try {
                    const r = await fetch(`/api/events/${e.id}/files`, {
                      method: "POST",
                      body: f,
                    });
                    const result = await r.json();
                    if (!r.ok) throw new Error(result.message);
                    await refresh();
                  } catch (err) {
                    fail((err as Error).message);
                  } finally {
                    setUploading(false);
                  }
                }}
              >
                <label>
                  الملف (PNG / JPEG / TXT، حتى ٥ ميغابايت)
                  <input
                    name="file"
                    type="file"
                    accept=".png,.jpg,.jpeg,.txt"
                    required
                  />
                </label>
                <label>
                  تصنيف الملف
                  <select name="category">
                    {[
                      "التصاميم",
                      "الخطط",
                      "القوائم",
                      "الشهادات",
                      "الفواتير",
                      "التقرير",
                      "صور التوثيق",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  صلاحية الملف
                  <select name="visibility">
                    <option value="team">قارئو الفعالية</option>
                    {e.permissions.manage_participants && (
                      <option value="participants">
                        مديرو بيانات المشاركين
                      </option>
                    )}
                    {e.permissions.view_budget && (
                      <option value="budget">أصحاب الصلاحية المالية</option>
                    )}
                  </select>
                </label>
              </Form>
            )}
        </section>
      </>
    );
  if (tab === "report") {
    const fields = [
      ["summary", "الملخص"],
      ["objectives", "الأهداف"],
      ["execution", "ما تم تنفيذه"],
      ["results", "النتائج"],
      ["challenges", "التحديات"],
      ["recommendations", "التوصيات"],
      ["evaluation", "التقييم"],
      ["lessons", "الدروس المستفادة"],
    ];
    return (
      <section className="event-section">
        <h2>التقرير النهائي والدروس المستفادة</h2>
        <p>
          الحضور الفعلي:{" "}
          {e.attendance.find((a) => a.status === "present")?.count || 0} ·
          الملفات والصور محفوظة في قسم ملفات الفعالية.
        </p>
        {e.budget && (
          <p>
            المصروف الفعلي:{" "}
            {e.budget.actualSpend === null
              ? "لم يسجل"
              : `${(e.budget.actualSpend / 100).toFixed(2)} ريال`}
          </p>
        )}
        {e.report && (
          <p>حالة التقرير: {stateLabels[e.report.status] || "مسودة"}</p>
        )}
        {e.permissions.update &&
        !e.closed &&
        ["evaluation", "final_report"].includes(e.status) &&
        !["pending", "approved"].includes(e.report?.status || "") ? (
          <Form
            busy={busy}
            label="حفظ التقرير"
            submit={async (f) =>
              perform(
                "report",
                Object.fromEntries(fields.map(([k]) => [k, text(f, k)])),
              )
            }
          >
            {fields.map(([k, label]) => (
              <label key={k}>
                {label}
                <textarea
                  name={k}
                  required
                  minLength={2}
                  defaultValue={e.report?.[k as "summary"] || ""}
                />
              </label>
            ))}
          </Form>
        ) : e.report ? (
          <dl className="event-report">
            {fields.map(([k, l]) => (
              <div key={k}>
                <dt>{l}</dt>
                <dd>{e.report?.[k as "summary"]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="event-empty">
            يبدأ التقرير في مرحلة التقييم بعد تنفيذ الفعالية.
          </p>
        )}
        {e.report &&
          e.permissions.submit &&
          !e.closed &&
          e.status === "final_report" &&
          !["pending", "approved"].includes(e.report.status) && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void perform("submit-report")}
            >
              تقديم التقرير للمراجعة
            </button>
          )}
      </section>
    );
  }
  return (
    <section className="event-section">
      <h2>ذاكرة الفعالية</h2>
      <div className="event-timeline">
        {e.timeline.map((t) => (
          <div key={t.id}>
            <span className="status-dot" />
            <div>
              <strong>{t.label}</strong>
              <small>{date(t.createdAt)}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
