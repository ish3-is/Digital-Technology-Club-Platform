/**
 * Event readiness.
 *
 * Readiness is derived from the requirements that actually exist for an event:
 * its linked Work tasks, the Phase 6 support records attached to it, and its
 * approval and reporting state. Nothing is stored as a percentage — if a
 * dimension has no requirements it leaves the denominator instead of counting
 * as zero.
 */
import * as s from "@/db/schema";
import type { Snapshots } from "./snapshots";
import { safeNumber } from "./snapshots";

export type ReadinessDimension = {
  key: string;
  title: string;
  /** Whether this dimension applies to this event at all. */
  applicable: boolean;
  completed: number;
  pending: number;
  overdue: number;
  blocked: number;
  total: number;
  percent: number | null;
  /** Arabic explanation shown when the dimension has no denominator. */
  note?: string;
  href?: string;
};

export type EventReadiness = {
  eventId: string;
  eventTitle: string;
  percent: number | null;
  completed: number;
  pending: number;
  overdue: number;
  blocked: number;
  total: number;
  dimensions: ReadinessDimension[];
  /** Why the headline is unavailable, when it is. */
  reasonUnavailable?: string;
  /** Deterministic statement describing the state, never a bare number. */
  statement: string;
};

const settledWork = (status: string) => ["completed", "cancelled"].includes(status);

/**
 * Builds the requirement list for one event.
 *
 * A requirement is something that must be finished for the event to be ready:
 * a linked task, a linked media or digital request, an approved expense, a
 * confirmed resource reservation, or the event's own approval/report state.
 */
type Requirement = {
  key: string;
  title: string;
  dimension: string;
  status: string;
  dueAt: Date | null;
  href: string;
  blocked: boolean;
};

export function eventReadiness(
  snap: Snapshots,
  eventId: string,
  now = new Date(),
): EventReadiness | null {
  const event = snap.events.find((e) => e.id === eventId);
  if (!event) return null;

  const requirements: Requirement[] = [];

  // Planning work linked to this event.
  for (const w of snap.work)
    if (w.eventId === eventId)
      requirements.push({
        key: `work:${w.id}`,
        title: w.title,
        dimension: "planning",
        status: w.status,
        dueAt: w.dueAt,
        href: `/work?item=${w.id}`,
        blocked: w.status === "review",
      });

  // Media deliverables.
  for (const m of snap.media)
    if (m.eventId === eventId)
      requirements.push({
        key: `media:${m.id}`,
        title: m.title,
        dimension: "media",
        status: m.status,
        dueAt: m.deadline,
        href: `/operations/media?request=${m.id}`,
        blocked: m.status === "changes_requested",
      });

  // Digital services.
  for (const d of snap.digitalRequests)
    if (d.eventId === eventId)
      requirements.push({
        key: `digital:${d.id}`,
        title: d.title,
        dimension: "digital",
        status: d.status,
        dueAt: d.deadline,
        href: `/operations/digital?request=${d.id}`,
        blocked: d.status === "waiting_input",
      });

  // Finance approvals.
  for (const e of snap.expenses)
    if (e.eventId === eventId)
      requirements.push({
        key: `expense:${e.id}`,
        title: e.title,
        dimension: "finance",
        status: e.status,
        dueAt: e.neededBy,
        href: `/operations/finance?expense=${e.id}`,
        blocked: e.status === "changes_requested",
      });

  // Resource bookings.
  for (const r of snap.reservations)
    if (r.eventId === eventId)
      requirements.push({
        key: `reservation:${r.id}`,
        title: r.purpose,
        dimension: "resources",
        status: r.status,
        dueAt: r.startsAt,
        href: `/operations/resources?reservation=${r.id}`,
        blocked: false,
      });

  // Event reporting, when the event requires a report.
  if (event.reportRequired) {
    const report = snap.reports.find((r) => r.title.includes(event.title));
    requirements.push({
      key: `report:${eventId}`,
      title: report ? `تقرير: ${report.title}` : "التقرير النهائي",
      dimension: "reporting",
      status: report?.status ?? "missing",
      dueAt: null,
      href: "/governance?tab=reports",
      blocked: !report,
    });
  }

  const dimensions: ReadinessDimension[] = [
    dimensionFor("planning", "مهام التخطيط", requirements, "/work?kind=task"),
    dimensionFor("organization", "التنظيم", requirements, "/events"),
    dimensionFor("media", "الإعلام", requirements, "/operations/media"),
    dimensionFor("digital", "الخدمات الرقمية", requirements, "/operations/digital"),
    dimensionFor("finance", "المالية", requirements, "/operations/finance"),
    dimensionFor("resources", "الموارد", requirements, "/operations/resources"),
    dimensionFor("approvals", "الاعتمادات", requirements, "/events"),
    dimensionFor("reporting", "التقرير النهائي", requirements, "/governance?tab=reports"),
  ].filter((d) => d.applicable);

  const completed = requirements.filter((r) => settledWork(r.status)).length;
  const overdue = requirements.filter(
    (r) => r.dueAt && r.dueAt < now && !settledWork(r.status),
  ).length;
  const blocked = requirements.filter((r) => r.blocked && !settledWork(r.status)).length;
  const pending = requirements.length - completed - blocked;
  const total = requirements.length;
  // A dimension the viewer cannot read is excluded rather than counted as unmet.
  const applicable = dimensions.filter((d) => d.total > 0);
  const denominator = applicable.reduce((sum, d) => sum + d.total, 0);
  const numerator = applicable.reduce((sum, d) => sum + d.completed, 0);
  const percent = denominator > 0 ? Math.round((numerator / denominator) * 100) : null;

  const statement =
    percent === null
      ? "لا توجد متطلبات مسجلة لهذه الفعالية بعد، لذلك لا تُحسب جاهزية"
      : `اكتمل ${numerator} من ${denominator} متطلبًا` +
        (overdue ? `، منها ${overdue} متأخرًا` : "") +
        (blocked ? `، و${blocked} معطّل` : "");

  return {
    eventId,
    eventTitle: event.title,
    percent: safeNumber(percent),
    completed,
    pending,
    overdue,
    blocked,
    total,
    dimensions,
    reasonUnavailable:
      percent === null
        ? "لا توجد متطلبات مرتبطة مسجلة، فلا يمكن اشتقاق نسبة جاهزية"
        : undefined,
    statement,
  };
}

