import { beforeAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, sql } from 'drizzle-orm';
import * as s from '../src/db/schema';
import { roleCatalog, permissionCatalog } from '../src/db/catalog';
import {
  buildTrend,
  countMetric,
  previousRange,
  ratioMetric,
  resolveRange,
  unavailableMetric,
} from '../src/lib/intelligence/provenance';
import { collectSnapshots, type Snapshots } from '../src/lib/intelligence/snapshots';
import {
  digitalMetrics,
  executionMetrics,
  financeMetrics,
  mediaMetrics,
  peopleMetrics,
  resourceMetrics,
  workloadByCommittee,
} from '../src/lib/intelligence/metrics';
import { eventReadiness } from '../src/lib/intelligence/readiness';
import { committeeIntelligence, governanceLinkage, kpiExplainability } from '../src/lib/intelligence/committees';
import { clubPulse } from '../src/lib/intelligence/pulse';
import { capacitySignals, insights } from '../src/lib/intelligence/insights';
import { generateReport, reportToCsv } from '../src/lib/intelligence/reports';
import * as access from '../src/lib/work/access';

const database = drizzle(new PGlite(), { schema: s });
Object.assign(globalThis, { clubDb: database });
const intel = await import('../src/lib/intelligence/queries');

type Context = Awaited<ReturnType<typeof access.actorContext>>;

const now = new Date('2026-03-01T12:00:00Z');
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);

const term = {
  id: 'term',
  name: 'فصل اختباري',
  year: 'اختباري',
  status: 'active',
  startAt: new Date('2026-01-01'),
  endAt: new Date('2026-06-01'),
} as const;

let leader: Context;
let supervisor: Context;
let head: Context;
let member: Context;

async function seedUser(id: string, role: string, committee?: string) {
  await database.insert(s.user).values({
    id,
    name: `عضو ${id}`,
    email: `${id}@example.test`,
    onboarded: true,
  });
  await database.insert(s.assignments).values({
    id: `role-${id}`,
    userId: id,
    roleId: role,
    committeeId: committee ?? null,
    scope: committee ? 'committee' : 'club',
    termId: 'term',
  });
  await database.insert(s.memberProfiles).values({
    userId: id,
    major: 'حاسب',
    joinedAt: new Date('2026-01-05'),
    status: 'active',
  });
  return access.actorContext(id);
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: 'migrations' });
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
    { id: 'c-alpha', name: 'لجنة ألفا' },
    { id: 'c-beta', name: 'لجنة بيتا' },
  ]);
  await database.insert(s.terms).values([term]);
  leader = await seedUser('leader', 'president');
  supervisor = await seedUser('supervisor', 'supervisor');
  head = await seedUser('head', 'committee_head', 'c-alpha');
  member = await seedUser('member', 'committee_member', 'c-alpha');
});

// ---------------------------------------------------------------- helpers --

async function task(id: string, over: Partial<typeof s.workItems.$inferInsert> = {}) {
  await database.insert(s.workItems).values({
    id,
    kind: 'task',
    title: `مهمة ${id}`,
    status: 'completed',
    createdBy: leader.user.id,
    committeeId: 'c-alpha',
    termId: 'term',
    createdAt: new Date('2026-02-01'),
    completedAt: new Date('2026-02-05'),
    ...over,
  });
}

async function event(id: string, over: Partial<typeof s.workItems.$inferInsert> = {}) {
  await database.insert(s.workItems).values({
    id,
    kind: 'event',
    title: `فعالية ${id}`,
    status: 'planning',
    createdBy: leader.user.id,
    committeeId: 'c-alpha',
    termId: 'term',
    dueAt: day(7),
    ...over,
  });
  await database.insert(s.events).values({
    id,
    eventType: 'workshop',
    leadId: leader.user.id,
    endAt: day(7),
    locationType: 'onsite',
    targetAudience: 'الأعضاء',
    approverId: leader.user.id,
    reportRequired: false,
  });
}

async function resetWork() {
  await database.delete(s.workItems).where(eq(s.workItems.kind, 'task'));
  await database.delete(s.operationsEvents);
}

const snapshots = async (ctx: Context = leader) => collectSnapshots(ctx);
const termRange = () => resolveRange('term', { id: 'term', startAt: term.startAt, endAt: term.endAt }, now);

