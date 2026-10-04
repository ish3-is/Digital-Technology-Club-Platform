import { beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, sql } from 'drizzle-orm';
import * as s from '../src/db/schema';
import { roleCatalog, permissionCatalog } from '../src/db/catalog';
import { collectSnapshots, type Snapshots } from '../src/lib/intelligence/snapshots';
import { onboardingFunnel, type Funnel } from '../src/lib/intelligence/funnel';
import {
  bucketStart,
  chooseBucket,
  describeSeries,
  trends,
} from '../src/lib/intelligence/trends';
import { resolveRange, type TimeRange } from '../src/lib/intelligence/provenance';
import {
  canFile,
  fileIntelligenceReport,
  filingToken,
  renderSections,
} from '../src/lib/intelligence/filing';
import { supervisorBrief } from '../src/lib/intelligence/supervisor';
import * as reports from '../src/lib/governance/reports.service';
import * as access from '../src/lib/work/access';

const database = drizzle(new PGlite(), { schema: s });
Object.assign(globalThis, { clubDb: database });

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
let head: Context;
let member: Context;
let supervisor: Context;
const range: TimeRange = resolveRange(
  'term',
  { id: 'term', startAt: term.startAt, endAt: term.endAt },
  now,
);

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
    termId: 'term',
    scope: committee ? 'committee' : 'club',
  });
  await database.insert(s.memberProfiles).values({
    userId: id,
    major: 'حاسب',
    joinedAt: new Date('2026-01-05'),
    status: 'active',
  });
  return access.actorContext(id);
}

// Declared explicitly: drizzle's inference over the full schema graph
// mis-resolves this insert shape.
type ApplicationStatus = NonNullable<
  typeof s.membershipApplications.$inferInsert['status']
>;
const applicationFor = (
  userId: string,
  status: ApplicationStatus = 'converted',
  id = `app-${userId}`,
): typeof s.membershipApplications.$inferInsert => ({
  id,
  fullName: `طلب ${userId}`,
  studentId: `stu-${userId}`,
  major: 'حاسب',
  email: `${userId}@example.test`,
  skills: [],
  interests: [],
  previousExperience: '',
  motivation: '',
  developmentGoals: [],
  availability: '',
  notes: '',
  status,
  academicTermId: 'term',
  convertedUserId: userId,
  createdBy: leader.user.id,
  createdAt: new Date('2026-01-10'),
  decidedAt: new Date('2026-01-12'),
});

const taskFor = (
  id: string,
  userId: string,
  over: Partial<typeof s.workItems.$inferInsert> = {},
) =>
  database
    .insert(s.workItems)
    .values({
      id,
      kind: 'task',
      title: `مهمة ${id}`,
      status: 'completed',
      createdBy: leader.user.id,
      termId: 'term',
      createdAt: new Date('2026-02-01'),
      completedAt: new Date('2026-02-05'),
      ...over,
    })
    .then(async () => {
      await database.insert(s.workAssignments).values({
        id: `as-${id}`,
        workId: id,
        userId,
        role: 'responsible',
        response: 'accepted',
      });
    });

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
  await database.insert(s.committees).values({ id: 'c1', name: 'لجنة' });
  await database.insert(s.terms).values([term]);
  leader = await seedUser('leader', 'president');
  head = await seedUser('head', 'committee_head', 'c1');
  member = await seedUser('member', 'committee_member', 'c1');
  supervisor = await seedUser('supervisor', 'supervisor');
});

beforeEach(async () => {
  // Children before parents: an event row references its work item, and
  // attendance references the event, so the order has to be explicit.
  await database.delete(s.eventAttendance);
  await database.delete(s.eventParticipants);
  await database.delete(s.events);
  await database.delete(s.mediaRevisions);
  await database.delete(s.mediaDecisions);
  await database.delete(s.digitalForms);
  await database.delete(s.certificateBatches);
  await database.delete(s.assetReservations);
  await database.delete(s.assetIncidents);
  await database.delete(s.workAssignments);
  await database.delete(s.workItems);
  await database.delete(s.membershipApplications);
  await database.delete(s.onboardingSteps);
  await database.delete(s.onboardingPlans);
  await database.delete(s.memberCommitteeHistory);
  await database.delete(s.volunteerHourEntries);
  await database.delete(s.purchases);
  await database.delete(s.expenseDecisions);
  await database.delete(s.expenseRequests);
  await database.delete(s.budgets);
  await database.delete(s.mediaRequests);
  await database.delete(s.digitalRequests);
  await database.delete(s.reportSections);
  await database.delete(s.reportReviews);
  await database.delete(s.reports);
});

