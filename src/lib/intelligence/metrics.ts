/**
 * Derived metrics.
 *
 * Each function turns a scoped snapshot into `Metric` objects that carry their
 * own formula, denominator and source list. Nothing here invents a value: when
 * the denominator does not exist the metric reports itself unavailable.
 */
import * as s from "@/db/schema";
import type { Snapshots } from "./snapshots";
import {
  buildTrend,
  countMetric,
  previousRange,
  ratioMetric,
  unavailableMetric,
  type Metric,
  type MetricSource,
  type TimeRange,
  type Trend,
} from "./provenance";

const rangeMeta = (range: TimeRange) => ({
  from: range.from,
  to: range.to,
  label: range.labelAr,
});

const src = (title: string, href: string, id?: string): MetricSource => ({ title, href, id });

/** Cancelled work is excluded from completion rates: it was never eligible. */
const isEligible = (w: (typeof s.workItems.$inferSelect)) => w.status !== "cancelled";
const isCompleted = (w: (typeof s.workItems.$inferSelect)) => w.status === "completed";

export type ExecutionMetrics = {
  total: Metric;
  completed: Metric;
  completionRate: Metric;
  overdue: Metric;
  open: Metric;
  inReview: Metric;
  unassigned: Metric;
  dueSoon: Metric;
  averageCompletionDays: Metric;
  trends: { completed: Trend; created: Trend };
};

// ---------------------------------------------------------------- execution --

