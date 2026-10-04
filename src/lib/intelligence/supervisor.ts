/**
 * Supervisor brief.
 *
 * Oversight, not access: the supervisor sees club-level operational signals and
 * the governance items that need a decision, without gaining committee-internal
 * editing or private committee notes. Every section here is built from the same
 * intelligence reads the leadership views use, so a supervisor and a leader see
 * consistent numbers — only the permitted detail differs.
 */
import { HttpError, type Identity } from "@/lib/services";
import { hasLiveGrant } from "@/lib/people/helpers";
import { collectSnapshots, type Snapshots } from "./snapshots";
import { resolveRange, type TimeRange } from "./provenance";
import { eventIntelligence } from "./readiness";
import {
  executionMetrics,
  financeMetrics,
  mediaMetrics,
  digitalMetrics,
  resourceMetrics,
  peopleMetrics,
} from "./metrics";
import { insights, capacitySignals } from "./insights";
import { governanceLinkage } from "./committees";

export type SupervisorBrief = {
  generatedAt: string;
  term: { id: string; name: string } | null;
  period: { from: Date; to: Date; label: string };
  /** Event readiness for upcoming events, with a drill-down. */
  events: {
    id: string;
    title: string;
    dueAt: Date | null;
    readinessPercent: number | null;
    completed: number;
    total: number;
    overdue: number;
    href: string;
  }[];
  /** Items needing the supervisor's own attention. */
  reportsAwaitingAction: {
    id: string;
    title: string;
    status: string;
    periodEnd: Date | null;
    href: string;
  }[];
  governanceItems: {
    goalId: string;
    goalTitle: string;
    pendingKpis: number;
    href: string;
  }[];
  /** Operational attention, aggregated across the domains the viewer may read. */
  operations: {
    finance: { available: boolean; pendingExpenses: number | null; unreconciled: number | null; spent: number | null };
    media: { available: boolean; waitingReview: number | null; overdue: number | null };
    digital: { available: boolean; waitingInput: number | null; overdue: number | null };
    resources: { available: boolean; openIncidents: number | null; maintenance: number | null };
  };
  people: {
    activeMembers: number | null;
    attendanceRate: number | null;
    volunteerHours: number | null;
    onboardingComplete: number | null;
    onboardingInProgress: number | null;
  };
  execution: { overdue: number | null; inReview: number | null; open: number | null };
  /** Deterministic insights, already filtered by what this viewer may see. */
  insights: ReturnType<typeof insights>;
  capacity: ReturnType<typeof capacitySignals>;
  /** Explicit statement of what this brief deliberately withholds. */
  privacyNote: string;
  /** Links the supervisor may actually open, per their own grants. */
  links: { label: string; href: string }[];
};

function supervisorLinks(ctx: Identity): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [
    { label: "الحوكمة", href: "/governance" },
  ];
  if (hasLiveGrant(ctx, "intelligence.executive"))
    links.push({ label: "الاستخبارات التنفيذية", href: "/intelligence/executive" });
  links.push({ label: "التقارير", href: "/governance?tab=reports" });
  return links;
}

/**
 * Builds the brief.
 *
 * The supervisor's scope is resolved through the ordinary permission model, so
 * this function cannot widen it: if the caller cannot read finance, the finance
 * block reports `available: false` instead of a redacted number.
 */
export async function supervisorBrief(
  ctx: Identity,
  rangeKey = "term",
): Promise<SupervisorBrief> {
  if (!hasLiveGrant(ctx, "supervisor.view") && !hasLiveGrant(ctx, "intelligence.executive"))
    throw new HttpError(403, "ملخص المشرف متاح للمشرف وقيادة النادي");

  const snap: Snapshots = await collectSnapshots(ctx);
  const now = new Date();
  const range: TimeRange = resolveRange(rangeKey, snap.term, now);

  const execution = executionMetrics(snap, range, now);
  const people = peopleMetrics(snap, range);
  const finance = financeMetrics(snap, range);
  const media = mediaMetrics(snap, range, now);
  const digital = digitalMetrics(snap, range, now);
  const resources = resourceMetrics(snap, range, now);
  const events = eventIntelligence(snap, now);
  const linkages = governanceLinkage(snap);

  // Governance items are those whose active KPIs have no recent measurement —
  // the same rule the insight engine uses, surfaced without duplication.
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const governanceItems = linkages
    .map((g) => ({
      goalId: g.goalId,
      goalTitle: g.goalTitle,
      pendingKpis: g.initiatives
        .flatMap((i) => i.kpis)
        .filter((k) => !k.explainability.available || (k.explainability.lastUpdated && k.explainability.lastUpdated < in7))
        .length,
      href: `/governance?tab=goals&item=${g.goalId}`,
    }))
    .filter((g) => g.pendingKpis > 0);

  // Reports the supervisor could act on, under `report.review` or
  // `report.approve`. A member or committee head never sees this list because
  // the permission is absent, not because the list is hidden in the UI.
  const canReview = hasLiveGrant(ctx, "report.review") || hasLiveGrant(ctx, "report.approve");
  const reportsAwaitingAction = canReview
    ? snap.reports
        .filter((r) => ["submitted", "under_review"].includes(r.status))
        .map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          periodEnd: r.periodEnd,
          href: `/governance?tab=reports&item=${r.id}`,
        }))
    : [];

  return {
    generatedAt: now.toISOString(),
    term: snap.term ? { id: snap.term.id, name: snap.term.name } : null,
    period: { from: range.from, to: range.to, label: range.labelAr },
    events: events
      .filter((e) => e.dueAt && e.dueAt >= now)
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        title: e.title,
        dueAt: e.dueAt,
        readinessPercent: e.readinessPercent,
        completed: e.completed,
        total: e.total,
        overdue: snap.work.filter(
          (w) => w.eventId === e.id && w.dueAt && w.dueAt < now && w.status !== "completed" && w.status !== "cancelled",
        ).length,
        href: `/events/${e.id}`,
      })),
    reportsAwaitingAction,
    governanceItems,
    operations: {
      finance: {
        available: finance.available,
        pendingExpenses: finance.pendingExpenses.value,
        unreconciled: finance.unreconciled.value,
        spent: finance.spent.value,
      },
      media: {
        available: media.available,
        waitingReview: media.waitingReview.value,
        overdue: media.overdue.value,
      },
      digital: {
        available: digital.available,
        waitingInput: digital.waitingInput.value,
        overdue: digital.overdue.value,
      },
      resources: {
        available: resources.available_,
        openIncidents: resources.openIncidents.value,
        maintenance: resources.maintenance.value,
      },
    },
    people: {
      activeMembers: people.activeMembers.value,
      attendanceRate: people.attendanceRate.value,
      volunteerHours: people.approvedVolunteerHours.value,
      onboardingComplete: people.onboardingComplete.value,
      onboardingInProgress: people.onboardingInProgress.value,
    },
    execution: {
      overdue: execution.overdue.value,
      inReview: execution.inReview.value,
      open: execution.open.value,
    },
    insights: insights(snap, now),
    capacity: capacitySignals(snap, now),
    privacyNote:
      "هذا ملخص إشرافي. لا يفتح صلاحيات تحرير داخل اللجان، ولا يعرض ملاحظات داخلية خاصة بالأعضاء، ولا يرفع مستوى التفاصيل المالية عن المسموح به بصلاحية القارئ.",
    links: supervisorLinks(ctx),
  };
}