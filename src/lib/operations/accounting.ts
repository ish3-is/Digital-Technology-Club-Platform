import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Connection } from "@/lib/work/access";
import type { Identity } from "@/lib/services";
import { hasLiveGrant } from "@/lib/people/helpers";
import { openExpenseStatuses } from "./types";

/**
 * Budget totals are always derived from the stored rows. Nothing here is
 * persisted, so an expense can never leave a budget's totals stale.
 *
 *   committed = approved but not yet purchased
 *   spent     = the amount actually recorded on reconciled/purchased purchases
 *   remaining = allocated - committed - spent
 *
 * `spent` deliberately comes from the purchase row rather than the expense:
 * the purchase carries what was really paid (which may differ from the
 * requested amount), and a purchase awaiting reconciliation is still committed.
 */
export type BudgetTotals = {
  allocated: number;
  committed: number;
  spent: number;
  remaining: number;
  utilizationPercent: number;
  overspent: boolean;
  nearLimit: boolean;
};

export function calculateBudget(
  budget: { allocatedAmount: number; alertThresholdPercent: number },
  expenses: { id?: string; status: string; amount: number }[],
  purchases: { expenseId: string; amount: number; reconciliationStatus: string }[] = [],
): BudgetTotals {
  const purchasedExpenseIds = new Set(
    purchases.filter((p) => p.reconciliationStatus !== "pending").map((p) => p.expenseId),
  );
  // Only purchases that exist contribute; an expense with no purchase row yet
  // is still just committed.
  const spent = purchases
    .filter((p) => p.reconciliationStatus !== "pending")
    .reduce((sum, p) => sum + p.amount, 0);
  const committed = expenses
    .filter((e) => e.status === "approved" || (e.status === "purchased" && !purchasedExpenseIds.has(e.id!)))
    .reduce((sum, e) => sum + e.amount, 0);
  const allocated = budget.allocatedAmount;
  const consumed = committed + spent;
  const remaining = allocated - consumed;
  const utilizationPercent = allocated > 0 ? Math.round((consumed / allocated) * 100) : 0;
  return {
    allocated,
    committed,
    spent,
    remaining,
    utilizationPercent,
    overspent: remaining < 0,
    nearLimit: utilizationPercent >= budget.alertThresholdPercent && remaining >= 0,
  };
}

export type FinanceAlert = {
  kind: string;
  severity: "info" | "warning" | "critical";
  budgetId: string | null;
  entityId: string;
  message: string;
};

/**
 * Alerts are derived from records that exist right now. There is no stored
 * alert table and no invented threshold — each rule maps to a real row state.
 */
export async function financeAlerts(ctx: Identity, conn: Connection) {
  const alerts: FinanceAlert[] = [];
  const now = new Date();

  const budgets = await conn.select().from(s.budgets).where(eq(s.budgets.status, "active"));
  const expenses = await conn
    .select({
      id: s.expenseRequests.id,
      budgetId: s.expenseRequests.budgetId,
      title: s.expenseRequests.title,
      status: s.expenseRequests.status,
      amount: s.expenseRequests.amount,
      neededBy: s.expenseRequests.neededBy,
      committeeId: s.expenseRequests.committeeId,
      eventId: s.expenseRequests.eventId,
    })
    .from(s.expenseRequests);

  for (const budget of budgets) {
    const rows = expenses.filter((e) => e.budgetId === budget.id);
    const totals = calculateBudget(budget, rows);
    if (totals.overspent)
      alerts.push({
        kind: "budget_exceeded",
        severity: "critical",
        budgetId: budget.id,
        entityId: budget.id,
        message: `تجاوز "${budget.title}" الميزانية المعتمدة بمبلغ ${Math.abs(totals.remaining)}`,
      });
    else if (totals.nearLimit)
      alerts.push({
        kind: "budget_near_limit",
        severity: "warning",
        budgetId: budget.id,
        entityId: budget.id,
        message: `"${budget.title}" وصل إلى ${totals.utilizationPercent}% من الاستهلاك`,
      });
  }

  for (const e of expenses) {
    if (e.status === "approved")
      alerts.push({
        kind: "approved_not_purchased",
        severity: "info",
        budgetId: e.budgetId,
        entityId: e.id,
        message: `"${e.title}" معتمد ولم يُسجَّل شراؤه بعد`,
      });
    // Overdue only against a date someone actually recorded.
    if (e.neededBy && e.neededBy < now && openExpenseStatuses.includes(e.status as never))
      alerts.push({
        kind: "expense_overdue",
        severity: "warning",
        budgetId: e.budgetId,
        entityId: e.id,
        message: `"${e.title}" تجاوز تاريخ الاحتياج وهو في حالة ${e.status}`,
      });
  }

  const expenseIds = expenses.map((e) => e.id);
  if (expenseIds.length) {
    const purchases = await conn
      .select({
        id: s.purchases.id,
        expenseId: s.purchases.expenseId,
        vendor: s.purchases.vendor,
        reconciliationStatus: s.purchases.reconciliationStatus,
        receiptFileId: s.purchases.receiptFileId,
      })
      .from(s.purchases);
    for (const p of purchases) {
      const expense = expenses.find((e) => e.id === p.expenseId);
      if (!expense || !expenseIds.includes(p.expenseId)) continue;
      if (p.reconciliationStatus === "pending")
        alerts.push({
          kind: "unreconciled_purchase",
          severity: "warning",
          budgetId: expense.budgetId,
          entityId: p.id,
          message: `شراء "${p.vendor}" لم يُطابَق بعد`,
        });
      if (!p.receiptFileId)
        alerts.push({
          kind: "missing_receipt",
          severity: "info",
          budgetId: expense.budgetId,
          entityId: p.id,
          message: `لا يوجد إيصال مسجل لشراء "${p.vendor}"`,
        });
    }
  }

  return alerts.filter((a) => inFinanceScope(ctx, a, budgets, expenses));
}