export function executionMetrics(
  snap: Snapshots,
  range: TimeRange,
  now = new Date(),
): ExecutionMetrics {
  const created = snap.work.filter((w) => w.createdAt >= range.from && w.createdAt <= range.to);
  const completed = snap.work.filter((w) => isCompleted(w) && w.completedAt && w.completedAt >= range.from && w.completedAt <= range.to);
  const eligible = snap.work.filter(isEligible);
  const eligibleDone = eligible.filter(isCompleted);
  const overdue = snap.work.filter(
    (w) => w.dueAt && w.dueAt < now && !isCompleted(w) && w.status !== "cancelled",
  );
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const dueSoon = snap.work.filter(
    (w) => w.dueAt && w.dueAt >= now && w.dueAt <= soon && !isCompleted(w),
  );
  const open = snap.work.filter((w) => !isCompleted(w) && w.status !== "cancelled");
  const inReview = snap.work.filter((w) => w.status === "review");
  const assignedIds = new Set(snap.workAssignments.map((a) => a.workId));
  const unassigned = snap.work.filter((w) => !isCompleted(w) && !assignedIds.has(w.id));
  // Average duration uses only tasks that actually completed with both dates,
  // so a missing date never skews the average toward zero.
  const dated = completed.filter((w) => w.completedAt && w.createdAt);
  const averageDays =
    dated.length > 0
      ? Math.round(
          (dated.reduce(
            (sum, w) => sum + ((w.completedAt!.getTime() - w.createdAt.getTime()) / 86_400_000),
            0,
          ) /
            dated.length) *
            10,
        ) / 10
      : null;

  const prev = previousRange(range);
  const prevCompleted = snap.work.filter(
    (w) => isCompleted(w) && w.completedAt && w.completedAt >= prev.from && w.completedAt <= prev.to,
  ).length;
  const prevCreated = snap.work.filter(
    (w) => w.createdAt >= prev.from && w.createdAt <= prev.to,
  ).length;

  return {
    total: countMetric({
      key: "tasks_total",
      title: "المهام المسجلة",
      description: "كل المهام ضمن الفترة، بما فيها المكتملة",
      value: created.length,
      sourceDomains: ["work_items"],
      range: rangeMeta(range),
      sources: created.map((w) => src(w.title, `/work?item=${w.id}`, w.id)),
      href: "/work?kind=task",
    }),
    completed: countMetric({
      key: "tasks_completed",
      title: "المهام المكتملة",
      description: "مهام بلغت حالة «مكتملة» خلال الفترة",
      value: completed.length,
      sourceDomains: ["work_items"],
      range: rangeMeta(range),
      sources: completed.map((w) => src(w.title, `/work?item=${w.id}`, w.id)),
      href: "/work?kind=task&status=completed",
    }),
    completionRate: ratioMetric({
      key: "task_completion_rate",
      title: "نسبة إكمال المهام",
      description: "المهام المكتملة من إجمالي المهام غير الملغاة",
      numerator: eligibleDone.length,
      denominator: eligible.length,
      sourceDomains: ["work_items"],
      range: rangeMeta(range),
      formula: "المهام غير الملغاة التي اكتملت ÷ كل المهام غير الملغاة × ١٠٠",
      sources: eligibleDone.map((w) => src(w.title, `/work?item=${w.id}`, w.id)),
      href: "/work?kind=task",
    }),
    overdue: countMetric({
      key: "tasks_overdue",
      title: "المهام المتأخرة",
      description: "مهام تجاوزت موعدها ولم تكتمل بعد",
      value: overdue.length,
      sourceDomains: ["work_items"],
      range: rangeMeta(range),
      sources: overdue.map((w) => src(w.title, `/work?item=${w.id}`, w.id)),
      href: "/work?kind=task&overdue=1",
    }),
    open: countMetric({
      key: "tasks_open",
      title: "المهام المفتوحة",
      description: "مهام لم تكتمل ولم تُلغَ",
      value: open.length,
      sourceDomains: ["work_items"],
      range: rangeMeta(range),
      sources: open.map((w) => src(w.title, `/work?item=${w.id}`, w.id)),
      href: "/work?kind=task",
    }),
    inReview: countMetric({
      key: "tasks_in_review",
      title: "بانتظار المراجعة",
      description: "مهام في حالة المراجعة",
      value: inReview.length,
      sourceDomains: ["work_items"],
      range: rangeMeta(range),
      sources: inReview.map((w) => src(w.title, `/work?item=${w.id}`, w.id)),
      href: "/work?kind=task&status=review",
    }),
    unassigned: countMetric({
      key: "tasks_unassigned",
      title: "مهام بلا مسؤول",
      description: "مهام مفتوحة لم يُسند لها بعد",
      value: unassigned.length,
      sourceDomains: ["work_items"],
      range: rangeMeta(range),
      sources: unassigned.map((w) => src(w.title, `/work?item=${w.id}`, w.id)),
    }),
    dueSoon: countMetric({
      key: "tasks_due_soon",
      title: "مواعيد خلال ٧ أيام",
      description: "مهام مفتوحة موعدها خلال الأسبوع القادم",
      value: dueSoon.length,
      sourceDomains: ["work_items"],
      range: rangeMeta(range),
      sources: dueSoon.map((w) => src(w.title, `/work?item=${w.id}`, w.id)),
    }),
    averageCompletionDays:
      averageDays === null
        ? unavailableMetric({
            key: "average_completion_days",
            title: "متوسط مدة الإكمال",
            description: "الأيام من الإنشاء حتى الإكمال",
            reasonUnavailable: "لا توجد مهام مكتملة بتاريخ بدء وإنهاء داخل الفترة",
            sourceDomains: ["work_items"],
            range: rangeMeta(range),
            unit: "days",
          })
        : countMetric({
            key: "average_completion_days",
            title: "متوسط مدة الإكمال",
            description: "الأيام من الإنشاء حتى الإكمال",
            value: averageDays,
            unit: "days",
            sourceDomains: ["work_items"],
            range: rangeMeta(range),
            formula: "مجموع (تاريخ الإكمال − تاريخ الإنشاء) ÷ عدد المهام المكتملة المؤرخة",
          }),
    trends: {
      completed: buildTrend({
        current: completed.length,
        previous: prevCompleted,
        label: "عدد المهام المكتملة",
      }),
      created: buildTrend({
        current: created.length,
        previous: prevCreated,
        label: "عدد المهام المنشأة",
      }),
    },
  };
}

// ------------------------------------------------------------------ people --

export type PeopleMetrics = {
  activeMembers: Metric;
  membersByStatus: Record<string, number>;
  onboardingInProgress: Metric;
  onboardingComplete: Metric;
  onboardingCompletionRate: Metric;
  approvedVolunteerHours: Metric;
  attendanceRate: Metric;
  placementCount: Metric;
};

