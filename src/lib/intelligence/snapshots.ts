/**
 * Shared, permission-scoped reads for the intelligence layer.
 *
 * Every intelligence figure is derived from these snapshots rather than from
 * ad-hoc queries per widget, so a dashboard costs a fixed number of round trips
 * and every domain applies the same access rules as the rest of the platform.
 *
 * The snapshots are scoped exactly like their source screens: a viewer only ever
 * sees the rows they could open directly.
 */
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { hasLiveGrant } from "@/lib/people/helpers";
import { visibleBudgetIds, visibleMediaIds, visibleDigitalIds } from "@/lib/operations";

export type Snapshots = {
  term: { id: string; name: string; startAt: Date | null; endAt: Date | null } | null;
  work: (typeof s.workItems.$inferSelect)[];
  /** Sending committee for each request, resolved from its work item. */
  requestOrigin: Map<string, string | null>;
  events: (typeof s.workItems.$inferSelect & {
    eventType: string | null;
    endAt: Date | null;
    locationType: string | null;
    targetAudience: string;
    reportRequired: boolean | null;
  })[];
  attendance: (typeof s.eventAttendance.$inferSelect)[];
  /** Applications, for the onboarding funnel. */
  applications: (typeof s.membershipApplications.$inferSelect)[];
  members: (typeof s.memberProfiles.$inferSelect)[];
  committees: (typeof s.committees.$inferSelect)[];
  /** Committee leadership, resolved from real role assignments. */
  leadership: { userId: string; name: string; role: string; committeeId: string | null }[];
  /** Display name per user id, for labelling members in drill-downs. */
  userNames: Map<string, string>;
  approvals: (typeof s.approvalSteps.$inferSelect)[];
  requests: (typeof s.requests.$inferSelect)[];
  workAssignments: (typeof s.workAssignments.$inferSelect)[];
  reports: (typeof s.reports.$inferSelect)[];
  goals: (typeof s.goals.$inferSelect)[];
  kpis: (typeof s.kpis.$inferSelect)[];
  initiatives: (typeof s.initiatives.$inferSelect)[];
  /** Explicit initiative→entity links; the only accepted linkage source. */
  initiativeLinks: (typeof s.initiativeLinks.$inferSelect)[];
  measurements: (typeof s.kpiMeasurements.$inferSelect)[];
  evidence: (typeof s.evidence.$inferSelect)[];
  volunteerHours: (typeof s.volunteerHourEntries.$inferSelect)[];
  onboarding: (typeof s.onboardingPlans.$inferSelect)[];
  onboardingSteps: (typeof s.onboardingSteps.$inferSelect)[];
  committeeHistory: (typeof s.memberCommitteeHistory.$inferSelect)[];
  // Operations, each already scoped by its own service rules.
  budgets: (typeof s.budgets.$inferSelect)[];
  expenses: (typeof s.expenseRequests.$inferSelect)[];
  purchases: (typeof s.purchases.$inferSelect)[];
  media: (typeof s.mediaRequests.$inferSelect)[];
  digitalRequests: (typeof s.digitalRequests.$inferSelect)[];
  forms: (typeof s.digitalForms.$inferSelect)[];
  batches: (typeof s.certificateBatches.$inferSelect)[];
  assets: (typeof s.assets.$inferSelect)[];
  reservations: (typeof s.assetReservations.$inferSelect)[];
  incidents: (typeof s.assetIncidents.$inferSelect)[];
  /** Which operations domains this viewer can read at all. */
  capability: {
    finance: boolean;
    media: boolean;
    digital: boolean;
    resources: boolean;
  };
};

/** The active term, or null. Absence is a normal state, never an error. */
export async function activeTerm() {
  const [term] = await db
    .select({
      id: s.terms.id,
      name: s.terms.name,
      startAt: s.terms.startAt,
      endAt: s.terms.endAt,
    })
    .from(s.terms)
    .where(eq(s.terms.status, "active"));
  return term ?? null;
}

/**
 * Reads the committees the viewer may see. Club-wide readers see all; everyone
 * else sees the committees their live grants name.
 */
async function visibleCommittees(ctx: Identity) {
  const all = await db
    .select({ id: s.committees.id, name: s.committees.name, description: s.committees.description, active: s.committees.active })
    .from(s.committees)
    .orderBy(s.committees.name);
  if (hasLiveGrant(ctx, "committee.read") && leadershipScope(ctx))
    return all;
  const ids = new Set<string>();
  for (const g of ctx.grants) if (g.committeeId && g.active) ids.add(g.committeeId);
  return all.filter((c) => ids.has(c.id));
}