/** Keeps alerts scoped the same way the finance lists are. */
function inFinanceScope(
  ctx: Identity,
  alert: FinanceAlert,
  budgets: (typeof s.budgets.$inferSelect)[],
  expenses: { id: string; budgetId: string | null; committeeId: string | null }[],
) {
  if (!hasLiveGrant(ctx, "finance.view")) return false;
  const now = new Date();
  const live = ctx.grants.filter(
    (g) =>
      g.permission === "finance.view" &&
      g.active &&
      g.startAt <= now &&
      (!g.endAt || g.endAt > now) &&
      g.termStatus !== "closed",
  );
  if (live.some((g) => g.scope === "club")) return true;
  const committeeIds = new Set(live.map((g) => g.committeeId).filter((x): x is string => Boolean(x)));
  const ownExpenseIds = new Set(expenses.filter((e) => e.budgetId === null).map((e) => e.id));
  if (alert.budgetId) {
    const budget = budgets.find((b) => b.id === alert.budgetId);
    if (!budget) return false;
    if (budget.committeeId && committeeIds.has(budget.committeeId)) return true;
    return expenses.some((e) => e.budgetId === alert.budgetId && ownExpenseIds.has(e.id));
  }
  const expense = expenses.find((e) => e.id === alert.entityId);
  if (!expense) return false;
  return Boolean(expense.committeeId && committeeIds.has(expense.committeeId));
}

/** Utilisation per budget, for the finance chart. Derived from real rows. */
export async function utilizationSeries(conn: Connection) {
  const budgets = await conn.select().from(s.budgets);
  if (!budgets.length) return [];
  const expenses = await conn
    .select({
      budgetId: s.expenseRequests.budgetId,
      status: s.expenseRequests.status,
      amount: s.expenseRequests.amount,
    })
    .from(s.expenseRequests);
  return budgets.map((b) => {
    const totals = calculateBudget(b, expenses.filter((e) => e.budgetId === b.id));
    return {
      budgetId: b.id,
      title: b.title,
      committed: totals.committed,
      spent: totals.spent,
      utilizationPercent: totals.utilizationPercent,
      overspent: totals.overspent,
    };
  });
}

/** Total committed and spent, for the operations home headline. */
export async function financeTotals(conn: Connection, expenses: { status: string; amount: number }[]) {
  const committed = expenses
    .filter((e) => e.status === "approved")
    .reduce((sum, e) => sum + e.amount, 0);
  const spent = expenses
    .filter((e) => e.status === "purchased" || e.status === "reconciled")
    .reduce((sum, e) => sum + e.amount, 0);
  return { committed, spent };
}