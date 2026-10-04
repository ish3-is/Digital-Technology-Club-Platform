import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import type { Connection } from "@/lib/work/access";
import {
  activeTerm,
  actorContext,
  grant,
} from "@/lib/work/access";
import { generateId } from "@/lib/governance/helpers";
import {
  currentTermId,
  demand,
  hasLiveGrant,
  notify,
  record,
  write,
  writeShared,
  type PeopleScope,
} from "@/lib/people/helpers";
import { expenseTransitions, openExpenseStatuses } from "./types";
import { calculateBudget, financeAlerts, type BudgetTotals } from "./accounting";

export const financeId = generateId;

export type FinanceScope = PeopleScope;

/** Finance data is never public: a caller needs a live finance.view grant. */
export function canViewFinance(ctx: Identity) {
  return hasLiveGrant(ctx, "finance.view");
}

/**
 * A viewer sees a budget when they hold finance.view at club scope, or when
 * the budget belongs to a committee they can read, or they raised something on it.
 */
export async function visibleBudgetIds(ctx: Identity, conn: Connection = db) {
  if (!hasLiveGrant(ctx, "finance.view")) return { all: false, ids: [] as string[] };
  const now = new Date();
  if (ctx.grants.some((g) => g.permission === "finance.view" && g.active && g.scope === "club" && g.startAt <= now && (!g.endAt || g.endAt > now) && g.termStatus !== "closed"))
    return { all: true as const, ids: [] as string[] };
  const committeeIds = new Set<string>();
  for (const g of ctx.grants)
    if (g.permission === "finance.view" && g.active && g.startAt <= now && (!g.endAt || g.endAt > now) && g.termStatus !== "closed" && g.committeeId)
      committeeIds.add(g.committeeId);
  const rows = await conn
    .select({ id: s.budgets.id, committeeId: s.budgets.committeeId })
    .from(s.budgets)
    .where(
      committeeIds.size
        ? inArray(s.budgets.committeeId, [...committeeIds])
        : sql`false`,
    );
  const own = await conn
    .select({ budgetId: s.expenseRequests.budgetId })
    .from(s.expenseRequests)
    .where(eq(s.expenseRequests.requesterId, ctx.user.id));
  return {
    all: false,
    ids: [
      ...new Set([
        ...rows.map((r) => r.id),
        ...own.map((o) => o.budgetId).filter((x): x is string => Boolean(x)),
      ]),
    ],
  };
}

/** Committee-scoped writers act inside their own committee; club scope covers all. */
export function assertFinanceScope(ctx: Identity, permission: string, scope: FinanceScope) {
  demand(ctx, permission, scope);
}

export type CreateBudgetInput = {
  title: string;
  description?: string;
  committeeId?: string | null;
  eventId?: string | null;
  initiativeId?: string | null;
  allocatedAmount: number;
  currency?: string;
  startsOn: Date;
  endsOn?: Date | null;
  alertThresholdPercent?: number;
  notes?: string;
};

export async function createBudget(ctx: Identity, input: CreateBudgetInput) {
  const academicTermId = await currentTermId();
  const amount = Math.round(Number(input.allocatedAmount));
  if (!Number.isFinite(amount) || amount <= 0)
    throw new HttpError(422, "المبلغ المخصص يجب أن يكون رقمًا موجبًا");
  const threshold = Math.round(Number(input.alertThresholdPercent ?? 80));
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100)
    throw new HttpError(422, "نسبة التنبيه يجب أن تكون بين 1 و100");
  if (input.endsOn && input.endsOn < input.startsOn)
    throw new HttpError(422, "تاريخ النهاية قبل تاريخ البداية");

  return write(ctx, { academicTermId, committeeId: input.committeeId ?? null }, "finance.budget.create", async (tx) => {
    const row: typeof s.budgets.$inferInsert = {
      id: financeId(),
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      academicTermId,
      committeeId: input.committeeId ?? null,
      eventId: input.eventId ?? null,
      initiativeId: input.initiativeId ?? null,
      allocatedAmount: amount,
      currency: input.currency ?? "SAR",
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      alertThresholdPercent: threshold,
      notes: input.notes?.trim() ?? "",
      createdBy: ctx.user.id,
    };
    if (!row.title) throw new HttpError(422, "عنوان الميزانية مطلوب");
    const [created] = await tx
      .insert(s.budgets)
      .values(row)
      .returning();
    await record(tx, ctx, {
      action: "budget.create",
      entityType: "budget",
      entityId: created.id,
      committeeId: created.committeeId,
      metadata: { allocatedAmount: amount },
    });
    return created;
  });
}

