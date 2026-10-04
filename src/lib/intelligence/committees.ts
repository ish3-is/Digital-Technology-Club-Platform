/**
 * Governance linkage and committee health.
 *
 * Governance linkage states only what is explicitly linked — "this work item is
 * linked to initiative X" — and never infers that an activity caused a KPI to
 * improve, because no such causal evidence exists in the data.
 *
 * Committee health reports explainable statuses rather than a score. There is
 * no 82/100 here: each status names the numbers behind it.
 */
import type { Snapshots } from "./snapshots";
import { eventIntelligence } from "./readiness";
import type { TimeRange } from "./provenance";

// ------------------------------------------------------ governance linkage --

export type LinkedEvidence = {
  type: "event" | "task" | "request" | "meeting" | "decision";
  id: string;
  label: string;
  href: string;
  /** The explicit link that produced this row. */
  linkType: string;
};

export type GovernanceLinkage = {
  goalId: string;
  goalTitle: string;
  goalStatus: string;
  initiatives: {
    id: string;
    title: string;
    status: string;
    kpis: {
      id: string;
      name: string;
      status: string;
      currentValue: number | null;
      targetValue: number | null;
      unit: string;
      measurementCount: number;
      lastMeasuredAt: Date | null;
      /** Plain explanation of how the KPI value is derived. */
      explainability: {
        formula: string;
        sourceTables: string[];
        lastUpdated: Date | null;
        available: boolean;
        reasonUnavailable?: string;
      };
    }[];
  }[];
  supporting: LinkedEvidence[];
  /** States plainly that no causal claim is made. */
  causalityNote: string;
};

export function governanceLinkage(snap: Snapshots): GovernanceLinkage[] {
  // `initiative_links` is the explicit join table: a row here is the only thing
  // that makes two records related. Titles are never matched to guess a link.
  const linkTargets = (initiativeId: string) =>
    snap.initiativeLinks.filter((l) => l.initiativeId === initiativeId);

  return snap.goals.map((goal) => {
    const initiatives = snap.initiatives.filter((i) => i.goalId === goal.id);
    // `initiative_links` only points at Work entities, so the KPIs shown under
    // an initiative are the ones attached to the same goal. That is a stated
    // relationship, not a guess about which KPI belongs to which initiative.
    const kpisFor = (_initiativeId: string) =>
      snap.kpis.filter((k) => k.goalId === goal.id);
    const measure = (kpiId: string) => {
      const rows = snap.measurements
        .filter((m) => m.kpiId === kpiId)
        .sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime());
      return rows;
    };

    const supporting: LinkedEvidence[] = [];
    for (const initiative of initiatives)
      for (const link of linkTargets(initiative.id)) {
        const href = hrefForLink(link.linkType, link.linkedId);
        if (!href) continue;
        supporting.push({
          type: link.linkType as LinkedEvidence["type"],
          id: link.linkedId,
          label: labelForLink(snap, link.linkType, link.linkedId),
          href,
          linkType: link.linkType,
        });
      }

    return {
      goalId: goal.id,
      goalTitle: goal.title,
      goalStatus: goal.status,
      initiatives: initiatives.map((initiative) => ({
        id: initiative.id,
        title: initiative.title,
        status: initiative.status,
        kpis: kpisFor(initiative.id).map((k) => {
          const rows = measure(k.id);
          const last = rows[0];
          return {
            id: k.id,
            name: k.name,
            status: k.status,
            currentValue: k.currentValue,
            targetValue: k.targetValue,
            unit: k.unit,
            measurementCount: rows.length,
            lastMeasuredAt: last?.measuredAt ?? null,
            explainability: {
              formula:
                "القيمة الحالية تُقرأ من آخر قياس مسجل لهذا المؤشر؛ لا تُستنتج من أي مصدر آخر",
              sourceTables: ["kpis", "kpi_measurements"],
              lastUpdated: last?.measuredAt ?? null,
              available: last !== undefined,
              reasonUnavailable:
                last === undefined ? "لا يوجد قياس مسجل لهذا المؤشر بعد" : undefined,
            },
          };
        }),
      })),
      supporting: supporting.slice(0, 40),
      causalityNote:
        "تظهر هنا السجلات المرتبطة عبر جدول الربط الصريح فقط. لا يُذكر أن نشاطًا سبّب تحسن مؤشر، لأن البيانات لا تحتوي على دليل سببية.",
    };
  });
}

function hrefForLink(linkType: string, id: string): string | null {
  switch (linkType) {
    case "event":
      return `/events/${id}`;
    case "task":
    case "request":
    case "meeting":
    case "decision":
      return `/work?item=${id}`;
    case "event":
      return `/events/${id}`;
    default:
      return null;
  }
}