export function peopleMetrics(snap: Snapshots, range: TimeRange): PeopleMetrics {
  const active = snap.members.filter((m) => m.status === "active");
  const byStatus = snap.members.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});
  const plans = snap.onboarding;
  const done = plans.filter((p) => p.status === "completed");
  const hours = snap.volunteerHours.filter(
    (h) => h.status === "approved" && h.date >= range.from && h.date <= range.to,
  );
  const approvedHours = hours.reduce((sum, h) => sum + h.hours, 0);
  const attended = snap.attendance.filter((a) => a.status !== "cancelled");
  const present = snap.attendance.filter((a) => a.status === "present");
  const placements = snap.committeeHistory.filter((c) => c.endAt === null);

  return {
    activeMembers: countMetric({
      key: "active_members",
      title: "الأعضاء النشطون",
      description: "ملفات الأعضاء بحالة «نشط»",
      value: active.length,
      sourceDomains: ["member_profiles"],
      range: rangeMeta(range),
      sources: snap.members.map((m) => src("ملف عضو", `/people?member=${m.userId}`, m.userId)),
      href: "/people?tab=members",
    }),
    membersByStatus: byStatus,
    onboardingInProgress: countMetric({
      key: "onboarding_in_progress",
      title: "مسارات تأهيل جارية",
      description: "أعضاء أتموا القبول ولم يكملوا المسار",
      value: plans.filter((p) => p.status === "in_progress").length,
      sourceDomains: ["onboarding_plans"],
      range: rangeMeta(range),
      href: "/people?tab=onboarding",
    }),
    onboardingComplete: countMetric({
      key: "onboarding_complete",
      title: "مسارات تأهيل مكتملة",
      description: "أعضاء أتموا مسار التأهيل كاملًا",
      value: done.length,
      sourceDomains: ["onboarding_plans"],
      range: rangeMeta(range),
      href: "/people?tab=onboarding",
    }),
    onboardingCompletionRate: ratioMetric({
      key: "onboarding_completion_rate",
      title: "نسبة إكمال التأهيل",
      description: "المسارات المكتملة من إجمالي المسارات",
      numerator: done.length,
      denominator: plans.length,
      sourceDomains: ["onboarding_plans", "onboarding_steps"],
      range: rangeMeta(range),
      formula: "المسارات المكتملة ÷ كل المسارات المؤرشفة × ١٠٠",
      href: "/people?tab=onboarding",
    }),
    approvedVolunteerHours: countMetric({
      key: "approved_volunteer_hours",
      title: "الساعات التطوعية المعتمدة",
      description: "مجموع الساعات المعتمدة فقط؛ المعروضة والمسترفضة لا تُحتسب",
      value: approvedHours,
      unit: "hours",
      sourceDomains: ["volunteer_hour_entries"],
      range: rangeMeta(range),
      formula: "مجموع ساعات_entries المعتمدة داخل الفترة",
      href: "/people?tab=hours",
    }),
    attendanceRate: ratioMetric({
      key: "attendance_rate",
      title: "نسبة الحضور",
      description: "الحاضرون من إجمالي السجلات غير الملغاة؛ بلا بيانات شخصية",
      numerator: present.length,
      denominator: attended.length,
      sourceDomains: ["event_attendance"],
      range: rangeMeta(range),
      formula: "الحاضرون ÷ كل سجلات الحضور غير الملغاة × ١٠٠",
      href: "/events",
    }),
    placementCount: countMetric({
      key: "committee_placements",
      title: "التوزيعات النشطة",
      description: "أعضاء موزّعون على لجان بتوزيع لم ينتهِ بعد",
      value: placements.length,
      sourceDomains: ["member_committee_history"],
      range: rangeMeta(range),
      href: "/people?tab=members",
    }),
  };
}

// -------------------------------------------------------------------- work --

export type WorkloadRow = {
  committeeId: string | null;
  committeeName: string;
  open: number;
  overdue: number;
  inReview: number;
  dueSoon: number;
  requestsSent: number;
  requestsReceived: number;
};