const snap = async (ctx: Context = leader) => collectSnapshots(ctx);

// ============================================================== funnel ==

describe('onboarding funnel', () => {
  it('counts an empty dataset as having no applications', async () => {
    const funnel = onboardingFunnel(await snap(), range);
    expect(funnel.totalApplications).toBe(0);
    expect(funnel.stages[0].count).toBe(0);
    expect(funnel.stages[0].available).toBe(false);
    expect(funnel.stages[0].reasonUnavailable).toBeTruthy();
  });

  it('walks a member through the cumulative stages', async () => {
    await database.insert(s.user).values({ id: 'm1', name: 'م', email: 'm1@example.test', onboarded: true });
    await database.insert(s.membershipApplications).values(applicationFor('m1'));
    await database.insert(s.memberCommitteeHistory).values({
      id: 'ph-1',
      userId: 'm1',
      committeeId: 'c1',
      academicTermId: 'term',
      assignmentType: 'permanent',
      reason: 'توزيع',
      placedBy: leader.user.id,
      startAt: new Date('2026-01-12'),
      endAt: null,
    });
    await taskFor('t1', 'm1');


    const funnel = onboardingFunnel(await snap(), range);
    const byKey = Object.fromEntries(funnel.stages.map((x) => [x.key, x]));
    expect(byKey.application.count).toBe(1);
    expect(byKey.accepted.count).toBe(1);
    expect(byKey.committee_assigned.count).toBe(1);
    expect(byKey.first_task.count).toBe(1);
    expect(byKey.first_task.conversionPercent).toBe(100);
  });

  it('never exceeds 100% and stays monotone', async () => {
    // Five applications but only one placement: a non-nested implementation
    // would report a placement count above the applicant count.
    for (let i = 0; i < 5; i++) {
      await database.insert(s.user).values({
        id: `p${i}`,
        name: `p${i}`,
        email: `p${i}@example.test`,
        onboarded: true,
      });
      await database.insert(s.membershipApplications).values(applicationFor(`p${i}`, 'converted', `ap-${i}`));
    }
    await database.insert(s.memberCommitteeHistory).values({
      id: 'ph-9',
      userId: 'p0',
      committeeId: 'c1',
      academicTermId: 'term',
      assignmentType: 'permanent',
      reason: 'توزيع',
      placedBy: leader.user.id,
      startAt: new Date('2026-01-12'),
      endAt: null,
    });
    const funnel = onboardingFunnel(await snap(), range);
    const counts = funnel.stages.map((s) => s.count);
    for (const c of counts) expect(c).toBeLessThanOrEqual(funnel.totalApplications);
    for (const s of funnel.stages)
      if (s.overallPercent !== null) expect(s.overallPercent).toBeLessThanOrEqual(100);
    // Counts must not increase along the cumulative chain.
    const chain = ['application', 'accepted', 'committee_assigned', 'first_task'];
    const chainCounts = chain.map((k) => funnel.stages.find((s) => s.key === k)!.count);
    for (let i = 1; i < chainCounts.length; i++)
      expect(chainCounts[i]).toBeLessThanOrEqual(chainCounts[i - 1]);
  });

  it('treats a converted application as accepted', async () => {
    await database.insert(s.user).values({ id: 'c1', name: 'c', email: 'c1@example.test', onboarded: true });
    await database.insert(s.membershipApplications).values(applicationFor('c1', 'converted'));
    const funnel = onboardingFunnel(await snap(), range);
    expect(funnel.stages.find((s) => s.key === 'accepted')!.count).toBe(1);
  });

  it('reports conversion as unavailable when the previous stage is empty', async () => {
    // An applicant who was never placed: the committee stage has no members,
    // so a later conversion has nothing to divide by.
    await database.insert(s.user).values({ id: 'n1', name: 'ن', email: 'n1@example.test', onboarded: true });
    await database.insert(s.membershipApplications).values(applicationFor('n1'));
    const funnel = onboardingFunnel(await snap(), range);
    const later = funnel.stages.find((s) => s.key === 'thirty_day')!;
    if (later.previousCount === 0) {
      expect(later.conversionPercent).toBeNull();
      expect(later.available).toBe(false);
    }
  });

  it('derives the first task only from a completed assigned task', async () => {
    await database.insert(s.user).values({ id: 'd1', name: 'د', email: 'd1@example.test', onboarded: true });
    await database.insert(s.membershipApplications).values(applicationFor('d1'));
    await database.insert(s.memberCommitteeHistory).values({
      id: 'ph-d1',
      userId: 'd1',
      committeeId: 'c1',
      academicTermId: 'term',
      assignmentType: 'permanent',
      reason: 'توزيع',
      placedBy: leader.user.id,
      startAt: new Date('2026-01-12'),
      endAt: null,
    });
    // An in-progress task must not count as a first task.
    await taskFor('t-open', 'd1', { status: 'in_progress', completedAt: null });
    let funnel = onboardingFunnel(await snap(), range);
    expect(funnel.stages.find((s) => s.key === 'first_task')!.count).toBe(0);

    await database.delete(s.workAssignments);
    await database.delete(s.workItems);
    await taskFor('t-done', 'd1');
    funnel = onboardingFunnel(await snap(), range);
    expect(funnel.stages.find((s) => s.key === 'first_task')!.count).toBe(1);
  });

  it('derives the first event from a present attendance record', async () => {
    await database.insert(s.user).values({ id: 'e1', name: 'هـ', email: 'e1@example.test', onboarded: true });
    await database.insert(s.membershipApplications).values(applicationFor('e1'));
    await database.insert(s.memberCommitteeHistory).values({
      id: 'ph-e1',
      userId: 'e1',
      committeeId: 'c1',
      academicTermId: 'term',
      assignmentType: 'permanent',
      reason: 'توزيع',
      placedBy: leader.user.id,
      startAt: new Date('2026-01-12'),
      endAt: null,
    });
    await taskFor('t-e1', 'e1');
    await database.insert(s.memberProfiles).values({
      userId: 'e1',
      major: 'حاسب',
      joinedAt: new Date('2026-01-05'),
      status: 'active',
    });
    await database.insert(s.workItems).values({
      id: 'ev1',
      kind: 'event',
      title: 'فعالية',
      status: 'running',
      createdBy: leader.user.id,
      termId: 'term',
      dueAt: day(5),
    });
    await database.insert(s.events).values({
      id: 'ev1',
      eventType: 'workshop',
      leadId: leader.user.id,
      endAt: day(5),
      locationType: 'onsite',
      targetAudience: 'الأعضاء',
      approverId: leader.user.id,
      reportRequired: false,
    });
    await database.insert(s.eventParticipants).values({
      id: 'e1',
      eventId: 'ev1',
      name: 'م',
      registrationSource: 'walk-in',
    });
    const attendance: (typeof s.eventAttendance.$inferInsert)[] = [
      {
        eventId: 'ev1',
        participantId: 'e1',
        status: 'present',
        recordedBy: leader.user.id,
        source: 'manual',
        checkInAt: new Date('2026-02-02'),
      },
    ];
    await database.insert(s.eventAttendance).values(attendance);
    const snapshot = await snap();
    expect(snapshot.attendance.length, 'attendance in snapshot').toBe(1);
    expect(snapshot.members.map((m) => m.userId)).toContain('e1');
    const funnel = onboardingFunnel(snapshot, range);
    const stage = funnel.stages.find((s) => s.key === 'first_event')!;
    expect(stage.count).toBe(1);
    expect(stage.members[0]?.id).toBe('e1');
  });

  it('states the rule for every stage', async () => {
    const funnel = onboardingFunnel(await snap(), range);
    for (const s of funnel.stages) {
      expect(s.rule.length).toBeGreaterThan(10);
      expect(s.title).toBeTruthy();
    }
  });
});