function labelForLink(snap: Snapshots, linkType: string, id: string): string {
  switch (linkType) {
    case "event":
      return snap.events.find((e) => e.id === id)?.title ?? id;
    case "kpi":
      return snap.kpis.find((k) => k.id === id)?.name ?? id;
    case "evidence":
      return snap.evidence.find((e) => e.id === id)?.title ?? id;
    case "work":
    case "task":
      return snap.work.find((w) => w.id === id)?.title ?? id;
    case "report":
      return snap.reports.find((r) => r.id === id)?.title ?? id;
    default:
      return id;
  }
}

/** The same linkage expressed for a single KPI card. */
export function kpiExplainability(
  snap: Snapshots,
  kpiId: string,
) {
  const kpi = snap.kpis.find((k) => k.id === kpiId);
  if (!kpi) return null;
  const measurements = snap.measurements
    .filter((m) => m.kpiId === kpiId)
    .sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime());
  const evidence = snap.evidence.filter(
    (e) => e.sourceEntityType === "kpi" && e.sourceEntityId === kpiId,
  );
  return {
    id: kpi.id,
    name: kpi.name,
    currentValue: kpi.currentValue,
    targetValue: kpi.targetValue,
    unit: kpi.unit,
    direction: kpi.direction,
    formula:
      "القيمة الحالية = آخر قياس مسجل. القيمة المستهدفة تُدخل يدويًا عند تعريف المؤشر، ولا تُحسَب من السجلات.",
    numerator: measurements[0]?.value ?? null,
    denominator: null,
    sources: [
      ...measurements.map((m) => ({
        type: "measurement" as const,
        id: m.id,
        label: m.value.toString(),
        measuredAt: m.measuredAt,
      })),
      ...evidence.map((e) => ({ type: "evidence" as const, id: e.id, label: e.title })),
    ],
    sourceTables: ["kpis", "kpi_measurements", "evidence"],
    lastUpdated: measurements[0]?.measuredAt ?? null,
    available: measurements.length > 0,
    reasonUnavailable:
      measurements.length === 0 ? "لا يوجد قياس مسجل لهذا المؤشر حتى الآن" : undefined,
  };
}

// ------------------------------------------------------- committee health --

export type CommitteeStatus = {
  key: string;
  label: string;
  /** The concrete numbers behind the status. */
  basis: string[];
};

export type CommitteeIntelligence = {
  id: string;
  name: string;
  description: string;
  leadership: { name: string; role: string }[];
  activeMembers: number | null;
  openWork: number;
  overdue: number;
  inReview: number;
  requestsSent: number;
  requestsReceived: number;
  upcomingEventResponsibilities: number;
  volunteerHours: number | null;
  attendanceInvolvement: number;
  openRequests: number;
  statuses: CommitteeStatus[];
  /** No single health score, and this says so explicitly. */
  scoreNote: string;
  recentActivity: { title: string; href: string; at: Date }[];
  operationsQueue: Record<string, number>;
};

/**
 * Committee health without a score. Each status is derived from a visible rule
 * and carries the numbers it fired on, so "ضغط مرتفع" is always explainable.
 */