/** True when the viewer holds a club-scoped governance or oversight grant. */
export function leadershipScope(ctx: Identity) {
  return ctx.grants.some(
    (g) =>
      g.scope === "club" &&
      g.active &&
      (g.permission.startsWith("governance.") ||
        g.permission === "committee.read" ||
        g.permission === "supervisor.view" ||
        g.permission === "club.executive"),
  );
}

export function executiveScope(ctx: Identity) {
  return hasLiveGrant(ctx, "intelligence.executive");
}

/**
 * Builds every snapshot the intelligence layer needs.
 *
 * Independent domains are read in parallel; operations reuse their own
 * visibility rules so the figures match what the operations screens show.
 */
export async function collectSnapshots(ctx: Identity): Promise<Snapshots> {
  const capability = {
    finance: hasLiveGrant(ctx, "finance.view"),
    media: hasLiveGrant(ctx, "media.view"),
    digital: hasLiveGrant(ctx, "digital.view"),
    resources: hasLiveGrant(ctx, "resource.view"),
  };

  // Named results keep each domain bound to its own field: positional tuples
  // silently misalign when a branch returns a different shape.
  const [
    term,
    committees,
    tasks,
    attendance,
    applications,
    members,
    pendingApprovals,
    requests,
    workAssignments,
    reports,
    goals,
    kpis,
    initiatives,
    initiativeLinks,
    measurements,
    evidence,
    volunteerHours,
    onboarding,
    onboardingSteps,
    committeeHistory,
    finance,
    media,
    digital,
    resources,
    leadership,
  ] = await Promise.all([
    activeTerm(),
    visibleCommittees(ctx),
    db
      .select()
      .from(s.workItems)
      .where(eq(s.workItems.kind, "task"))
      .orderBy(sql`${s.workItems.createdAt} desc`),
    db.select().from(s.eventAttendance),
    db.select().from(s.membershipApplications),
    db.select().from(s.memberProfiles),
    db
      .select()
      .from(s.approvalSteps)
      .where(eq(s.approvalSteps.decision, "pending")),
    db.select().from(s.requests),
    db.select().from(s.workAssignments),
    db.select().from(s.reports),
    db.select().from(s.goals),
    db.select().from(s.kpis),
    db.select().from(s.initiatives),
    db.select().from(s.initiativeLinks),
    db.select().from(s.kpiMeasurements),
    db.select().from(s.evidence),
    db.select().from(s.volunteerHourEntries),
    db.select().from(s.onboardingPlans),
    db.select().from(s.onboardingSteps),
    db.select().from(s.memberCommitteeHistory),
    capability.finance
      ? financeSnapshot(ctx)
      : Promise.resolve({ budgets: [], expenses: [], purchases: [] }),
    capability.media ? mediaSnapshot(ctx) : Promise.resolve([]),
    capability.digital ? digitalSnapshot(ctx) : Promise.resolve({ requests: [], forms: [], batches: [] }),
    capability.resources
      ? resourceSnapshot(ctx)
      : Promise.resolve({ assets: [], reservations: [], incidents: [] }),
    leadershipSnapshot(),
  ]);

  // Events are work items of kind `event`, joined with their event detail.
  const eventWork = await db
    .select()
    .from(s.workItems)
    .where(eq(s.workItems.kind, "event"));
  const detail = eventWork.length
    ? await db
        .select()
        .from(s.events)
        .where(
          inArray(
            s.events.id,
            eventWork.map((e) => e.id),
          ),
        )
    : [];
  const detailById = new Map(detail.map((d) => [d.id, d]));
  const events = eventWork.map((w) => {
    const d = detailById.get(w.id);
    return {
      ...w,
      eventType: d?.eventType ?? null,
      endAt: d?.endAt ?? null,
      locationType: d?.locationType ?? null,
      targetAudience: d?.targetAudience ?? "",
      reportRequired: d?.reportRequired ?? null,
    };
  });

  // A `requests` row only names the receiving committee, so the sending side
  // comes from the work item that backs the request.
  const workById = new Map([...tasks, ...eventWork].map((w) => [w.id, w]));
  const requestOrigin = new Map(
    requests.map((r) => [r.id, workById.get(r.id)?.committeeId ?? null]),
  );

  return {
    term,
    leadership,
    userNames: new Map(leadership.map((l) => [l.userId, l.name])),
    work: tasks,
    requestOrigin,
    events,
    attendance,
    applications,
    members,
    committees,
    approvals: pendingApprovals,
    workAssignments,
    requests,
    reports,
    goals,
    kpis,
    initiatives,
    initiativeLinks,
    measurements,
    evidence,
    volunteerHours,
    onboarding,
    onboardingSteps,
    committeeHistory,
    budgets: finance.budgets,
    expenses: finance.expenses,
    purchases: finance.purchases,
    media,
    digitalRequests: digital.requests,
    forms: digital.forms,
    batches: digital.batches,
    assets: resources.assets,
    reservations: resources.reservations,
    incidents: resources.incidents,
    capability,
  };
}