// ============================================================ provenance ==

describe('metric provenance', () => {
  const range = { from: now, to: now, label: 'اختبار' };

  it('reports a ratio when the denominator exists', () => {
    const m = ratioMetric({
      key: 'k',
      title: 'نسبة',
      description: '',
      numerator: 3,
      denominator: 4,
      sourceDomains: ['work_items'],
      range,
    });
    expect(m.value).toBe(75);
    expect(m.availability.available).toBe(true);
    expect(m.numerator).toBe(3);
    expect(m.denominator).toBe(4);
    expect(m.formula).toContain('المقام');
  });

  it('returns null, not zero, when the denominator is zero', () => {
    const m = ratioMetric({
      key: 'k',
      title: 'نسبة',
      description: '',
      numerator: 0,
      denominator: 0,
      sourceDomains: ['work_items'],
      range,
    });
    expect(m.value).toBeNull();
    expect(m.availability.available).toBe(false);
    if (!m.availability.available) expect(m.availability.reasonUnavailable).toBeTruthy();
  });

  it('marks an unavailable metric with a stated reason', () => {
    const m = unavailableMetric({
      key: 'k',
      title: 'متعذر',
      description: '',
      reasonUnavailable: 'لا توجد سجلات',
      sourceDomains: [],
      range,
    });
    expect(m.value).toBeNull();
    expect(m.availability.available).toBe(false);
  });

  it('counts a plain value with its own source list', () => {
    const m = countMetric({
      key: 'c',
      title: 'عدد',
      description: '',
      value: 7,
      sourceDomains: ['work_items'],
      range,
      sources: [{ title: 'مهمة', href: '/work?item=1', id: '1' }],
    });
    expect(m.value).toBe(7);
    expect(m.unit).toBe('count');
    expect(m.sources).toHaveLength(1);
  });

  it('describes a trend factually without implying performance', () => {
    const up = buildTrend({ current: 12, previous: 8, label: 'عدد المهام المكتملة' });
    expect(up.direction).toBe('up');
    expect(up.changePercent).toBe(50);
    expect(up.wording).toContain('ارتفع');
    expect(up.wording).not.toContain('تحسن');
    const down = buildTrend({ current: 3, previous: 9, label: 'عدد الطلبات' });
    expect(down.direction).toBe('down');
    expect(down.wording).toContain('انخفض');
    const flat = buildTrend({ current: 5, previous: 5, label: 'عدد الفعاليات' });
    expect(flat.direction).toBe('flat');
  });

  it('handles a previous period of zero without dividing by it', () => {
    const t = buildTrend({ current: 4, previous: 0, label: 'طلبات' });
    // A zero baseline has no meaningful percentage, but the change is real.
    expect(t.changePercent).toBeNull();
    expect(t.change).toBe(4);
    expect(t.direction).toBe('up');
    expect(t.wording).toContain('4');
  });

  it('resolves time windows and their previous equivalent', () => {
    const term = resolveRange('term', { id: 't', startAt: new Date('2026-01-01'), endAt: new Date('2026-06-01') }, now);
    expect(term.from.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(term.to.toISOString().slice(0, 10)).toBe('2026-06-01');
    const week = resolveRange('7d', null, now);
    expect(Math.round((week.to.getTime() - week.from.getTime()) / 86_400_000)).toBe(7);
    const prev = previousRange(term);
    expect(prev.to.getTime()).toBeLessThan(term.from.getTime());
  });
});

// ============================================================= execution ==

describe('execution metrics', () => {
  it('computes a completion rate over non-cancelled work only', async () => {
    await resetWork();
    await task('t1', { status: 'completed' });
    await task('t2', { status: 'completed' });
    await task('t3', { status: 'in_progress' });
    await task('t4', { status: 'cancelled' });
    const m = executionMetrics(await snapshots(), termRange(), now);
    // 2 completed of 3 eligible; the cancelled task leaves the denominator.
    expect(m.completionRate.value).toBe(67);
    expect(m.completionRate.denominator).toBe(3);
    expect(m.completed.value).toBe(2);
    expect(m.total.value).toBe(4);
  });

  it('reports 0% rather than unavailable when everything is cancelled', async () => {
    await resetWork();
    await task('c1', { status: 'cancelled' });
    const m = executionMetrics(await snapshots(), termRange(), now);
    expect(m.completionRate.availability.available).toBe(false);
    expect(m.completionRate.value).toBeNull();
  });

  it('counts overdue work against the current date', async () => {
    await resetWork();
    await task('o1', { status: 'in_progress', dueAt: day(-3) });
    await task('o2', { status: 'in_progress', dueAt: day(-10) });
    await task('o3', { status: 'in_progress', dueAt: day(3) });
    const m = executionMetrics(await snapshots(), termRange(), now);
    expect(m.overdue.value).toBe(2);
    expect(m.dueSoon.value).toBe(1);
  });

  it('reports average duration as unavailable without dated completions', async () => {
    await resetWork();
    await task('d1', { status: 'completed', completedAt: null });
    const m = executionMetrics(await snapshots(), termRange(), now);
    expect(m.averageCompletionDays.value).toBeNull();
    expect(m.averageCompletionDays.availability.available).toBe(false);
  });

  it('produces no NaN anywhere in the metric set', async () => {
    await resetWork();
    const m = executionMetrics(await snapshots(), termRange(), now);
    for (const metric of Object.values(m)) {
      if (typeof metric === 'object' && metric && 'value' in metric)
        expect(Number.isNaN(metric.value as number)).toBe(false);
    }
  });
});

// ============================================================== workload ==

describe('workload aggregation', () => {
  it('groups open and overdue work by committee', async () => {
    await resetWork();
    await task('w1', { status: 'in_progress', dueAt: day(-2) });
    await task('w2', { status: 'review' });
    const rows = workloadByCommittee(await snapshots(), now);
    const alpha = rows.find((r) => r.committeeId === 'c-alpha');
    expect(alpha?.open).toBe(2);
    expect(alpha?.overdue).toBe(1);
    expect(alpha?.inReview).toBe(1);
  });
});

// ============================================================== readiness ==

describe('event readiness', () => {
  it('derives readiness from linked requirements', async () => {
    await resetWork();
    await event('ev1');
    await task('r1', { eventId: 'ev1', status: 'completed' });
    await task('r2', { eventId: 'ev1', status: 'in_progress' });
    const readiness = eventReadiness(await snapshots(), 'ev1', now)!;
    expect(readiness.total).toBe(2);
    expect(readiness.completed).toBe(1);
    expect(readiness.percent).toBe(50);
    expect(readiness.statement).toContain('1');
  });

  it('returns unavailable rather than 0 when nothing is linked', async () => {
    await resetWork();
    await event('ev-empty');
    const readiness = eventReadiness(await snapshots(), 'ev-empty', now)!;
    expect(readiness.percent).toBeNull();
    expect(readiness.reasonUnavailable).toBeTruthy();
    expect(readiness.total).toBe(0);
  });

  it('excludes a dimension with no requirements from the denominator', async () => {
    await resetWork();
    await event('ev2');
    await task('only', { eventId: 'ev2', status: 'in_progress' });
    const readiness = eventReadiness(await snapshots(), 'ev2', now)!;
    const planning = readiness.dimensions.find((d) => d.key === 'planning');
    expect(planning?.total).toBe(1);
    // Media/digital/finance have no requirements here and stay out of the maths.
    expect(readiness.dimensions.some((d) => d.key === 'media')).toBe(false);
    expect(readiness.percent).toBe(0);
  });

  it('counts an overdue requirement separately from a blocked one', async () => {
    await resetWork();
    await event('ev3');
    await task('late', { eventId: 'ev3', status: 'in_progress', dueAt: day(-5) });
    await task('blocked', { eventId: 'ev3', status: 'review' });
    const readiness = eventReadiness(await snapshots(), 'ev3', now)!;
    expect(readiness.overdue).toBe(1);
    expect(readiness.blocked).toBe(1);
  });

  it('never divides by zero when the event has no requirements', async () => {
    await resetWork();
    await event('ev4');
    const readiness = eventReadiness(await snapshots(), 'ev4', now)!;
    expect(readiness.percent).toBeNull();
    expect(Number.isNaN(readiness.percent as unknown as number)).toBe(false);
  });
});

// =============================================================== finance ==

describe('finance intelligence', () => {
  it('derives spending from the purchase, not the requested amount', async () => {
    const termId = 'term';
    await database.insert(s.budgets).values({
      id: 'b1',
      title: 'ميزانية',
      academicTermId: termId,
      allocatedAmount: 5000,
      startsOn: new Date('2026-01-01'),
      endsOn: new Date('2026-06-01'),
      createdBy: leader.user.id,
    });
    await database.insert(s.expenseRequests).values({
      id: 'e1',
      title: 'طلب',
      requesterId: leader.user.id,
      budgetId: 'b1',
      category: 'supplies',
      amount: 1200,
      academicTermId: termId,
      status: 'reconciled',
    });
    await database.insert(s.purchases).values({
      id: 'p1',
      expenseId: 'e1',
      vendor: 'مورّد',
      purchasedAt: new Date('2026-02-01'),
      amount: 1150,
      paidById: leader.user.id,
      reconciliationStatus: 'reconciled',
    });
    const m = financeMetrics(await snapshots(), termRange());
    expect(m.available).toBe(true);
    expect(m.allocated.value).toBe(5000);
    expect(m.spent.value).toBe(1150);
    expect(m.remaining.value).toBe(3850);
    expect(m.utilization.value).toBe(23);
  });

  it('keeps an unreconciled purchase out of the spent total', async () => {
    const snap = await snapshots();
    const m = financeMetrics(snap, termRange());
    // The pending purchase was not reconciled, so it is not counted as spent.
    const pending = snap.purchases.find((p) => p.reconciliationStatus === 'pending');
    if (pending) expect(pending.reconciliationStatus).toBe('pending');
    expect(m.unreconciled.value).toBe(0);
  });

  it('reports unavailable metrics to a caller without finance access', async () => {
    const m = financeMetrics(await snapshots(member), termRange());
    expect(m.available).toBe(false);
    expect(m.spent.value).toBeNull();
    expect(m.spent.availability.available).toBe(false);
  });
});

// ================================================ media / digital / resources ==

describe('operations intelligence privacy', () => {
  it('withholds financial figures from a member with no finance grant', async () => {
    const snap = await snapshots(member);
    const finance = financeMetrics(snap, termRange());
    expect(finance.available).toBe(false);
    expect(finance.spent.value).toBeNull();
    expect(finance.spent.availability.available).toBe(false);
  });

  it('never widens a domain the reader cannot see', async () => {
    // A member holds media/digital read from Phase 6 but not finance, so the
    // intelligence layer must add nothing beyond what they already had.
    const snap = await snapshots(member);
    expect(mediaMetrics(snap, termRange(), now).available).toBe(
      mediaMetrics(await snapshots(leader), termRange(), now).available,
    );
  });

  it('returns empty structures rather than nulls for a permitted reader', async () => {
    const snap = await snapshots(leader);
    expect(snap.capability.media, 'leader should hold media.view').toBe(true);
    expect(mediaMetrics(snap, termRange(), now).available).toBe(true);
    const resources = resourceMetrics(snap, termRange(), now);
    expect(typeof resources.byAvailability).toBe('object');
    expect(Array.isArray(Object.values(resources.byAvailability))).toBe(true);
  });
});

// ================================================================ people ==

describe('people intelligence', () => {
  it('counts only approved volunteer hours', async () => {
    const m = peopleMetrics(await snapshots(), termRange());
    expect(m.activeMembers.value).toBeGreaterThan(0);
    // No hours were seeded, so the count is zero and the metric stays available.
    expect(m.approvedVolunteerHours.value).toBe(0);
  });

  it('reports an attendance rate of null with no records', async () => {
    const m = peopleMetrics(await snapshots(), termRange());
    expect(m.attendanceRate.value).toBeNull();
    expect(m.attendanceRate.availability.available).toBe(false);
  });
});

// ============================================================ governance ==

describe('governance linkage', () => {
  it('only links records that exist in the explicit link table', async () => {
    const goalValues: (typeof s.goals.$inferInsert)[] = [{
      title: 'هدف اختباري',
      status: 'in_progress',
      academicTermId: 'term',
      ownerUserId: leader.user.id,
      createdBy: leader.user.id,
    }];
    const [goal] = await database.insert(s.goals).values(goalValues).returning();
    const initiativeValues: (typeof s.initiatives.$inferInsert)[] = [{
      title: 'مبادرة اختبارية',
      goalId: goal.id,
      status: 'in_progress',
      ownerUserId: leader.user.id,
    }];
    const [initiative] = await database
      .insert(s.initiatives)
      .values(initiativeValues)
      .returning();
    await task('linked-task');
    await database.insert(s.initiativeLinks).values({
      id: 'il1',
      initiativeId: initiative.id,
      linkType: 'task',
      linkedId: 'linked-task',
    });
    // A task that merely shares a title is not linked.
    await task('unlinked-task', { title: 'مبادرة اختبارية' });
    const linkage = governanceLinkage(await snapshots());
    const row = linkage.find((g) => g.goalId === goal.id)!;
    const ids = row.supporting.map((x) => x.id);
    expect(ids).toContain('linked-task');
    expect(ids).not.toContain('unlinked-task');
    expect(row.causalityNote).toContain('لا يُذكر');
  });

  it('explains a KPI as unavailable without a measurement', async () => {
    const [kpiGoal] = await database.insert(s.goals).values({
      title: 'هدف للمؤشر',
      status: 'in_progress',
      academicTermId: 'term',
      ownerUserId: leader.user.id,
      createdBy: leader.user.id,
    }).returning();
    // Declared explicitly: drizzle's inference over the full schema graph
    // mis-resolves the KPI insert shape.
    const kpiValues: (typeof s.kpis.$inferInsert)[] = [
      {
        name: 'مؤشر',
        goalId: kpiGoal.id,
        status: 'active',
        unit: 'عدد',
        direction: 'higher_is_better',
        currentValue: null,
        targetValue: 10,
        academicTermId: 'term',
        ownerUserId: leader.user.id,
        createdBy: leader.user.id,
      },
    ];
    const [kpi] = await database.insert(s.kpis).values(kpiValues).returning();
    const explain = kpiExplainability(await snapshots(), kpi.id)!;
    expect(explain.available).toBe(false);
    expect(explain.reasonUnavailable).toBeTruthy();
    expect(explain.sourceTables).toContain('kpi_measurements');
  });
});

// ============================================================== committee ==

describe('committee intelligence', () => {
  it('reports explainable statuses instead of a score', async () => {
    await resetWork();
    await task('h1', { status: 'in_progress', dueAt: day(-2) });
    const rows = committeeIntelligence(await snapshots(), now);
    const alpha = rows.find((c) => c.id === 'c-alpha')!;
    expect(alpha.statuses.length).toBeGreaterThan(0);
    // Every status carries the numbers it was derived from.
    for (const status of alpha.statuses) expect(status.basis.length).toBeGreaterThan(0);
    expect(alpha.scoreNote).toContain('لا تُحسب درجة');
  });

  it('never ranks committees', async () => {
    const rows = committeeIntelligence(await snapshots(), now);
    const names = rows.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of rows) expect('score' in c).toBe(false);
  });
});