export type UpdateBudgetInput = {
  title?: string;
  description?: string;
  endsOn?: Date | null;
  alertThresholdPercent?: number;
  status?: "active" | "closed" | "archived";
  notes?: string;
};

export async function updateBudget(ctx: Identity, budgetId: string, input: UpdateBudgetInput) {
  const budget = await db.query.budgets.findFirst({ where: eq(s.budgets.id, budgetId) });
  if (!budget) throw new HttpError(404, "الميزانية غير متاحة");
  return write(ctx, { academicTermId: budget.academicTermId, committeeId: budget.committeeId }, "finance.budget.update", async (tx) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.description !== undefined) patch.description = input.description.trim();
    if (input.notes !== undefined) patch.notes = input.notes.trim();
    if (input.endsOn !== undefined) patch.endsOn = input.endsOn ?? null;
    if (input.status !== undefined) patch.status = input.status;
    if (input.alertThresholdPercent !== undefined) {
      const t = Math.round(Number(input.alertThresholdPercent));
      if (t < 1 || t > 100) throw new HttpError(422, "نسبة التنبيه يجب أن تكون بين 1 و100");
      patch.alertThresholdPercent = t;
    }
    const [updated] = await tx.update(s.budgets).set(patch as any).where(eq(s.budgets.id, budgetId)).returning();
    await record(tx, ctx, {
      action: "budget.update",
      entityType: "budget",
      entityId: budgetId,
      committeeId: budget.committeeId,
      metadata: patch,
    });
    return updated;
  });
}

/** Budget totals are always derived from the expense rows, never stored. */
export async function budgetTotals(
  conn: Connection,
  budgets: (typeof s.budgets.$inferSelect)[],
): Promise<Record<string, BudgetTotals>> {
  if (!budgets.length) return {};
  const expenses = await conn
    .select({
      id: s.expenseRequests.id,
      budgetId: s.expenseRequests.budgetId,
      status: s.expenseRequests.status,
      amount: s.expenseRequests.amount,
    })
    .from(s.expenseRequests)
    .where(inArray(s.expenseRequests.budgetId, budgets.map((b) => b.id)));
  const expenseIds = expenses.map((e) => e.id);
  const purchases = expenseIds.length
    ? await conn
        .select({
          expenseId: s.purchases.expenseId,
          amount: s.purchases.amount,
          reconciliationStatus: s.purchases.reconciliationStatus,
        })
        .from(s.purchases)
        .where(inArray(s.purchases.expenseId, expenseIds))
    : [];
  const out: Record<string, BudgetTotals> = {};
  for (const b of budgets) {
    const budgetExpenses = expenses.filter((e) => e.budgetId === b.id);
    out[b.id] = calculateBudget(
      b,
      budgetExpenses,
      purchases.filter((p) => budgetExpenses.some((e) => e.id === p.expenseId)),
    );
  }
  return out;
}

export type ListExpensesInput = {
  status?: string;
  budgetId?: string;
  eventId?: string;
  committeeId?: string;
  q?: string;
};