function dimensionFor(
  key: string,
  title: string,
  requirements: Requirement[],
  href: string,
): ReadinessDimension {
  const rows = requirements.filter((r) => r.dimension === key);
  const completed = rows.filter((r) => settledWork(r.status)).length;
  const overdue = rows.filter(
    (r) => r.dueAt && r.dueAt < new Date() && !settledWork(r.status),
  ).length;
  const blocked = rows.filter((r) => r.blocked && !settledWork(r.status)).length;
  const pending = rows.length - completed - blocked;
  return {
    key,
    title,
    applicable: rows.length > 0,
    completed,
    pending,
    overdue,
    blocked,
    total: rows.length,
    percent: rows.length ? Math.round((completed / rows.length) * 100) : null,
    note: rows.length === 0 ? "لا توجد متطلبات في هذا البعد، واستُبعد من المقام" : undefined,
    href,
  };
}

/** Readiness for every event the viewer can see, upcoming first. */
export function allEventReadiness(
  snap: Snapshots,
  now = new Date(),
): (EventReadiness & { status: string; startsAt: Date | null })[] {
  return snap.events
    .map((e) => {
      const readiness = eventReadiness(snap, e.id, now);
      return readiness
        ? {
            ...readiness,
            status: e.status,
            startsAt: e.dueAt ?? null,
          }
        : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0));
}

/**
 * Readiness for one event, exposed for the Event Control Room so it never keeps
 * a second copy of the state.
 */
export async function readinessFor(ctx: unknown, eventId: string) {
  const { collectSnapshots } = await import("./snapshots");
  const snap = await collectSnapshots(ctx as never);
  return eventReadiness(snap, eventId);
}

export type EventIntelligenceRow = {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  readinessPercent: number | null;
  completed: number;
  total: number;
  attendanceCount: number;
  reportStatus: string | null;
  supportLinked: boolean;
};

export function eventIntelligence(snap: Snapshots, now = new Date()): EventIntelligenceRow[] {
  const attendanceByEvent = snap.attendance.reduce<Record<string, number>>((acc, a) => {
    acc[a.eventId] = (acc[a.eventId] ?? 0) + 1;
    return acc;
  }, {});
  return snap.events
    .map((e) => {
      const readiness = eventReadiness(snap, e.id, now);
      const supportLinked =
        snap.media.some((m) => m.eventId === e.id) ||
        snap.digitalRequests.some((d) => d.eventId === e.id) ||
        snap.expenses.some((x) => x.eventId === e.id) ||
        snap.reservations.some((r) => r.eventId === e.id);
      const report = snap.reports.find((r) => r.title.includes(e.title));
      return {
        id: e.id,
        title: e.title,
        status: e.status,
        dueAt: e.dueAt,
        readinessPercent: readiness?.percent ?? null,
        completed: readiness?.completed ?? 0,
        total: readiness?.total ?? 0,
        attendanceCount: attendanceByEvent[e.id] ?? 0,
        reportStatus: report?.status ?? null,
        supportLinked,
      };
    })
    .sort((a, b) => (b.dueAt?.getTime() ?? 0) - (a.dueAt?.getTime() ?? 0));
}