export function workloadByCommittee(snap: Snapshots, now = new Date()): WorkloadRow[] {
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const nameOf = new Map(snap.committees.map((c) => [c.id, c.name]));
  const rows = new Map<string, WorkloadRow>();
  const ensure = (id: string | null) => {
    const key = id ?? "none";
    if (!rows.has(key))
      rows.set(key, {
        committeeId: id,
        committeeName: id ? (nameOf.get(id) ?? "لجنة") : "بلا لجنة",
        open: 0,
        overdue: 0,
        inReview: 0,
        dueSoon: 0,
        requestsSent: 0,
        requestsReceived: 0,
      });
    return rows.get(key)!;
  };
  for (const w of snap.work) {
    if (w.status === "completed" || w.status === "cancelled") continue;
    const row = ensure(w.committeeId);
    row.open++;
    if (w.dueAt && w.dueAt < now) row.overdue++;
    if (w.dueAt && w.dueAt >= now && w.dueAt <= soon) row.dueSoon++;
    if (w.status === "review") row.inReview++;
  }
  for (const r of snap.requests) {
    // A request row only names the receiving committee; the sending committee
    // comes from the work item that carries it.
    ensure(snap.requestOrigin.get(r.id) ?? null).requestsSent++;
    ensure(r.receivingCommitteeId).requestsReceived++;
  }
  return [...rows.values()].sort((a, b) => b.open - a.open);
}

// ------------------------------------------------------------- operations --

export type FinanceMetrics = {
  allocated: Metric;
  committed: Metric;
  spent: Metric;
  remaining: Metric;
  utilization: Metric;
  pendingExpenses: Metric;
  unreconciled: Metric;
  available: boolean;
};

