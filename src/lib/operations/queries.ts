import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { hasLiveGrant } from "@/lib/people/helpers";
import {
  budgetTotals,
  listExpenses,
  listPurchases,
  visibleBudgetIds,
} from "./finance.service";
import {
  archiveIndex,
  listMediaRequests,
  mediaSummary,
  visibleMediaIds,
} from "./media.service";
import {
  digitalSummary,
  listBatches,
  listDigitalRequests,
  listForms,
  visibleDigitalIds,
} from "./digital.service";
import {
  listAssets,
  listIncidents,
  listReservations,
  resourceSummary,
} from "./resource.service";
import { alerts } from "./finance.service";

/**
 * The operations home. Every bucket is derived from a real table and each list
 * is already permission-scoped, so a viewer without a domain simply gets an
 * empty list rather than someone else's records.
 */
export async function operationsHome(ctx: Identity) {
  const [finance, media, digital, resources] = await Promise.all([
    financeOverview(ctx),
    mediaOverview(ctx),
    digitalOverview(ctx),
    resourceOverview(ctx),
  ]);
  return {
    finance,
    media,
    digital,
    resources,
    attention: {
      finance: finance.pendingReview.length + finance.alerts.filter((a) => a.severity !== "info").length,
      media: media.waitingReview.length + media.changesRequested.length,
      digital: digital.waitingInput.length + digital.overdue.length,
      resources: resources.pendingApprovals.length + resources.overdue.length,
    },
  };
}

export async function financeOverview(ctx: Identity) {
  if (!hasLiveGrant(ctx, "finance.view"))
    return {
      available: false,
      budgets: [],
      expenses: [],
      purchases: [],
      pendingReview: [],
      unreconciled: [],
      overdue: [],
      totals: { committed: 0, spent: 0 },
      alerts: [],
    };
  const scope = await visibleBudgetIds(ctx);
  const budgets = scope.all
    ? await db.select().from(s.budgets).orderBy(sql`${s.budgets.createdAt} desc`)
    : await db.select().from(s.budgets).where(
        scope.ids.length
          ? sql`${s.budgets.id} IN (${sql.join(scope.ids.map((id) => sql`${id}`), sql`, `)})`
          : sql`false`,
      );
  const expenses = await listExpenses(ctx);
  const purchases = await listPurchases(ctx);
  const expenseIds = new Set(expenses.map((e) => e.id));
  const visiblePurchases = purchases.filter((p) => expenseIds.has(p.expenseId));
  const totals = await budgetTotals(db, budgets);
  const committed = expenses
    .filter((e) => e.status === "approved")
    .reduce((sum, e) => sum + e.amount, 0);
  const spent = expenses
    .filter((e) => e.status === "purchased" || e.status === "reconciled")
    .reduce((sum, e) => sum + e.amount, 0);
  const now = new Date();
  return {
    available: true,
    budgets: budgets.map((b) => ({ ...b, totals: totals[b.id] })),
    expenses,
    purchases: visiblePurchases,
    pendingReview: expenses.filter((e) => e.status === "submitted" || e.status === "finance_review"),
    unreconciled: visiblePurchases.filter((p) => p.reconciliationStatus === "pending"),
    overdue: expenses.filter(
      (e) => e.neededBy && e.neededBy < now && ["submitted", "finance_review", "approved"].includes(e.status),
    ),
    totals: { committed, spent },
    alerts: await alerts(ctx),
  };
}

export async function mediaOverview(ctx: Identity) {
  if (!hasLiveGrant(ctx, "media.view"))
    return {
      available: false,
      total: 0,
      all: [],
      inProduction: [],
      waitingReview: [],
      changesRequested: [],
      scheduled: [],
      published: [],
      overdue: [],
      pipeline: {},
      archive: [],
    };
  const summary = await mediaSummary(ctx);
  return { available: true, ...summary, archive: await archiveIndex(ctx).catch(() => []) };
}

export async function digitalOverview(ctx: Identity) {
  if (!hasLiveGrant(ctx, "digital.view"))
    return {
      available: false,
      all: [],
      open: [],
      waitingInput: [],
      overdue: [],
      activeForms: [],
      batches: [],
      pendingBatches: [],
      byStatus: {},
    };
  const summary = await digitalSummary(ctx);
  return { available: true, ...summary };
}