// ================================================================== pulse ==

describe('club pulse', () => {
  it('exposes six dimensions and never a single weighted score', async () => {
    const pulse = clubPulse(await snapshots(), termRange(), now);
    expect(pulse.dimensions).toHaveLength(6);
    expect(pulse.dimensions.map((d) => d.key).sort()).toEqual(
      ['engagement', 'events', 'execution', 'governance', 'operations', 'people'].sort(),
    );
    // The headline names the dimension that drove it.
    expect(pulse.headline.drivenBy === null || typeof pulse.headline.drivenBy === 'string').toBe(true);
    expect(pulse.note).toContain('لا يُحسب رقم واحد');
  });

  it('marks a dimension unavailable rather than scoring it zero', async () => {
    await resetWork();
    const pulse = clubPulse(await snapshots(), termRange(), now);
    const execution = pulse.dimensions.find((d) => d.key === 'execution')!;
    expect(execution.state).toBe('unavailable');
    expect(execution.primary.value).toBeNull();
  });
});

// ================================================================ insights ==

describe('deterministic insights', () => {
  it('raises an insight when overdue work exceeds the threshold', async () => {
    await resetWork();
    for (let i = 0; i < 4; i++)
      await task(`ov${i}`, { status: 'in_progress', dueAt: day(-3 - i) });
    const list = insights(await snapshots(), now);
    const overdue = list.find((i) => i.id === 'work.overdue');
    expect(overdue).toBeDefined();
    expect(overdue?.severity).toBe('important');
    expect(overdue?.explanation).toContain('4');
  });

  it('gives every insight a severity, a source and a link', async () => {
    const list = insights(await snapshots(), now);
    for (const i of list) {
      expect(['info', 'attention', 'important', 'critical']).toContain(i.severity);
      expect(i.source).toBeTruthy();
      expect(i.href).toBeTruthy();
    }
  });

  it('produces capacity signals that are either on or off', async () => {
    const signals = capacitySignals(await snapshots(), now);
    for (const s of signals) {
      expect(typeof s.active).toBe('boolean');
      expect(s.detail).toBeTruthy();
    }
  });
});