export function financeMetrics(snap: Snapshots, range: TimeRange): FinanceMetrics {
  if (!snap.capability.finance)
    return {
      allocated: unavailableMetric({ key: "finance_allocated", title: "المخصص", description: "", reasonUnavailable: "لا تملك صلاحية قراءة البيانات المالية", sourceDomains: ["operation_budgets"], range: rangeMeta(range), unit: "currency" }),
      committed: unavailableMetric({ key: "finance_committed", title: "الملتزم", description: "", reasonUnavailable: "لا تملك صلاحية قراءة البيانات المالية", sourceDomains: ["operation_expense_requests"], range: rangeMeta(range), unit: "currency" }),
      spent: unavailableMetric({ key: "finance_spent", title: "المنصرف", description: "", reasonUnavailable: "لا تملك صلاحية قراءة البيانات المالية", sourceDomains: ["operation_purchases"], range: rangeMeta(range), unit: "currency" }),
      remaining: unavailableMetric({ key: "finance_remaining", title: "المتبقي", description: "", reasonUnavailable: "لا تملك صلاحية قراءة البيانات المالية", sourceDomains: ["operation_budgets"], range: rangeMeta(range), unit: "currency" }),
      utilization: unavailableMetric({ key: "finance_utilization", title: "نسبة الاستهلاك", description: "", reasonUnavailable: "لا تملك صلاحية قراءة البيانات المالية", sourceDomains: ["operation_budgets"], range: rangeMeta(range) }),
      pendingExpenses: unavailableMetric({ key: "finance_pending", title: "طلبات بانتظار الإجراء", description: "", reasonUnavailable: "لا تملك صلاحية قراءة البيانات المالية", sourceDomains: ["operation_expense_requests"], range: rangeMeta(range) }),
      unreconciled: unavailableMetric({ key: "finance_unreconciled", title: "مشتريات غير مطابقة", description: "", reasonUnavailable: "لا تملك صلاحية قراءة البيانات المالية", sourceDomains: ["operation_purchases"], range: rangeMeta(range) }),
      available: false,
    };

  // Spent is derived from the purchase rows, never from the requested amount:
  // a 1,200 request paid at 1,150 is 1,150 spent.
  const spent = snap.purchases
    .filter((p) => p.reconciliationStatus !== "pending")
    .reduce((sum, p) => sum + p.amount, 0);
  const purchasedExpenseIds = new Set(
    snap.purchases.filter((p) => p.reconciliationStatus !== "pending").map((p) => p.expenseId),
  );
  const committed = snap.expenses
    .filter((e) => e.status === "approved" || (e.status === "purchased" && !purchasedExpenseIds.has(e.id)))
    .reduce((sum, e) => sum + e.amount, 0);
  const allocated = snap.budgets.reduce((sum, b) => sum + b.allocatedAmount, 0);
  const pending = snap.expenses.filter((e) => ["submitted", "finance_review", "approved"].includes(e.status));
  const unreconciled = snap.purchases.filter((p) => p.reconciliationStatus === "pending");

  return {
    allocated: countMetric({
      key: "finance_allocated",
      title: "إجمالي المخصص",
      description: "مجموع الميزانيات المعتمدة",
      value: allocated,
      unit: "currency",
      sourceDomains: ["operation_budgets"],
      range: rangeMeta(range),
      sources: snap.budgets.map((b) => src(b.title, `/operations/finance?budget=${b.id}`, b.id)),
      href: "/operations/finance",
    }),
    committed: countMetric({
      key: "finance_committed",
      title: "الملتزم",
      description: "طلبات معتمدة لم تُشترَ بعد",
      value: committed,
      unit: "currency",
      sourceDomains: ["operation_expense_requests"],
      range: rangeMeta(range),
      formula: "مجموع طلبات «معتمد» التي ليس لها شراء مطابق",
      sources: snap.expenses
        .filter((e) => e.status === "approved")
        .map((e) => src(e.title, `/operations/finance?expense=${e.id}`, e.id)),
      href: "/operations/finance",
    }),
    spent: countMetric({
      key: "finance_spent",
      title: "المنصرف فعليًا",
      description: "مبالغ المشتريات المسجلة والمطابقة، لا المبالغ المطلوبة",
      value: spent,
      unit: "currency",
      sourceDomains: ["operation_purchases"],
      range: rangeMeta(range),
      formula: "مجموع مبلغ كل عملية شراء غير معلّقة كـ«بانتظار المطابقة»",
      sources: snap.purchases.map((p) => src(p.vendor, "/operations/finance", p.id)),
      href: "/operations/finance",
    }),
    remaining: countMetric({
      key: "finance_remaining",
      title: "المتبقي",
      description: "المخصص ناقص الملتزم والمنصرف",
      value: allocated - committed - spent,
      unit: "currency",
      sourceDomains: ["operation_budgets", "operation_purchases", "operation_expense_requests"],
      range: rangeMeta(range),
      formula: "المخصص − الملتزم − المنصرف",
      href: "/operations/finance",
    }),
    utilization: ratioMetric({
      key: "finance_utilization",
      title: "نسبة استهلاك الميزانية",
      description: "المستهلك من المخصص",
      numerator: committed + spent,
      denominator: allocated,
      sourceDomains: ["operation_budgets", "operation_purchases"],
      range: rangeMeta(range),
      formula: "(الملتزم + المنصرف) ÷ المخصص × ١٠٠",
      href: "/operations/finance",
    }),
    pendingExpenses: countMetric({
      key: "finance_pending",
      title: "طلبات مصروف بانتظار الإجراء",
      description: "طلبات مرفوعة أو قيد المراجعة أو معتمدة ولم تُشترَ",
      value: pending.length,
      sourceDomains: ["operation_expense_requests"],
      range: rangeMeta(range),
      sources: pending.map((e) => src(e.title, `/operations/finance?expense=${e.id}`, e.id)),
      href: "/operations/finance",
    }),
    unreconciled: countMetric({
      key: "finance_unreconciled",
      title: "مشتريات غير مطابقة",
      description: "عمليات شراء لم تُطابَق بعد",
      value: unreconciled.length,
      sourceDomains: ["operation_purchases"],
      range: rangeMeta(range),
      sources: unreconciled.map((p) => src(p.vendor, "/operations/finance", p.id)),
      href: "/operations/finance",
    }),
    available: true,
  };
}

export type MediaMetrics = {
  byStatus: Record<string, number>;
  inProduction: Metric;
  waitingReview: Metric;
  changesRequested: Metric;
  approved: Metric;
  overdue: Metric;
  total: Metric;
  available: boolean;
};