export function committeeIntelligence(
  snap: Snapshots,
  now = new Date(),
): CommitteeIntelligence[] {
  const in14 = new Date(now.getTime() + 14 * 86_400_000);
  const activePlacement = new Map<string, number>();
  for (const c of snap.committeeHistory)
    if (c.endAt === null) activePlacement.set(c.committeeId, (activePlacement.get(c.committeeId) ?? 0) + 1);

  return snap.committees.map((committee) => {
    const work = snap.work.filter((w) => w.committeeId === committee.id);
    const open = work.filter((w) => w.status !== "completed" && w.status !== "cancelled");
    const overdue = open.filter((w) => w.dueAt && w.dueAt < now);
    const inReview = work.filter((w) => w.status === "review");
    const sent = snap.requests.filter((r) => snap.requestOrigin.get(r.id) === committee.id).length;
    const received = snap.requests.filter((r) => r.receivingCommitteeId === committee.id).length;
    const upcomingEvents = snap.events.filter(
      (e) => e.committeeId === committee.id && e.dueAt && e.dueAt >= now && e.dueAt <= in14,
    );
    const hours = snap.volunteerHours.filter((h) => {
      if (h.status !== "approved") return false;
      const placed = snap.committeeHistory.find(
        (c) => c.userId === h.memberId && c.endAt === null,
      );
      return placed?.committeeId === committee.id;
    });
    const attendance = snap.attendance.filter((a) => {
      const event = snap.events.find((e) => e.id === a.eventId);
      return event?.committeeId === committee.id;
    });
    const operationsQueue: Record<string, number> = {};
    if (snap.capability.media)
      for (const m of snap.media)
        if (m.committeeId === committee.id)
          operationsQueue.media = (operationsQueue.media ?? 0) + 1;
    if (snap.capability.digital)
      for (const d of snap.digitalRequests)
        if (d.committeeId === committee.id)
          operationsQueue.digital = (operationsQueue.digital ?? 0) + 1;

    const statuses: CommitteeStatus[] = [];
    const openShare = open.length ? Math.round((overdue.length / open.length) * 100) : 0;
    if (overdue.length === 0)
      statuses.push({ key: "workload", label: "ضغط العمل: منخفض", basis: [`${open.length} مهمة مفتوحة`, "لا توجد متأخرات"] });
    else if (openShare >= 40)
      statuses.push({
        key: "workload",
        label: "ضغط العمل: مرتفع",
        basis: [`${open.length} مهمة مفتوحة`, `${overdue.length} متأخرة (${openShare}٪)`],
      });
    else
      statuses.push({
        key: "workload",
        label: "ضغط العمل: متوسط",
        basis: [`${open.length} مهمة مفتوحة`, `${overdue.length} متأخرة (${openShare}٪)`],
      });
    statuses.push({
      key: "events",
      label: upcomingEvents.length >= 3 ? "فعاليات قريبة: مرتفعة" : "فعاليات قريبة: مقبولة",
      basis: [`${upcomingEvents.length} فعالية خلال ١٤ يومًا`],
    });
    statuses.push({
      key: "requests",
      label: received >= 5 ? "طلبات واردة: مرتفعة" : "طلبات واردة: مقبولة",
      basis: [`أرسلت ${sent} طلبًا`, `استقبلت ${received} طلبًا`],
    });
    statuses.push({
      key: "reporting",
      label: inReview.length >= 3 ? "مراجعات متراكمة" : "المراجعات ضمن المعتاد",
      basis: [`${inReview.length} عنصر بانتظار المراجعة`],
    });

    return {
      id: committee.id,
      name: committee.name,
      description: committee.description ?? "",
      leadership: committeeLeadership(snap, committee.id),
      activeMembers: activePlacement.get(committee.id) ?? 0,
      openWork: open.length,
      overdue: overdue.length,
      inReview: inReview.length,
      requestsSent: sent,
      requestsReceived: received,
      upcomingEventResponsibilities: upcomingEvents.length,
      volunteerHours:
        hours.length > 0 ? hours.reduce((sum, h) => sum + h.hours, 0) : null,
      attendanceInvolvement: attendance.length,
      openRequests: received,
      statuses,
      scoreNote:
        "لا تُحسب درجة صحة للجنة. كل حالة أدناه مشتقة من أرقام معروضة فيвойضها، ويمكن تتبّعها إلى السجلات الأصلية.",
      recentActivity: work
        .slice()
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 5)
        .map((w) => ({ title: w.title, href: `/work?item=${w.id}`, at: w.updatedAt })),
      operationsQueue,
    };
  });
}

/** Committee leadership, resolved from role assignments rather than invented. */
function committeeLeadership(snap: Snapshots, committeeId: string) {
  return snap.leadership
    .filter((l) => l.committeeId === committeeId)
    .map((l) => ({ name: l.name, role: l.role }));
}

/** Committee-level operations detail, used by the committee intelligence page. */
export function committeeOperationsDetail(snap: Snapshots, committeeId: string) {
  return {
    media: snap.capability.media
      ? snap.media.filter((m) => m.committeeId === committeeId)
      : null,
    digital: snap.capability.digital
      ? snap.digitalRequests.filter((d) => d.committeeId === committeeId)
      : null,
    assets: snap.capability.resources
      ? snap.assets.filter((a) => a.committeeId === committeeId)
      : null,
  };
}

/** Workload breakdown used by the operations and committee charts. */
export function workloadBreakdown(snap: Snapshots, now = new Date()) {
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const byStatus: Record<string, number> = {};
  for (const w of snap.work)
    if (w.status !== "cancelled") byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
  const open = snap.work.filter((w) => w.status !== "completed" && w.status !== "cancelled");
  return {
    byStatus,
    open: open.length,
    overdue: open.filter((w) => w.dueAt && w.dueAt < now).length,
    dueSoon: open.filter((w) => w.dueAt && w.dueAt >= now && w.dueAt <= in7).length,
    unassigned: open.filter((w) => !snap.workAssignments.some((a) => a.workId === w.id)).length,
    inReview: snap.work.filter((w) => w.status === "review").length,
    eventLinked: open.filter((w) => w.eventId).length,
  };
}

/** A compact executive summary used by the executive page and the brief. */
export function executiveSummary(snap: Snapshots, range: TimeRange, now = new Date()) {
  const events = eventIntelligence(snap, now);
  return {
    term: snap.term
      ? { id: snap.term.id, name: snap.term.name, startAt: snap.term.startAt, endAt: snap.term.endAt }
      : null,
    committees: snap.committees.length,
    members: snap.members.length,
    upcomingEvents: events.filter((e) => e.dueAt && e.dueAt >= now).length,
    completedEvents: events.filter((e) => ["completed", "final_report", "archived"].includes(e.status))
      .length,
    pendingApprovals: snap.approvals.length,
    openRequests: snap.requests.length,
    range: { from: range.from, to: range.to, label: range.labelAr },
  };
}