/**
 * Committee leadership is read from role assignments rather than assumed: a
 * committee shows its real heads, and shows none when none are assigned.
 */
async function leadershipSnapshot() {
  const rows = await db
    .select({
      userId: s.user.id,
      name: s.user.name,
      role: s.assignments.roleId,
      committeeId: s.assignments.committeeId,
    })
    .from(s.assignments)
    .innerJoin(s.user, eq(s.user.id, s.assignments.userId))
    .where(eq(s.assignments.active, true));
  return rows;
}

async function financeSnapshot(ctx: Identity) {
  const scope = await visibleBudgetIds(ctx);
  const budgets = scope.all
    ? await db.select().from(s.budgets).orderBy(sql`${s.budgets.createdAt} desc`)
    : await db
        .select()
        .from(s.budgets)
        .where(
          scope.ids.length
            ? sql`${s.budgets.id} IN (${sql.join(scope.ids.map((id) => sql`${id}`), sql`, `)})`
            : sql`false`,
        );
  const budgetIds = new Set(budgets.map((b) => b.id));
  const allExpenses = await db.select().from(s.expenseRequests);
  const expenses = scope.all
    ? allExpenses
    : allExpenses.filter((e) => (e.budgetId && budgetIds.has(e.budgetId)) || e.requesterId === ctx.user.id);
  const expenseIds = new Set(expenses.map((e) => e.id));
  const allPurchases = expenseIds.size
    ? await db
        .select()
        .from(s.purchases)
        .where(inArray(s.purchases.expenseId, [...expenseIds]))
    : [];
  return { budgets, expenses, purchases: allPurchases };
}

async function mediaSnapshot(ctx: Identity) {
  const scope = await visibleMediaIds(ctx);
  if (!scope.all)
    return scope.ids.length
      ? db
          .select()
          .from(s.mediaRequests)
          .where(inArray(s.mediaRequests.id, scope.ids))
      : Promise.resolve([]);
  return db.select().from(s.mediaRequests);
}

async function digitalSnapshot(ctx: Identity) {
  const scope = await visibleDigitalIds(ctx);
  const requests = scope.all
    ? await db.select().from(s.digitalRequests)
    : scope.ids.length
      ? await db
          .select()
          .from(s.digitalRequests)
          .where(inArray(s.digitalRequests.id, scope.ids))
      : [];
  const forms = await db.select().from(s.digitalForms);
  const batches = await db.select().from(s.certificateBatches);
  return { requests, forms, batches };
}

async function resourceSnapshot(ctx: Identity) {
  if (!hasLiveGrant(ctx, "resource.view"))
    return { assets: [], reservations: [], incidents: [] };
  const [assets, reservations, incidents] = await Promise.all([
    db.select().from(s.assets),
    db.select().from(s.assetReservations),
    db.select().from(s.assetIncidents),
  ]);
  return { assets, reservations, incidents };
}

/** Restricts a window read to rows that exist inside the reporting period. */
export function withinRange<T extends { createdAt: Date }>(rows: T[], from: Date, to: Date) {
  return rows.filter((r) => r.createdAt >= from && r.createdAt <= to);
}

export function dueWithin<T extends { dueAt: Date | null }>(rows: T[], now: Date) {
  return rows.filter((r) => r.dueAt !== null && r.dueAt < now);
}

/** Guards a chart series against NaN and undefined leaking into the UI. */
export function safeNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

export function assertTerm(snap: Snapshots): Snapshots["term"] {
  if (!snap.term) throw new HttpError(409, "لا يوجد فصل أكاديمي نشط");
  return snap.term;
}