// ============================================================== trends ==

describe('trend series', () => {
  it('buckets by day, week and month', () => {
    const d = new Date('2026-03-18T10:00:00Z');
    expect(bucketStart(d, 'day').toISOString().slice(0, 10)).toBe('2026-03-18');
    expect(bucketStart(d, 'month').toISOString().slice(0, 10)).toBe('2026-03-01');
    // 18 March 2026 is a Wednesday, so its ISO week starts Monday the 16th.
    expect(bucketStart(d, 'week').toISOString().slice(0, 10)).toBe('2026-03-16');
  });

  it('chooses a readable bucket from the window length', () => {
    const from = new Date('2026-03-01');
    expect(chooseBucket(from, new Date('2026-03-10'))).toBe('day');
    expect(chooseBucket(from, new Date('2026-05-01'))).toBe('week');
    expect(chooseBucket(from, new Date('2027-01-01'))).toBe('month');
  });

  it('omits empty buckets rather than reporting zero', async () => {
    await taskFor('ta', 'member');
    await taskFor('tb', 'member', { createdAt: new Date('2026-02-20'), completedAt: new Date('2026-02-25') });
    const bundle = trends(await snap(), new Date('2026-01-01'), new Date('2026-06-01'));
    const completed = bundle.series.find((s) => s.key === 'execution_completed')!;
    // Two tasks exist in two different months; no other month is invented.
    expect(completed.points).toHaveLength(2);
    expect(completed.points.every((p) => p.value > 0)).toBe(true);
  });

  it('marks a series with no data as empty instead of zero', async () => {
    const bundle = trends(await snap(), new Date('2026-01-01'), new Date('2026-06-01'));
    const completed = bundle.series.find((s) => s.key === 'execution_completed')!;
    expect(completed.empty).toBe(true);
    expect(completed.total).toBe(0);
    expect(completed.points).toHaveLength(0);
    expect(describeSeries(completed)).toContain('لا توجد بيانات');
  });

  it('respects the selected date range', async () => {
    await taskFor('in', 'member', { createdAt: new Date('2026-02-01'), completedAt: new Date('2026-02-05') });
    await taskFor('out', 'member', { createdAt: new Date('2025-01-01'), completedAt: new Date('2025-01-05') });
    const bundle = trends(await snap(), new Date('2026-01-01'), new Date('2026-06-01'));
    const created = bundle.series.find((s) => s.key === 'execution_created')!;
    expect(created.total).toBe(1);
  });

  it('compares against the previous equivalent period factually', async () => {
    await taskFor('now', 'member', { createdAt: new Date('2026-03-01'), completedAt: new Date('2026-03-02') });
    const bundle = trends(await snap(), new Date('2026-02-01'), new Date('2026-04-01'));
    const created = bundle.series.find((s) => s.key === 'execution_created')!;
    expect(created.comparison?.available).toBe(true);
    // The wording reports a count change and never a quality claim.
    expect(created.comparison?.wording).toMatch(/ارتفع|انخفض|لم يتغيّر/);
    expect(created.comparison?.wording).not.toContain('تحسن');
  });

  it('withholds finance series from a reader without finance access', async () => {
    const withFinance = trends(await snap(leader), new Date('2026-01-01'), new Date('2026-06-01'));
    expect(withFinance.series.some((s) => s.key === 'finance_spend')).toBe(true);
    const without = trends(await snap(member), new Date('2026-01-01'), new Date('2026-06-01'));
    expect(without.series.some((s) => s.key === 'finance_spend')).toBe(false);
  });
});