export async function listExpenses(ctx: Identity, input: ListExpensesInput = {}) {
  if (!canViewFinance(ctx)) throw new HttpError(403, "لا تملك صلاحية قراءة العمليات المالية");
  const scope = await visibleBudgetIds(ctx);
  const budgetIds = scope.all ? null : scope.ids;
  // A viewer sees budgets in scope plus anything they raised themselves, so a
  // requester never loses sight of their own unbudgeted submission.
  const rows = await db
    .select()
    .from(s.expenseRequests)
    .where(
      budgetIds === null
        ? undefined
        : sql`(${sql.join(
            [
              budgetIds.length
                ? sql`${s.expenseRequests.budgetId} IN (${sql.join(budgetIds.map((id) => sql`${id}`), sql`, `)})`
                : sql`false`,
              sql`${s.expenseRequests.requesterId} = ${ctx.user.id}`,
            ],
            sql` OR `,
          )})`,
    )
    .orderBy(sql`${s.expenseRequests.createdAt} desc`);
  let out = rows;
  if (input.status) out = out.filter((r) => r.status === input.status);
  if (input.budgetId) out = out.filter((r) => r.budgetId === input.budgetId);
  if (input.eventId) out = out.filter((r) => r.eventId === input.eventId);
  if (input.committeeId) out = out.filter((r) => r.committeeId === input.committeeId);
  if (input.q) {
    const q = input.q.trim();
    out = out.filter((r) => r.title.includes(q) || r.description.includes(q));
  }
  return out;
}

export async function getExpense(ctx: Identity, id: string) {
  if (!canViewFinance(ctx)) throw new HttpError(403, "لا تملك صلاحية قراءة العمليات المالية");
  const row = await db.query.expenseRequests.findFirst({ where: eq(s.expenseRequests.id, id) });
  if (!row) throw new HttpError(404, "السجل غير متاح");
  const visible = await visibleBudgetIds(ctx);
  if (!visible.all && !visible.ids.includes(row.budgetId ?? "") && row.requesterId !== ctx.user.id)
    throw new HttpError(403, "لا تملك صلاحية قراءة هذا السجل");
  return row;
}

export async function expenseDecisions(ctx: Identity, expenseId: string) {
  await getExpense(ctx, expenseId);
  return db
    .select()
    .from(s.expenseDecisions)
    .where(eq(s.expenseDecisions.expenseId, expenseId))
    .orderBy(s.expenseDecisions.createdAt);
}

export type CreateExpenseInput = {
  title: string;
  description?: string;
  committeeId?: string | null;
  budgetId?: string | null;
  eventId?: string | null;
  workRequestId?: string | null;
  category: s.ExpenseCategory;
  amount: number;
  currency?: string;
  neededBy?: Date | null;
  justification?: string;
  submit?: boolean;
  /** Optional caller-supplied id; the demo seed uses it for deterministic rows. */
  id?: string;
};

export async function createExpense(ctx: Identity, input: CreateExpenseInput) {
  const academicTermId = await currentTermId();
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(422, "المبلغ يجب أن يكون رقمًا موجبًا");
  const title = input.title.trim();
  if (!title) throw new HttpError(422, "عنوان الطلب مطلوب");
  if (input.budgetId) {
    const budget = await db.query.budgets.findFirst({ where: eq(s.budgets.id, input.budgetId) });
    if (!budget) throw new HttpError(404, "الميزانية غير متاحة");
    if (budget.academicTermId !== academicTermId)
      throw new HttpError(422, "الميزانية لا تخص الفصل الأكاديمي النشط");
  }
  // Raising an expense is a club-wide request: any member may claim a cost, and
  // only the finance desk plus the requester ever read it.
  return writeShared(ctx, { academicTermId, committeeId: null }, "finance.expense.create", async (tx) => {
    const [created] = await tx
      .insert(s.expenseRequests)
      .values({
        id: input.id ?? financeId(),
        title,
        description: input.description?.trim() ?? "",
        requesterId: ctx.user.id,
        committeeId: input.committeeId ?? null,
        budgetId: input.budgetId ?? null,
        eventId: input.eventId ?? null,
        workRequestId: input.workRequestId ?? null,
        category: input.category,
        amount,
        currency: input.currency ?? "SAR",
        neededBy: input.neededBy ?? null,
        justification: input.justification?.trim() ?? "",
        academicTermId,
        status: input.submit ? "submitted" : "draft",
        submittedAt: input.submit ? new Date() : null,
      })
      .returning();
    if (input.submit)
      await tx.insert(s.expenseDecisions).values({
        id: financeId(),
        expenseId: created.id,
        actorId: ctx.user.id,
        action: "submit",
        fromStatus: "draft",
        toStatus: "submitted",
        note: "",
      });
    await record(tx, ctx, {
      action: input.submit ? "expense.submit" : "expense.create",
      entityType: "expense",
      entityId: created.id,
      committeeId: created.committeeId,
      metadata: { amount, budgetId: created.budgetId },
    });
    return created;
  });
}

