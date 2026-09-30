import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { audit, hasPermission, requireActiveSession, write } from "./helpers";
import { sourceScope } from "./evidence.service";
async function visible(ctx: Identity, row: typeof s.governanceAlerts.$inferSelect) {
  if (!(ctx.grants.some(g => g.permission === "governance.alerts"))) return false;
  if (row.relatedEntityType === "general") return hasPermission(ctx, "governance.alerts");
  if (!row.relatedEntityId || row.relatedEntityType === "approval") return false;
  try { await sourceScope(ctx, row.relatedEntityType, row.relatedEntityId); return true; } catch (e) { if (e instanceof HttpError && [403, 404].includes(e.status)) return false; throw e; }
}
export async function listAlerts(ctx: Identity, filters: { type?: s.GovernanceAlertType; severity?: s.GovernanceAlertSeverity; dismissed?: boolean; relatedEntityType?: s.GovernanceAlertEntityType; relatedEntityId?: string } = {}) {
  await requireActiveSession(ctx);
  const rows = await db.select().from(s.governanceAlerts).where(and(filters.type ? eq(s.governanceAlerts.type, filters.type) : undefined, filters.severity ? eq(s.governanceAlerts.severity, filters.severity) : undefined, filters.relatedEntityType ? eq(s.governanceAlerts.relatedEntityType, filters.relatedEntityType) : undefined, filters.relatedEntityId ? eq(s.governanceAlerts.relatedEntityId, filters.relatedEntityId) : undefined)).orderBy(desc(s.governanceAlerts.createdAt));
  const result: typeof rows = []; for (const row of rows) if ((filters.dismissed === undefined || Boolean(row.dismissedAt) === filters.dismissed) && await visible(ctx, row)) result.push(row); return result;
}
export async function getAlert(ctx: Identity, id: string) { const row = (await listAlerts(ctx)).find(r => r.id === id); if (!row) throw new HttpError(404, "التنبيه غير متاح"); return row; }
export async function createAlert(ctx: Identity, input: { type: s.GovernanceAlertType; title: string; description?: string; severity: s.GovernanceAlertSeverity; relatedEntityType: Exclude<s.GovernanceAlertEntityType, "general" | "approval">; relatedEntityId: string }) {
  const scope = await sourceScope(ctx, input.relatedEntityType, input.relatedEntityId);
  return write(ctx, scope, "organization.manage", async tx => { const [row] = await tx.insert(s.governanceAlerts).values(input).returning(); await audit(tx, ctx, "governance_alert", row.id, "created"); return row; });
}
export async function dismissAlert(ctx: Identity, id: string) {
  const row = await getAlert(ctx, id);
  if (!row.relatedEntityId || row.relatedEntityType === "general" || row.relatedEntityType === "approval") throw new HttpError(409, "التنبيه للقراءة فقط");
  const scope = await sourceScope(ctx, row.relatedEntityType, row.relatedEntityId);
  return write(ctx, scope, "organization.manage", async tx => { const [updated] = await tx.update(s.governanceAlerts).set({ dismissedAt: new Date(), dismissedBy: ctx.user.id }).where(eq(s.governanceAlerts.id, id)).returning(); await audit(tx, ctx, "governance_alert", id, "dismissed"); return updated; });
}
export async function deleteAlert(ctx: Identity, id: string) { await getAlert(ctx, id); throw new HttpError(409, "استخدم التجاهل مع حفظ سجل التنبيه"); }