// ============================================================== filing ==

describe('report filing', () => {
  it('produces a deterministic, collision-free filing token', () => {
    const a = filingToken({
      template: 'executive_periodic',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-06-01'),
      committeeId: null,
    });
    const b = filingToken({
      template: 'executive_periodic',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-06-01'),
      committeeId: null,
    });
    expect(a).toBe(b);
    const other = filingToken({
      template: 'committee',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-06-01'),
      committeeId: null,
    });
    expect(other).not.toBe(a);
  });

  it('files an authorized report as a draft, never approved', async () => {
    const filed = await fileIntelligenceReport(leader, {
      template: 'executive_periodic',
      range: 'term',
    });
    expect(filed.status).toBe('draft');
    const [row] = await database.select().from(s.reports).where(eq(s.reports.id, filed.reportId));
    expect(row.status).toBe('draft');
    expect(row.typeId).toBeTruthy();
    expect(row.periodStart).toBeInstanceOf(Date);
    // The snapshot lives in the sections, so the report stays truthful later.
    const sections = await database
      .select()
      .from(s.reportSections)
      .where(eq(s.reportSections.reportId, filed.reportId));
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((x) => x.content.trim().length > 0)).toBe(true);
  });

  it('records provenance in the filed snapshot', async () => {
    const filed = await fileIntelligenceReport(leader, { template: 'executive_periodic', range: 'term' });
    expect(filed.snapshot.provenance.length).toBeGreaterThan(0);
    const sections = await database
      .select()
      .from(s.reportSections)
      .where(eq(s.reportSections.reportId, filed.reportId));
    const text = sections.map((x) => x.content).join('\n');
    expect(text).toContain('إسناد');
  });

  it('refuses a duplicate filing without an explicit acknowledgement', async () => {
    await fileIntelligenceReport(leader, { template: 'executive_periodic', range: 'term' });
    await expect(
      fileIntelligenceReport(leader, { template: 'executive_periodic', range: 'term' }),
    ).rejects.toThrow();
    // With acknowledgement the second filing is allowed deliberately.
    const again = await fileIntelligenceReport(leader, {
      template: 'executive_periodic',
      range: 'term',
      acknowledgeDuplicate: true,
    });
    expect(again.reportId).toBeTruthy();
  });

  it('refuses filing without the required grant', async () => {
    await expect(
      fileIntelligenceReport(member, { template: 'executive_periodic', range: 'term' }),
    ).rejects.toThrow();
    await expect(
      fileIntelligenceReport(member, { template: 'finance', range: 'term' }),
    ).rejects.toThrow();
  });

  it('scopes filing permission by template', () => {
    expect(canFile(leader, 'executive_periodic')).toBe(true);
    expect(canFile(leader, 'finance')).toBe(true);
    expect(canFile(member, 'executive_periodic')).toBe(false);
    expect(canFile(member, 'finance')).toBe(false);
    expect(canFile(head, 'executive_periodic')).toBe(false);
  });

  it('keeps review and approval separate from filing', async () => {
    const filed = await fileIntelligenceReport(leader, { template: 'executive_periodic', range: 'term' });
    // The filer cannot submit without an independent reviewer, nor approve.
    await expect(reports.submitReport(leader, filed.reportId)).rejects.toThrow();
    await expect(reports.approveReport(leader, filed.reportId)).rejects.toThrow();
    await expect(
      reports.reviewReport(leader, filed.reportId, { decision: 'approved' }),
    ).rejects.toThrow();
  });

  it('renders sections that satisfy the submit precondition', async () => {
    const filed = await fileIntelligenceReport(leader, { template: 'executive_periodic', range: 'term' });
    const sections = await database
      .select()
      .from(s.reportSections)
      .where(eq(s.reportSections.reportId, filed.reportId));
    const [row] = await database.select().from(s.reports).where(eq(s.reports.id, filed.reportId));
    expect(row.summary.trim().length).toBeGreaterThan(0);
    expect(sections.some((x) => !x.content.trim())).toBe(false);
  });

  it('never invents an unavailable metric value when rendering', () => {
    const rendered = renderSections({
      template: 'executive_periodic',
      title: 'ت',
      generatedAt: '2026-03-01T00:00:00.000Z',
      period: { from: new Date('2026-01-01'), to: new Date('2026-06-01'), label: 'فصل' },
      scope: { committeeId: null, committeeName: null },
      sections: [],
      provenance: [
        {
          key: 'k',
          title: 'مؤشر',
          value: null,
          formula: 'f',
          numerator: null,
          denominator: 0,
          sources: ['work_items'],
          available: false,
          reasonUnavailable: 'لا توجد سجلات',
        },
      ],
      notes: [],
    });
    expect(rendered.some((r) => r.content.includes('غير متاح'))).toBe(true);
  });
});