export function mediaMetrics(snap: Snapshots, range: TimeRange, now = new Date()): MediaMetrics {
  const denied = (key: string, title: string) =>
    unavailableMetric({
      key,
      title,
      description: "",
      reasonUnavailable: "لا تملك صلاحية قراءة الطلبات الإعلامية",
      sourceDomains: ["operation_media_requests"],
      range: rangeMeta(range),
    });
  if (!snap.capability.media)
    return {
      byStatus: {} as Record<string, number>,
      inProduction: denied("media_in_production", "قيد التنفيذ"),
      waitingReview: denied("media_waiting_review", "بانتظار المراجعة"),
      changesRequested: denied("media_changes_requested", "يحتاج تعديلات"),
      approved: denied("media_approved", "معتمد"),
      overdue: denied("media_overdue", "متأخر"),
      total: denied("media_total", "إجمالي الطلبات"),
      available: false,
    };
  const rows = snap.media;
  const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const pick = (status: string) => rows.filter((r) => r.status === status);
  const metric = (key: string, title: string, list: (typeof s.mediaRequests.$inferSelect)[]) =>
    countMetric({
      key,
      title,
      description: `طلبات في حالة ${title}`,
      value: list.length,
      sourceDomains: ["operation_media_requests"],
      range: rangeMeta(range),
      sources: list.map((r) => src(r.title, `/operations/media?request=${r.id}`, r.id)),
      href: "/operations/media",
    });
  return {
    byStatus,
    inProduction: metric("media_in_production", "قيد التنفيذ", pick("in_production")),
    waitingReview: metric("media_waiting_review", "بانتظار المراجعة", pick("in_review")),
    changesRequested: metric("media_changes_requested", "يحتاج تعديلات", pick("changes_requested")),
    approved: metric("media_approved", "معتمد", pick("approved")),
    overdue: metric(
      "media_overdue",
      "متأخر عن الموعد",
      rows.filter((r) => r.deadline && r.deadline < now && ["new", "accepted", "in_production", "in_review", "changes_requested"].includes(r.status)),
    ),
    total: metric("media_total", "إجمالي الطلبات", rows),
    available: true,
  };
}

export type DigitalMetrics = {
  open: Metric;
  completed: Metric;
  waitingInput: Metric;
  activeForms: Metric;
  batches: Metric;
  overdue: Metric;
  byStatus: Record<string, number>;
  available: boolean;
};

export function digitalMetrics(snap: Snapshots, range: TimeRange, now = new Date()): DigitalMetrics {
  const denied = (key: string, title: string) =>
    unavailableMetric({
      key,
      title,
      description: "",
      reasonUnavailable: "لا تملك صلاحية قراءة الخدمات الرقمية",
      sourceDomains: ["operation_digital_requests"],
      range: rangeMeta(range),
    });
  if (!snap.capability.digital)
    return {
      open: denied("digital_open", "طلبات مفتوحة"),
      completed: denied("digital_completed", "طلبات مكتملة"),
      waitingInput: denied("digital_waiting_input", "بانتظار مدخلات"),
      activeForms: denied("digital_forms", "نماذج مفتوحة"),
      batches: denied("digital_batches", "دفعات شهادات"),
      overdue: denied("digital_overdue", "متأخرة"),
      byStatus: {} as Record<string, number>,
      available: false,
    };
  const requests = snap.digitalRequests;
  const byStatus = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const metric = (key: string, title: string, value: number, list: { id: string; title: string }[] = []) =>
    countMetric({
      key,
      title,
      description: `${value} سجل`,
      value,
      sourceDomains: ["operation_digital_requests"],
      range: rangeMeta(range),
      sources: list.map((r) => src(r.title, `/operations/digital?request=${r.id}`, r.id)),
      href: "/operations/digital",
    });
  const openStatuses = ["new", "received", "in_progress", "waiting_input", "in_review"];
  const open = requests.filter((r) => openStatuses.includes(r.status));
  return {
    open: metric("digital_open", "طلبات مفتوحة", open.length, open),
    completed: metric("digital_completed", "طلبات مكتملة", requests.filter((r) => r.status === "completed").length),
    waitingInput: metric("digital_waiting_input", "بانتظار مدخلات", requests.filter((r) => r.status === "waiting_input").length),
    activeForms: countMetric({
      key: "digital_forms",
      title: "نماذج مفتوحة",
      description: "نماذج مسجلة بحالة مفتوحة",
      value: snap.forms.filter((f) => f.status === "active").length,
      sourceDomains: ["operation_digital_forms"],
      range: rangeMeta(range),
      sources: snap.forms.map((f) => src(f.title, "/operations/digital", f.id)),
      href: "/operations/digital",
    }),
    batches: countMetric({
      key: "digital_batches",
      title: "دفعات شهادات",
      description: "دفعات شهادات مسجلة",
      value: snap.batches.length,
      sourceDomains: ["operation_certificate_batches"],
      range: rangeMeta(range),
      sources: snap.batches.map((b) => src(b.title, "/operations/digital", b.id)),
      href: "/operations/digital",
    }),
    overdue: metric(
      "digital_overdue",
      "طلبات تجاوزت موعدها",
      requests.filter((r) => r.deadline && r.deadline < now && openStatuses.includes(r.status)).length,
    ),
    byStatus,
    available: true,
  };
}