/**
 * Moves an expense through the lifecycle. Each action maps to its own
 * permission, and the requester is blocked from reviewing, approving, or
 * reconciling their own request — separation the catalog cannot express alone.
 */
export async function transitionExpense(
  ctx: Identity,
  expenseId: string,
  action: string,
  note = "",
) {
  const row = await db.query.expenseRequests.findFirst({ where: eq(s.expenseRequests.id, expenseId) });
  if (!row) throw new HttpError(404, "السجل غير متاح");
  const target = targetForExpenseAction(action, row.status);
  const permission = expenseActionPermission(action);
    // Separation is checked before the state machine so a requester learns they
    // may never approve, not merely that the current state forbids it.
    if (action !== "submit" && row.requesterId === ctx.user.id)
      throw new HttpError(403, "لا يمكن مراجعة أو اعتماد أو مطابقة طلب رفعته بنفسك");
    if (target === null) throw new HttpError(422, "هذا الإجراء غير متاح في الحالة الحالية");

  const committeeId = row.committeeId;
  return writeShared(ctx, { academicTermId: row.academicTermId, committeeId: null }, permission, async (tx) => {
    const patch: Record<string, unknown> = { status: target, updatedAt: new Date() };
    if (action === "submit") patch.submittedAt = new Date();
    if (action === "start_review") patch.reviewedBy = ctx.user.id;
    if (action === "approve" || action === "reject") {
      patch.approvedBy = ctx.user.id;
      patch.decidedAt = new Date();
    }
    const [updated] = await tx
      .update(s.expenseRequests)
      .set(patch as any)
      .where(eq(s.expenseRequests.id, expenseId))
      .returning();
    await tx.insert(s.expenseDecisions).values({
      id: financeId(),
      expenseId,
      actorId: ctx.user.id,
      action,
      fromStatus: row.status,
      toStatus: target,
      note,
    });
    await record(tx, ctx, {
      action: `expense.${action}`,
      entityType: "expense",
      entityId: expenseId,
      committeeId,
      metadata: { from: row.status, to: target },
    });
    // The next actor is notified; the previous one is not copied.
    const next = nextActorForExpense(updated, ctx.user.id);
    if (next) await notify(tx, next, `طلب مصروف: ${titleFor(action)}`, `${updated.title}`);
    return updated;
  });
}

const titleFor = (action: string) =>
  ({
    submit: "تم التقديم",
    start_review: "قيد المراجعة",
    approve: "معتمد",
    reject: "مرفوض",
    request_changes: "يحتاج تعديلات",
    record_purchase: "تم الشراء",
    reconcile: "تمت المطابقة",
    cancel: "ملغى",
    archive: "مؤرشف",
  })[action] ?? action;