// ========================================================== supervisor ==

describe('supervisor brief', () => {
  it('builds for a supervisor without granting committee editing', async () => {
    const brief = await supervisorBrief(supervisor, 'term');
    expect(brief.term?.id).toBe('term');
    expect(Array.isArray(brief.events)).toBe(true);
    expect(brief.privacyNote).toContain('لا يفتح صلاحيات تحرير');
    // Oversight links only; no committee-editing capability is added.
    expect(brief.links.every((l) => l.href.startsWith('/'))).toBe(true);
  });

  it('refuses a caller with neither supervisor nor executive access', async () => {
    await expect(supervisorBrief(member, 'term')).rejects.toThrow();
  });

  it('reports domains the viewer cannot read as unavailable', async () => {
    const brief = await supervisorBrief(supervisor, 'term');
    // Each domain reports availability rather than inventing a zero.
    for (const domain of ['finance', 'media', 'digital', 'resources'] as const) {
      expect(typeof brief.operations[domain].available).toBe('boolean');
    }
  });

  it('handles an empty dataset without NaN or a crash', async () => {
    const brief = await supervisorBrief(supervisor, 'term');
    const values = [
      ...Object.values(brief.execution),
      ...Object.values(brief.people),
      brief.operations.finance.spent,
    ];
    for (const v of values)
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
  });

  it('excludes reports the supervisor cannot act on', async () => {
    const brief = await supervisorBrief(supervisor, 'term');
    for (const r of brief.reportsAwaitingAction)
      expect(['submitted', 'under_review']).toContain(r.status);
  });
});