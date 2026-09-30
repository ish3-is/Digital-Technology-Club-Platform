import { beforeAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, and, sql } from "drizzle-orm";
import * as s from "../src/db/schema";
import { roleCatalog, permissionCatalog } from "../src/db/catalog";
const database = drizzle(new PGlite(), { schema: s });
Object.assign(globalThis, { clubDb: database });
process.env.BETTER_AUTH_SECRET =
  "work-test-secret-with-at-least-thirty-two-characters";
const access = await import("../src/lib/work/access");
const engine = await import("../src/lib/work/engine");
const query = await import("../src/lib/work/queries");
const storage = await import("../src/lib/work/storage");
const { deliverDueSoon } = await import("../src/lib/work/due");
const model = await import("../src/lib/work/model");
type Context = Awaited<ReturnType<typeof access.actorContext>>;
let a: Context, b: Context, m: Context, other: Context, admin: Context;
const base = {
  kind: "task",
  title: "مهمة اختبار",
  committeeId: "a",
  termId: "term",
  responsibleId: "member-a",
  reviewerId: "head-a",
};
async function task(title = "مهمة اختبار") {
  return engine.createWork(a, { ...base, title });
}
async function toReview(id: string, actor = m) {
  let d = await access.getWork(actor, id);
  if (d.status === "not_started")
    d = await engine.transition(actor, id, "in_progress", d.version);
  return engine.transition(actor, id, "review", d.version);
}
beforeAll(async () => {
  await migrate(database, { migrationsFolder: "migrations" });
  for (const [id, description] of Object.entries(permissionCatalog))
    await database.insert(s.permissions).values({ id, description });
  for (const [id, r] of Object.entries(roleCatalog)) {
    await database.insert(s.roles).values({ id, name: r.name });
    for (const permissionId of r.permissions)
      await database
        .insert(s.rolePermissions)
        .values({ roleId: id, permissionId })
        .onConflictDoNothing();
  }
  await database.insert(s.committees).values([
    { id: "a", name: "لجنة أ" },
    { id: "b", name: "لجنة ب" },
  ]);
  await database.insert(s.terms).values([
    {
      id: "term",
      name: "فصل تجريبي",
      year: "تجريبي",
      status: "active",
      startAt: new Date("2026-01-01"),
      endAt: new Date("2028-01-01"),
    },
    {
      id: "closed",
      name: "فصل مغلق",
      year: "تجريبي",
      status: "closed",
      startAt: new Date("2024-01-01"),
      endAt: new Date("2025-01-01"),
    },
  ]);
  for (const [id, role, committee] of [
    ["head-a", "committee_head", "a"],
    ["head-b", "committee_head", "b"],
    ["member-a", "committee_member", "a"],
    ["member-b", "committee_member", "b"],
    ["admin", "system_admin", ""],
  ]) {
    await database.insert(s.user).values({
      id,
      name: `بيانات تجريبية ${id}`,
      email: `${id}@example.test`,
      onboarded: true,
    });
    await database.insert(s.assignments).values({
      id: `role-${id}`,
      userId: id,
      roleId: role,
      committeeId: committee || null,
      scope: committee ? "committee" : "club",
      termId: "term",
    });
  }
  [a, b, m, other, admin] = await Promise.all(
    ["head-a", "head-b", "member-a", "member-b", "admin"].map((id) =>
      access.actorContext(id),
    ),
  );
});

const gov = await import('../src/lib/governance');
const governanceQueries = await import('../src/lib/governance/queries');

it('returns actual creation grants and scoped UI contexts without granting them to readers', async () => {
  const options = await governanceQueries.governanceOptions(admin);
  expect(options.roles).toContainEqual({ id: 'system_admin', name: 'مدير النظام' });
  expect(options.grantedCreatePermissions).toEqual(expect.arrayContaining(['goal.create', 'initiative.create', 'kpi.create', 'evidence.create', 'report.create']));
  expect(options.contexts.some(c => c.academicTermId === 'term' && c.permissions.includes('goal.create'))).toBe(true);
  const member = await governanceQueries.governanceOptions(m);
  expect(member.grantedCreatePermissions).toEqual([]);
  expect(member.contexts.some(c => c.permissions.some(p => p.endsWith('.create')))).toBe(false);
});