export function targetForExpenseAction(action: string, status: s.ExpenseStatus): s.ExpenseStatus | null {
  const map: Record<string, s.ExpenseStatus> = {
    submit: "submitted",
    start_review: "finance_review",
    approve: "approved",
    request_changes: "changes_requested",
    reject: "rejected",
    record_purchase: "purchased",
    reconcile: "reconciled",
    cancel: "cancelled",
    archive: "archived",
  };
  const target = map[action];
  if (!target) return null;
  return expenseTransitions[status].includes(target) ? target : null;
}

export function expenseActionPermission(action: string) {
  const map: Record<string, string> = {
    submit: "finance.expense.create",
    start_review: "finance.expense.review",
    approve: "finance.expense.approve",
    reject: "finance.expense.approve",
    request_changes: "finance.expense.review",
    record_purchase: "finance.purchase.record",
    reconcile: "finance.reconcile",
    cancel: "finance.expense.create",
    archive: "finance.reconcile",
  };
  return map[action] ?? "finance.expense.review";
}

function nextActorForExpense(row: typeof s.expenseRequests.$inferSelect, actorId: string) {
  if (row.status === "approved" || row.status === "purchased") return row.requesterId === actorId ? null : row.requesterId;
  if (row.status === "reconciled" || row.status === "rejected") return row.requesterId === actorId ? null : row.requesterId;
  if (row.status === "changes_requested") return row.requesterId;
  return null;
}

export type RecordPurchaseInput = {
  expenseId: string;
  vendor: string;
  reference?: string;
  purchasedAt: Date;
  amount: number;
  receiptFileId?: string | null;
  invoiceFileId?: string | null;
  reconciliationNotes?: string;
};

/** Recording a purchase moves the expense to purchased in the same transaction. */
export async function recordPurchase(ctx: Identity, input: RecordPurchaseInput) {
  const expense = await db.query.expenseRequests.findFirst({ where: eq(s.expenseRequests.id, input.expenseId) });
  if (!expense) throw new HttpError(404, "السجل غير متاح");
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(422, "مبلغ الشراء يجب أن يكون رقمًا موجبًا");
  if (!expenseTransitions[expense.status].includes("purchased"))
    throw new HttpError(422, "لا يمكن تسجيل الشراء قبل اعتماد الطلب");
  const vendor = input.vendor.trim();
  if (!vendor) throw new HttpError(422, "المورّد مطلوب");
  return write(ctx, { academicTermId: expense.academicTermId, committeeId: expense.committeeId }, "finance.purchase.record", async (tx) => {
    const [purchase] = await tx
      .insert(s.purchases)
      .values({
        id: financeId(),
        expenseId: expense.id,
        vendor,
        reference: input.reference?.trim() ?? "",
        purchasedAt: input.purchasedAt,
        amount,
        paidById: ctx.user.id,
        receiptFileId: input.receiptFileId ?? null,
        invoiceFileId: input.invoiceFileId ?? null,
        budgetId: expense.budgetId,
        reconciliationNotes: input.reconciliationNotes?.trim() ?? "",
      })
      .returning();
    const [updated] = await tx
      .update(s.expenseRequests)
      .set({ status: "purchased", updatedAt: new Date() })
      .where(eq(s.expenseRequests.id, expense.id))
      .returning();
    await tx.insert(s.expenseDecisions).values({
      id: financeId(),
      expenseId: expense.id,
      actorId: ctx.user.id,
      action: "record_purchase",
      fromStatus: expense.status,
      toStatus: "purchased",
      note: `${vendor} — ${amount}`,
    });
    await record(tx, ctx, {
      action: "expense.record_purchase",
      entityType: "purchase",
      entityId: purchase.id,
      committeeId: expense.committeeId,
      metadata: { vendor, amount, expenseId: expense.id },
    });
    return { purchase, expense: updated };
  });
}