export async function resourceOverview(ctx: Identity) {
  if (!hasLiveGrant(ctx, "resource.view"))
    return {
      available: false,
      total: 0,
      byAvailability: {} as Record<string, number>,
      byCondition: {} as Record<string, number>,
      assets: [],
      pendingApprovals: [],
      checkedOut: [],
      overdue: [],
      incidents: [],
      openIncidents: 0,
    };
  const summary = await resourceSummary(ctx);
  const [assets, reservations, incidents] = await Promise.all([
    listAssets(ctx),
    listReservations(ctx),
    listIncidents(ctx),
  ]);
  return {
    available: true,
    ...summary,
    assets,
    pendingApprovals: reservations.filter((r) => r.status === "requested"),
    incidents,
  };
}

/**
 * Linked operational support for one event. The Event Control Room reads this
 * so it never has to keep its own copy of finance/media/digital state.
 */
export async function eventSupport(ctx: Identity, eventId: string) {
  const out: Record<string, unknown> = {
    eventId,
    finance: { available: false, requests: [] },
    media: { available: false, requests: [] },
    digital: { available: false, requests: [] },
  };
  if (hasLiveGrant(ctx, "finance.view")) {
    const expenses = await listExpenses(ctx, { eventId }).catch(() => []);
    const budgets = expenses.map((e) => e.budgetId).filter((x): x is string => Boolean(x));
    const rows = budgets.length
      ? await db.select().from(s.budgets).where(
          sql`${s.budgets.id} IN (${sql.join([...new Set(budgets)].map((id) => sql`${id}`), sql`, `)})`,
        )
      : [];
    out.finance = { available: true, requests: expenses, budgets: rows };
  }
  if (hasLiveGrant(ctx, "media.view")) {
    out.media = { available: true, requests: await listMediaRequests(ctx, { eventId }).catch(() => []) };
  }
  if (hasLiveGrant(ctx, "digital.view")) {
    const requests = await listDigitalRequests(ctx, { eventId }).catch(() => []);
    const batches = await listBatches(ctx, eventId).catch(() => []);
    out.digital = { available: true, requests, certificateBatches: batches };
  }
  // Readiness is a read of the three linked lists, never a stored flag.
  const settled = ["reconciled", "published", "completed", "cancelled", "rejected", "archived"];
  const all = [
    ...(out.finance as { requests: { status: string }[] }).requests,
    ...(out.media as { requests: { status: string }[] }).requests,
    ...(out.digital as { requests: { status: string }[] }).requests,
  ];
  const count = (v: { status: string }[]) => v.filter((r) => !settled.includes(r.status)).length;
  const financeOpen = count((out.finance as { requests: { status: string }[] }).requests);
  const mediaOpen = count((out.media as { requests: { status: string }[] }).requests);
  const digitalOpen = count((out.digital as { requests: { status: string }[] }).requests);
  const totalOpen = financeOpen + mediaOpen + digitalOpen;
  const total = all.length;
  return {
    ...out,
    readiness: {
      financeOpen,
      mediaOpen,
      digitalOpen,
      totalOpen,
      linkedTotal: total,
      // Share of linked requests that have reached a settled state.
      settledPercent: total === 0 ? null : Math.round(((total - totalOpen) / total) * 100),
      state: total === 0 ? "no_linked_support" : totalOpen === 0 ? "supported" : "in_progress",
    },
  };
}

export type SearchHit = {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  status?: string;
};