it('explains missing active terms while preserving admin grants and blocking creation contexts', async () => {
  await database.update(s.terms).set({ status: 'closed' }).where(eq(s.terms.id, 'term'));
  try {
    const options = await governanceQueries.governanceOptions(admin);
    expect(options.activeTermCount).toBe(0);
    expect(options.contexts).toEqual([]);
  } finally { await database.update(s.terms).set({ status: 'active' }).where(eq(s.terms.id, 'term')); }
});
const reports = await import('../src/lib/governance/reports.service');
const evidence = await import('../src/lib/governance/evidence.service');
let reviewer: Context;
beforeAll(async () => {
  await database.insert(s.user).values({ id: 'reviewer', name: 'مراجع مستقل', email: 'reviewer@example.test', onboarded: true });
  await database.insert(s.assignments).values({ id: 'reviewer-role', userId: 'reviewer', roleId: 'supervisor', scope: 'club', termId: 'term' });
  reviewer = await access.actorContext('reviewer');
});
const goalInput = { title: 'هدف مؤسسي تجريبي', academicTermId: 'term', committeeId: 'a' };
const kpiInput = { name: 'مؤشر تجريبي', academicTermId: 'term', committeeId: 'a', unit: 'عدد', direction: 'higher_is_better' as const, targetValue: 10, measurementFrequency: 'weekly' as const };
async function reportDraft() {
  const r = await reports.createReport(a, { title: 'تقرير مؤسسي تجريبي', summary: 'ملخص موثق', academicTermId: 'term', committeeId: 'a', typeId: 'weekly_committee', periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-07'), sectionKeys: ['achievements'] });
  const detail = await reports.getReport(a, r.id);
  await reports.updateSection(a, detail.sections[0].id, { content: 'إنجاز موثق' });
  await reports.assignReviewers(a, r.id, [reviewer.user.id]);
  return r;
}
describe('Phase 4 security and workflows', () => {
  it('scopes goals, initiatives and KPIs by committee and denies member creation', async () => {
    const g = await gov.createGoal(a, goalInput);
    await expect(gov.getGoal(b, g.id)).rejects.toMatchObject({ status: 404 });
    expect((await gov.listGoals(b)).some(x => x.id === g.id)).toBe(false);
    await expect(gov.createGoal(m, goalInput)).rejects.toMatchObject({ status: 403 });
    const i = await gov.createInitiative(a, { title: 'مبادرة مرتبطة', goalId: g.id });
    expect(i.committeeId).toBe('a');
    await expect(gov.getInitiative(b, i.id)).rejects.toMatchObject({ status: 404 });
    await expect(gov.createKpi(b, { ...kpiInput, committeeId: 'b', goalId: g.id })).rejects.toMatchObject({ status: 404 });
  });
  it('rejects expired grants and closed seasons', async () => {
    await expect(gov.createGoal(admin, { ...goalInput, academicTermId: 'closed' })).rejects.toMatchObject({ status: 409 });
    await database.update(s.assignments).set({ startAt: new Date('2026-01-01'), endAt: new Date('2026-09-01') }).where(eq(s.assignments.id, 'role-head-b'));
    await expect(gov.createGoal(b, { ...goalInput, committeeId: 'b' })).rejects.toMatchObject({ status: 403 });
    await database.update(s.assignments).set({ endAt: null }).where(eq(s.assignments.id, 'role-head-b'));
  });
  it('keeps measurements atomic and orders backdated values correctly', async () => {
    const k = await gov.createKpi(a, { ...kpiInput, targetValue: 0, direction: 'lower_is_better' });
    await gov.addKpiMeasurement(a, { kpiId: k.id, value: 7, measuredAt: new Date('2026-09-20'), sourceType: 'manual' });
    await gov.addKpiMeasurement(a, { kpiId: k.id, value: 3, measuredAt: new Date('2026-09-10'), sourceType: 'manual' });
    expect((await gov.getKpi(a, k.id)).currentValue).toBe(7);
    await expect(gov.addKpiMeasurement(m, { kpiId: k.id, value: 2, measuredAt: new Date(), sourceType: 'manual' })).rejects.toMatchObject({ status: 403 });
    await expect(gov.addKpiMeasurement(a, { kpiId: k.id, value: 1.5, measuredAt: new Date(), sourceType: 'manual' })).rejects.toMatchObject({ status: 422 });
    expect((await gov.getKpiMeasurements(a, k.id))).toHaveLength(2);
    await expect(gov.addKpiMeasurement(a, { kpiId: k.id, value: 80, measuredAt: new Date(), sourceType: 'attendance_derived' })).rejects.toMatchObject({ status: 422 });
  });
  it('does not equate evidence viewing with verification; preserves verifier provenance', async () => {
    const g = await gov.createGoal(a, goalInput);
    const e = await gov.createEvidence(a, { title: 'دليل موثق', description: 'وصف المصدر', evidenceType: 'manual', sourceEntityType: 'goal', sourceEntityId: g.id });
    await expect(gov.verifyEvidence(m, e.id, { decision: 'reviewed' })).rejects.toMatchObject({ status: 403 });
    await expect(gov.verifyEvidence(a, e.id, { decision: 'reviewed' })).rejects.toMatchObject({ status: 403 });
    await expect(gov.getEvidence(b, e.id)).rejects.toMatchObject({ status: 404 });
    expect((await gov.listEvidence(b)).some(x => x.id === e.id)).toBe(false);
    expect((await gov.verifyEvidence(admin, e.id, { decision: 'reviewed', comment: 'تم فحص المصدر' })).verificationStatus).toBe('reviewed');
    const [audit] = await database.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, e.id), eq(s.auditLogs.action, 'verified')));
    expect(audit.actorId).toBe(admin.user.id);
    expect(audit.newValue).toMatchObject({ comment: 'تم فحص المصدر' });
    await expect(gov.updateEvidence(a, e.id, { description: 'تغيير بعد التحقق' })).rejects.toMatchObject({ status: 409 });
  });
  it('protects classified files and rejects arbitrary file references or unsafe URLs', async () => {
    const g = await gov.createGoal(a, goalInput);
    const base = { title: 'ملف دليل محمي', evidenceType: 'file' as const, sourceEntityType: 'goal' as const, sourceEntityId: g.id, classification: 'confidential' as const };
    const e = await evidence.createEvidence(a, base, { name: 'proof.txt', mime: 'text/plain', bytes: Buffer.from('وثيقة اختبار') });
    expect((await evidence.downloadEvidence(a, e.id)).content.toString()).toBe('وثيقة اختبار');
    await expect(evidence.downloadEvidence(m, e.id)).rejects.toMatchObject({ status: 404 });
    await expect(evidence.createEvidence(a, { ...base, fileId: e.fileId ?? '' })).rejects.toMatchObject({ status: 422 });
    await expect(evidence.createEvidence(a, { ...base, url: 'javascript:alert(1)' })).rejects.toMatchObject({ status: 422 });
  });
  it('requires all independent reviews then a separate approve permission and freezes content', async () => {
    const r = await reportDraft();
    await reports.submitReport(a, r.id);
    await expect(reports.updateReport(a, r.id, { summary: 'تغيير' })).rejects.toMatchObject({ status: 409 });
    await reports.reviewReport(reviewer, r.id, { decision: 'approved', comment: 'توصية بالموافقة' });
    expect((await reports.getReport(a, r.id)).status).toBe('under_review');
    await expect(reports.approveReport(reviewer, r.id)).rejects.toMatchObject({ status: 403 });
    await expect(reports.approveReport(a, r.id)).rejects.toMatchObject({ status: 403 });
    expect((await reports.approveReport(admin, r.id)).status).toBe('approved');
    await expect(reports.submitReport(a, r.id)).rejects.toMatchObject({ status: 409 });
    await expect(reports.updateSection(a, (await reports.getReport(a, r.id)).sections[0].id, { content: 'تغيير' })).rejects.toMatchObject({ status: 409 });
    expect((await reports.archiveReport(a, r.id)).status).toBe('archived');
  });
  it('returns changes requested to editing and retains review audit history', async () => {
    const r = await reportDraft(); await reports.submitReport(a, r.id);
    await reports.reviewReport(reviewer, r.id, { decision: 'changes_requested', comment: 'أضف التفاصيل' });
    await reports.updateReport(a, r.id, { summary: 'ملخص محسن' });
    await reports.submitReport(a, r.id);
    await reports.reviewReport(reviewer, r.id, { decision: 'approved' });
    expect((await database.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, r.id), eq(s.auditLogs.action, 'reviewed'))))).toHaveLength(2);
  });
  it('rolls back the domain write if the audit fails', async () => {
    await database.execute(sql`CREATE OR REPLACE FUNCTION fail_governance_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='goal' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$`);
    await database.execute(sql`CREATE TRIGGER test_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_governance_test()`);
    const before = (await gov.listGoals(a)).length;
    await expect(gov.createGoal(a, goalInput)).rejects.toThrow();
    expect((await gov.listGoals(a)).length).toBe(before);
    await database.execute(sql`DROP TRIGGER test_fail_audit ON audit_logs`);
  });
});