export type ResourceMetrics = {
  byAvailability: Record<string, number>;
  byCondition: Record<string, number>;
  available: Metric;
  checkedOut: Metric;
  maintenance: Metric;
  pendingReservations: Metric;
  openIncidents: Metric;
  overdue: Metric;
  available_: boolean;
};

export function resourceMetrics(snap: Snapshots, range: TimeRange, now = new Date()): ResourceMetrics {
  const denied = (key: string, title: string) =>
    unavailableMetric({
      key,
      title,
      description: "",
      reasonUnavailable: "لا تملك صلاحية قراءة الأصول",
      sourceDomains: ["operation_assets"],
      range: rangeMeta(range),
    });
  if (!snap.capability.resources)
    return {
      byAvailability: {} as Record<string, number>,
      byCondition: {} as Record<string, number>,
      available: denied("resource_available", "أصول متاحة"),
      checkedOut: denied("resource_checked_out", "أصول مستلمة"),
      maintenance: denied("resource_maintenance", "أصول تحتاج صيانة"),
      pendingReservations: denied("resource_pending", "حجوزات بانتظار الاعتماد"),
      openIncidents: denied("resource_incidents", "بلاغات مفتوحة"),
      overdue: denied("resource_overdue", "حجوزات تجاوزت موعدها"),
      available_: false,
    };
  const byAvailability = snap.assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.availability] = (acc[a.availability] ?? 0) + 1;
    return acc;
  }, {});
  const byCondition = snap.assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.condition] = (acc[a.condition] ?? 0) + 1;
    return acc;
  }, {});
  const metric = (key: string, title: string, value: number, list: { id: string; name: string }[] = [], href = "/operations/resources") =>
    countMetric({
      key,
      title,
      description: `${value} سجل`,
      value,
      sourceDomains: ["operation_assets"],
      range: rangeMeta(range),
      sources: list.map((r) => src(r.name, `/operations/resources?asset=${r.id}`, r.id)),
      href,
    });
  return {
    byAvailability,
    byCondition,
    available: metric("resource_available", "أصول متاحة", byAvailability.available ?? 0, snap.assets.filter((a) => a.availability === "available")),
    checkedOut: metric("resource_checked_out", "أصول مستلمة", byAvailability.checked_out ?? 0),
    maintenance: metric("resource_maintenance", "أصول تحتاج صيانة", byCondition.maintenance ?? 0),
    pendingReservations: metric("resource_pending", "حجوزات بانتظار الاعتماد", snap.reservations.filter((r) => r.status === "requested").length, [], "/operations/resources"),
    openIncidents: metric("resource_incidents", "بلاغات مفتوحة", snap.incidents.filter((i) => i.status === "open").length),
    overdue: metric("resource_overdue", "حجوزات تجاوزت موعدها", snap.reservations.filter((r) => ["approved", "checked_out"].includes(r.status) && r.endsAt < now).length),
    available_: true,
  };
}