export async function reconcilePurchase(ctx: Identity, purchaseId: string, notes = "") {
  const purchase = await db.query.purchases.findFirst({ where: eq(s.purchases.id, purchaseId) });
  if (!purchase) throw new HttpError(404, "عملية الشراء غير متاحة");
  const expense = await db.query.expenseRequests.findFirst({ where: eq(s.expenseRequests.id, purchase.expenseId) });
  if (!expense) throw new HttpError(404, "السجل غير متاح");
  if (purchase.reconciliationStatus === "reconciled") throw new HttpError(422, "تمت مطابقة هذه العملية مسبقًا");
  return write(ctx, { academicTermId: expense.academicTermId, committeeId: expense.committeeId }, "finance.reconcile", async (tx) => {
    const [updated] = await tx
      .update(s.purchases)
      .set({
        reconciliationStatus: "reconciled",
        reconciliationNotes: notes.trim(),
        reconciledBy: ctx.user.id,
        reconciledAt: new Date(),
      })
      .where(eq(s.purchases.id, purchaseId))
      .returning();
    if (expense.status === "purchased") {
      await tx
        .update(s.expenseRequests)
        .set({ status: "reconciled", updatedAt: new Date() })
        .where(eq(s.expenseRequests.id, expense.id));
      await tx.insert(s.expenseDecisions).values({
        id: financeId(),
        expenseId: expense.id,
        actorId: ctx.user.id,
        action: "reconcile",
        fromStatus: "purchased",
        toStatus: "reconciled",
        note: notes.trim(),
      });
    }
    await record(tx, ctx, {
      action: "purchase.reconcile",
      entityType: "purchase",
      entityId: purchaseId,
      committeeId: expense.committeeId,
      metadata: { expenseId: expense.id },
    });
    return updated;
  });
}

export async function listPurchases(ctx: Identity, expenseId?: string) {
  if (!canViewFinance(ctx)) throw new HttpError(403, "لا تملك صلاحية قراءة العمليات المالية");
  const rows = expenseId
    ? await db.select().from(s.purchases).where(eq(s.purchases.expenseId, expenseId))
    : await db.select().from(s.purchases).orderBy(sql`${s.purchases.purchasedAt} desc`);
  return rows;
}

/** Real alerts derived from stored rows; nothing here is asserted without a record. */
export async function alerts(ctx: Identity) {
  if (!canViewFinance(ctx)) return [];
  return financeAlerts(ctx, db);
}

export async function summary(ctx: Identity) {
  if (!canViewFinance(ctx)) return null;
  const [budgets, expenses, purchases] = await Promise.all([
    visibleBudgetIds(ctx).then((v) =>
      v.all
        ? db.select().from(s.budgets).orderBy(sql`${s.budgets.createdAt} desc`)
        : db.select().from(s.budgets).where(inArray(s.budgets.id, v.ids.length ? v.ids : ["__none__"])),
    ),
    listExpenses(ctx).catch(() => []),
    db.select().from(s.purchases),
  ]);
  const totals = await budgetTotals(db, budgets);
  const expenseIds = new Set(expenses.map((e) => e.id));
  const visiblePurchases = purchases.filter((p) => expenseIds.has(p.expenseId));
  return {
    budgets: budgets.map((b) => ({ ...b, totals: totals[b.id] })),
    expenses,
    purchases: visiblePurchases,
    unreconciled: visiblePurchases.filter((p) => p.reconciliationStatus === "pending"),
    pendingReview: expenses.filter((e) => e.status === "submitted" || e.status === "finance_review"),
    open: expenses.filter((e) => openExpenseStatuses.includes(e.status)),
  };
}

/** Re-checks the active term inside a transaction, used by every finance write. */
export async function requireActiveTerm(tx: Connection, academicTermId: string) {
  await activeTerm(academicTermId, tx);
}

export async function freshGrants(ctx: Identity, conn: Connection = db) {
  const fresh = await actorContext(ctx.user.id, conn);
  ctx.grants = fresh.grants;
  return ctx.grants;
}

export const financeGrant = grant;