/** Extends the existing search with permission-honouring specialized records. */
export async function operationsSearch(ctx: Identity, q: string): Promise<SearchHit[]> {
  const term = q.trim();
  if (!term) return [];
  const hits: SearchHit[] = [];
  if (hasLiveGrant(ctx, "finance.view")) {
    for (const e of await listExpenses(ctx).catch(() => []))
      if (e.title.includes(term) || e.description.includes(term))
        hits.push({
          kind: "expense",
          id: e.id,
          title: e.title,
          subtitle: e.status,
          href: `/operations/finance?expense=${e.id}`,
          status: e.status,
        });
  }
  if (hasLiveGrant(ctx, "media.view")) {
    for (const m of await listMediaRequests(ctx, { q: term }).catch(() => []))
      hits.push({
        kind: "media",
        id: m.id,
        title: m.title,
        subtitle: m.mediaType,
        href: `/operations/media?request=${m.id}`,
        status: m.status,
      });
  }
  if (hasLiveGrant(ctx, "digital.view")) {
    for (const d of await listDigitalRequests(ctx, { q: term }).catch(() => []))
      hits.push({
        kind: "digital",
        id: d.id,
        title: d.title,
        subtitle: d.serviceType,
        href: `/operations/digital?request=${d.id}`,
        status: d.status,
      });
    for (const f of (await listForms(ctx)).filter(
      (f) => f.title.includes(term) || f.purpose.includes(term),
    ))
      hits.push({ kind: "form", id: f.id, title: f.title, subtitle: f.provider, href: `/operations/digital?form=${f.id}`, status: f.status });
  }
  if (hasLiveGrant(ctx, "resource.view")) {
    for (const a of (await listAssets(ctx, { q: term })))
      hits.push({ kind: "asset", id: a.id, title: a.name, subtitle: a.category, href: `/operations/resources?asset=${a.id}`, status: a.availability });
  }
  return hits.slice(0, 50);
}

export type InboxItem = {
  kind: string;
  entityId: string;
  title: string;
  action: string;
  href: string;
  at: Date;
};

/** Extends the one existing inbox; it is a read of the same scoped lists. */
export async function operationsInbox(ctx: Identity): Promise<InboxItem[]> {
  const items: InboxItem[] = [];
  if (hasLiveGrant(ctx, "finance.view")) {
    const expenses = await listExpenses(ctx).catch(() => []);
    for (const e of expenses.filter((e) => ["submitted", "finance_review", "approved", "purchased"].includes(e.status)))
      items.push({
        kind: "finance",
        entityId: e.id,
        title: e.title,
        action:
          e.status === "approved" || e.status === "purchased"
            ? "بانتظار تسجيل الشراء أو المطابقة"
            : "بانتظار المراجعة أو الاعتماد",
        href: `/operations/finance?expense=${e.id}`,
        at: e.updatedAt,
      });
  }
  if (hasLiveGrant(ctx, "media.view")) {
    const rows = await listMediaRequests(ctx).catch(() => []);
    for (const m of rows.filter((r) => r.status === "in_review" || r.status === "changes_requested" || r.status === "new"))
      items.push({
        kind: "media",
        entityId: m.id,
        title: m.title,
        action: m.status === "in_review" ? "بانتظار المراجعة" : m.status === "changes_requested" ? "يحتاج تعديلات" : "طلب جديد",
        href: `/operations/media?request=${m.id}`,
        at: m.updatedAt,
      });
  }
  if (hasLiveGrant(ctx, "digital.view")) {
    const rows = await listDigitalRequests(ctx).catch(() => []);
    for (const r of rows.filter((x) => ["new", "waiting_input", "in_review"].includes(x.status)))
      items.push({
        kind: "digital",
        entityId: r.id,
        title: r.title,
        action: r.status === "waiting_input" ? "بانتظار مدخلات من مقدم الطلب" : r.status === "new" ? "طلب جديد" : "قيد المراجعة",
        href: `/operations/digital?request=${r.id}`,
        at: r.updatedAt,
      });
  }
  if (hasLiveGrant(ctx, "resource.view")) {
    for (const r of (await listReservations(ctx, { status: "requested" })))
      items.push({
        kind: "resource",
        entityId: r.id,
        title: r.purpose,
        action: "حجز بانتظار الاعتماد",
        href: `/operations/resources?reservation=${r.id}`,
        at: r.createdAt,
      });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export async function operationsActivity(ctx: Identity, limit = 12) {
  const rows = await db
    .select()
    .from(s.operationsEvents)
    .orderBy(sql`${s.operationsEvents.createdAt} desc`)
    .limit(limit);
  if (!hasLiveGrant(ctx, "finance.view"))
    return rows.filter((r) => r.domain !== "finance");
  return rows;
}

export async function findOperationEvent(entityType: string, entityId: string) {
  const [row] = await db
    .select()
    .from(s.operationsEvents)
    .where(sql`${s.operationsEvents.entityType} = ${entityType} AND ${s.operationsEvents.entityId} = ${entityId}`)
    .limit(1);
  if (!row) throw new HttpError(404, "لا يوجد سجل نشاط");
  return row;
}

export { visibleMediaIds, visibleDigitalIds };