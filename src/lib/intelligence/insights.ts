/**
 * Deterministic operational insights.
 *
 * Every rule here is a plain comparison over stored records. Nothing is
 * generated, inferred, or scored — an insight fires because a specific
 * condition holds, and it always names that condition and links to the record
 * that triggered it.
 */
import type { Snapshots } from "./snapshots";
import { eventIntelligence } from "./readiness";

export type InsightSeverity = "info" | "attention" | "important" | "critical";

export type Insight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  /** The condition that fired, stated as a fact with its numbers. */
  explanation: string;
  source: string;
  relatedEntity: { type: string; id: string; label: string };
  href: string;
  generatedAt: string;
};

export const severityLabels: Record<InsightSeverity, string> = {
  info: "معلومة",
  attention: "للمتابعة",
  important: "مهم",
  critical: "عاجل",
};

export function insights(snap: Snapshots, now = new Date()): Insight[] {
  const out: Insight[] = [];
  const at = now.toISOString();
  const in7 = new Date(now.getTime() + 7 * 86_400_000);

  const push = (
    id: string,
    severity: InsightSeverity,
    title: string,
    explanation: string,
    source: string,
    relatedEntity: Insight["relatedEntity"],
    href: string,
  ) => out.push({ id, severity, title, explanation, source, relatedEntity, href, generatedAt: at });

  // --- Work -------------------------------------------------------------
  const overdue = snap.work.filter(
    (w) => w.dueAt && w.dueAt < now && w.status !== "completed" && w.status !== "cancelled",
  );
  if (overdue.length)
    push(
      "work.overdue",
      overdue.length >= 10 ? "critical" : overdue.length >= 4 ? "important" : "attention",
      "مهام تجاوزت موعدها",
      `${overdue.length} مهمة تجاوزت تاريخ الاستحقاق ولم تكتمل بعد`,
      "work_items",
      { type: "work", id: overdue[0].id, label: overdue[0].title },
      "/work?kind=task&overdue=1",
    );

  // --- Events ------------------------------------------------------------
  const events = eventIntelligence(snap, now);
  for (const e of events) {
    if (!e.dueAt || e.dueAt < now) continue;
    const daysAway = Math.round((e.dueAt.getTime() - now.getTime()) / 86_400_000);
    if (daysAway <= 7 && e.readinessPercent !== null && e.readinessPercent < 100)
      push(
        `event.readiness.${e.id}`,
        daysAway <= 3 ? "critical" : "important",
        `فعالية خلال ${daysAway} أيام بلا اكتمال المتطلبات`,
        `${e.title}: اكتمل ${e.completed} من ${e.total} متطلبًا (${e.readinessPercent}٪)`,
        "events",
        { type: "event", id: e.id, label: e.title },
        `/events/${e.id}`,
      );
  }

  // --- Finance -----------------------------------------------------------
  if (snap.capability.finance) {
    const unreconciled = snap.purchases.filter((p) => p.reconciliationStatus === "pending");
    if (unreconciled.length)
      push(
        "finance.unreconciled",
        unreconciled.length >= 5 ? "important" : "attention",
        "مشتريات لم تُطابَق",
        `${unreconciled.length} عملية شراء مسجلة ولم تُطابَق بعد`,
        "operation_purchases",
        { type: "purchase", id: unreconciled[0].id, label: unreconciled[0].vendor },
        "/operations/finance",
      );
    const approvedNoPurchase = snap.expenses.filter((e) => e.status === "approved");
    if (approvedNoPurchase.length)
      push(
        "finance.approved_no_purchase",
        "attention",
        "طلبات معتمدة لم يُسجَّل شراؤها",
        `${approvedNoPurchase.length} طلب مصروف معتمد ولم يُسجَّل له شراء`,
        "operation_expense_requests",
        { type: "expense", id: approvedNoPurchase[0].id, label: approvedNoPurchase[0].title },
        "/operations/finance",
      );
    const awaiting = snap.expenses.filter((e) => ["submitted", "finance_review"].includes(e.status));
    if (awaiting.length)
      push(
        "finance.awaiting",
        "attention",
        "طلبات مصروف بانتظار المراجعة",
        `${awaiting.length} طلب مصروف في انتظار مراجعة أو قرار`,
        "operation_expense_requests",
        { type: "expense", id: awaiting[0].id, label: awaiting[0].title },
        "/operations/finance",
      );
  }

  // --- Media -------------------------------------------------------------
  if (snap.capability.media) {
    const waitingReview = snap.media.filter((r) => r.status === "in_review");
    if (waitingReview.length)
      push(
        "media.waiting_review",
        waitingReview.length >= 5 ? "important" : "attention",
        "مخرجات إعلامية بانتظار المراجعة",
        `${waitingReview.length} طلب إعلامي في حالة «بانتظار المراجعة»`,
        "operation_media_requests",
        { type: "media", id: waitingReview[0].id, label: waitingReview[0].title },
        "/operations/media",
      );
    const mediaOverdue = snap.media.filter(
      (r) => r.deadline && r.deadline < now && !["approved", "scheduled", "published", "completed"].includes(r.status),
    );
    if (mediaOverdue.length)
      push(
        "media.overdue",
        "important",
        "طلبات إعلامية تجاوزت موعدها",
        `${mediaOverdue.length} طلب إعلامي تجاوز تاريخ التسليم المسجل ولم يكتمل`,
        "operation_media_requests",
        { type: "media", id: mediaOverdue[0].id, label: mediaOverdue[0].title },
        "/operations/media",
      );
  }

  // --- Digital -----------------------------------------------------------
  if (snap.capability.digital) {
    const waiting = snap.digitalRequests.filter((r) => r.status === "waiting_input");
    if (waiting.length)
      push(
        "digital.waiting_input",
        "attention",
        "خدمات رقمية تنتظر مدخلات",
        `${waiting.length} طلب خدمة رقمية معلّق بانتظار رد مقدم الطلب`,
        "operation_digital_requests",
        { type: "digital", id: waiting[0].id, label: waiting[0].title },
        "/operations/digital",
      );
  }

  // --- Resources ---------------------------------------------------------
  if (snap.capability.resources) {
    const incidents = snap.incidents.filter((i) => i.status === "open");
    if (incidents.length)
      push(
        "resource.incidents",
        incidents.length >= 3 ? "important" : "attention",
        "بلاغات أصول مفتوحة",
        `${incidents.length} بلاغ على أصل لم يُغلق بعد`,
        "operation_asset_incidents",
        { type: "asset_incident", id: incidents[0].id, label: incidents[0].details },
        "/operations/resources",
      );
    const overdueReservations = snap.reservations.filter(
      (r) => ["approved", "checked_out"].includes(r.status) && r.endsAt < now,
    );
    if (overdueReservations.length)
      push(
        "resource.overdue",
        "important",
        "حجوزات تجاوزت موعد الإرجاع",
        `${overdueReservations.length} حجز تجاوز تاريخ الإرجاع المسجل`,
        "operation_asset_reservations",
        { type: "reservation", id: overdueReservations[0].id, label: overdueReservations[0].purpose },
        "/operations/resources",
      );
  }

  // --- Governance --------------------------------------------------------
  const staleKpis = snap.kpis.filter((k) => {
    if (k.status !== "active") return false;
    const last = snap.measurements
      .filter((m) => m.kpiId === k.id)
      .sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime())[0];
    return !last || last.measuredAt < in7;
  });
  if (staleKpis.length)
    push(
      "governance.kpi_stale",
      "attention",
      "مؤشرات بلا قياس حديث",
      `${staleKpis.length} مؤشرًا نشطًا بلا قياس خلال آخر ٧ أيام`,
      "kpis",
      { type: "kpi", id: staleKpis[0].id, label: staleKpis[0].name },
      "/governance?tab=kpis",
    );

  const reportsWaiting = snap.reports.filter((r) => ["submitted", "under_review"].includes(r.status));
  if (reportsWaiting.length)
    push(
      "governance.reports_waiting",
      "attention",
      "تقارير بانتظار المراجعة",
      `${reportsWaiting.length} تقريرًا في انتظار المراجعة أو الاعتماد`,
      "reports",
      { type: "report", id: reportsWaiting[0].id, label: reportsWaiting[0].title },
      "/governance?tab=reports",
    );

  const order: Record<InsightSeverity, number> = { critical: 0, important: 1, attention: 2, info: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Capacity signals — deterministic flags, never productivity inferences and
 * never a judgement about any person.
 */
export type CapacitySignal = {
  key: string;
  title: string;
  detail: string;
  active: boolean;
  href: string;
};

export function capacitySignals(snap: Snapshots, now = new Date()): CapacitySignal[] {
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const open = snap.work.filter((w) => w.status !== "completed" && w.status !== "cancelled");
  const assignedIds = new Set(snap.workAssignments.map((a) => a.workId));
  const unassigned = open.filter((w) => !assignedIds.has(w.id));
  const dueSoon = open.filter((w) => w.dueAt && w.dueAt >= now && w.dueAt <= in7);
  const receiving = new Map<string, number>();
  for (const r of snap.requests)
    receiving.set(r.receivingCommitteeId, (receiving.get(r.receivingCommitteeId) ?? 0) + 1);
  const busiest = [...receiving.entries()].sort((a, b) => b[1] - a[1])[0];
  const committeeName = busiest
    ? (snap.committees.find((c) => c.id === busiest[0])?.name ?? "لجنة")
    : "";

  const eventsIn14 = snap.events.filter(
    (e) => e.dueAt && e.dueAt >= now && e.dueAt <= new Date(now.getTime() + 14 * 86_400_000),
  );

  return [
    {
      key: "high_open_workload",
      title: "حجم العمل المفتوح مرتفع",
      detail: `${open.length} عنصر عمل مفتوح عبر النادي`,
      active: open.length >= 20,
      href: "/work?kind=task",
    },
    {
      key: "many_unassigned",
      title: "مهام بلا مسؤول",
      detail: `${unassigned.length} مهمة مفتورة لم يُسند لها`,
      active: unassigned.length >= 3,
      href: "/work?kind=task",
    },
    {
      key: "deadline_cluster",
      title: "تكدّس مواعيد خلال أسبوع",
      detail: `${dueSoon.length} مهمة موعدها خلال ٧ أيام`,
      active: dueSoon.length >= 8,
      href: "/work?kind=task",
    },
    {
      key: "request_demand",
      title: "لجنة تستقبل طلبات أكثر",
      detail: busiest
        ? `${committeeName} تستقبل ${busiest[1]} طلبًا`
        : "لا توجد طلبات موزعة على لجان مسجلة",
      active: (busiest?.[1] ?? 0) >= 4,
      href: "/work?kind=request",
    },
    {
      key: "event_cluster",
      title: "فعاليات متقاربة",
      detail: `${eventsIn14.length} فعالية خلال ١٤ يومًا`,
      active: eventsIn14.length >= 3,
      href: "/events",
    },
  ];
}