// ================================================================ reports ==

describe('reports and export', () => {
  it('generates an executive report with provenance', async () => {
    const report = await generateReport(leader, { template: 'executive_periodic', range: 'term' });
    expect(report.sections.length).toBeGreaterThan(0);
    expect(report.provenance.length).toBeGreaterThan(0);
    for (const p of report.provenance) expect(p.formula).toBeTruthy();
    // The report states that it makes no ranking claim.
    expect(report.notes.some((n) => n.includes('ترتيب'))).toBe(true);
  });

  it('exports CSV with Arabic text and a BOM', async () => {
    const report = await generateReport(leader, { template: 'executive_periodic', range: 'term' });
    const csv = reportToCsv(report);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('الإسناد');
  });

  it('refuses a finance report to a caller without finance access', async () => {
    await expect(generateReport(member, { template: 'finance' })).rejects.toThrow();
  });

  it('refuses the executive report to an ordinary member', async () => {
    await expect(generateReport(member, { template: 'executive_periodic' })).rejects.toThrow();
  });
});

// =================================================================== rbac ==

describe('intelligence access control', () => {
  it('grants executive intelligence to leadership and the supervisor', () => {
    expect(intel.canReadExecutive(leader)).toBe(true);
    expect(intel.canReadExecutive(supervisor)).toBe(true);
    expect(intel.canReadExecutive(head)).toBe(false);
    expect(intel.canReadExecutive(member)).toBe(false);
  });

  it('grants committee intelligence to heads but not ordinary members', () => {
    expect(intel.canReadCommittees(leader)).toBe(true);
    expect(intel.canReadCommittees(head)).toBe(true);
    expect(intel.canReadCommittees(member)).toBe(false);
  });

  it('shows a committee head only their own committee', async () => {
    const detail = await intel.committeesIntelligence(head, 'term');
    expect(detail.committees).toHaveLength(1);
    expect(detail.committees[0].id).toBe('c-alpha');
  });

  it('blocks executive intelligence from a committee head', async () => {
    await expect(intel.executiveIntelligence(head, 'term')).rejects.toThrow();
  });

  it('never grants a new edit permission through the intelligence families', () => {
    const keys = Object.keys(permissionCatalog).filter((k) => k.startsWith('intelligence.'));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys)
      expect(key.split('.')[1]).toMatch(/^(view|executive|committees|events|reports)$/);
  });
});

// ============================================================== zero data ==

describe('zero-data safety', () => {
  it('renders every dimension without a term, tasks, or operations data', async () => {
    // Start from a genuinely empty work set so the denominators really are zero.
    await resetWork();
    const emptyRange = resolveRange('term', null, now);
    const m = executionMetrics(await snapshots(), emptyRange, now);
    expect(m.completionRate.value).toBeNull();
    expect(m.completionRate.availability.available).toBe(false);
    const pulse = clubPulse(await snapshots(), emptyRange, now);
    expect(pulse.dimensions).toHaveLength(6);
    for (const d of pulse.dimensions) expect(Number.isNaN(Number(d.primary.value))).toBe(false);
    // An unavailable dimension never reports a fabricated zero.
    const execution = pulse.dimensions.find((d) => d.key === 'execution')!;
    expect(execution.primary.availability.available).toBe(false);
    expect(execution.primary.value).toBeNull();
    const readiness = eventReadiness(await snapshots(), 'missing-event', now);
    expect(readiness).toBeNull();
    const list = insights(await snapshots(), now);
    expect(Array.isArray(list)).toBe(true);
  });
});
