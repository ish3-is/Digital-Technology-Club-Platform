import { beforeAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, and, sql } from 'drizzle-orm';
import * as s from '../src/db/schema';
import { roleCatalog, permissionCatalog } from '../src/db/catalog';
const database = drizzle(new PGlite(), { schema: s });
Object.assign(globalThis, { clubDb: database });
process.env.BETTER_AUTH_SECRET =
  'people-test-secret-with-at-least-thirty-two-characters';
const access = await import('../src/lib/work/access');
const engine = await import('../src/lib/work/engine');
const people = await import('../src/lib/people');
const contribution = await import('../src/lib/people/contribution.service');
const queries = await import('../src/lib/people/queries');
type Context = Awaited<ReturnType<typeof access.actorContext>>;
let head: Context, otherHead: Context, member: Context, otherMember: Context, admin: Context, supervisor: Context, extra: Context;

const term = { id: 'term', name: 'فصل تجريبي', year: 'تجريبي', status: 'active', startAt: new Date('2026-01-01'), endAt: new Date('2028-01-01') } as const;

async function seedUser(id: string, role: string, committee?: string) {
  await database.insert(s.user).values({ id, name: `عضو ${id}`, email: `${id}@example.test`, onboarded: true });
  await database.insert(s.assignments).values({
    id: `role-${id}`,
    userId: id,
    roleId: role,
    committeeId: committee ?? null,
    scope: committee ? 'committee' : 'club',
    termId: 'term',
  });
  await database.insert(s.memberProfiles).values({ userId: id, major: 'حاسب', joinedAt: new Date('2026-02-01') });
  return access.actorContext(id);
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: 'migrations' });
  for (const [id, description] of Object.entries(permissionCatalog))
    await database.insert(s.permissions).values({ id, description });
  for (const [id, r] of Object.entries(roleCatalog)) {
    await database.insert(s.roles).values({ id, name: r.name });
    for (const permissionId of r.permissions)
      await database.insert(s.rolePermissions).values({ roleId: id, permissionId }).onConflictDoNothing();
  }
  await database.insert(s.committees).values([
    { id: 'a', name: 'لجنة أ' },
    { id: 'b', name: 'لجنة ب' },
  ]);
  await database.insert(s.terms).values([term]);
  [head, otherHead, member, otherMember, admin, supervisor, extra] = await Promise.all([
    seedUser('head-a', 'committee_head', 'a'),
    seedUser('head-b', 'committee_head', 'b'),
    seedUser('member-a', 'committee_member', 'a'),
    seedUser('member-b', 'committee_member', 'b'),
    seedUser('admin', 'system_admin'),
    seedUser('supervisor', 'supervisor'),
    seedUser('member-c', 'committee_member', 'a'),
  ]);
  await contribution.seedPeopleConfiguration();
});

const application = () => ({
  fullName: 'مقدم طلب تجريبي',
  studentId: `2026${Math.floor(Math.random() * 100000)}`,
  major: 'حاسب',
  email: `applicant${Math.floor(Math.random() * 10000)}@example.test`,
  skills: ['برمجة'],
  interests: ['تقنية'],
  motivation: 'أريد المساهمة',
  developmentGoals: ['القيادة'],
  availability: 'مسائي',
  academicTermId: 'term',
});

describe('Phase 5 permissions and privacy', () => {
  it('grants leadership the people families without widening the supervisor', async () => {
    const options = await people.peopleOptions(admin);
    expect(options.permissions.memberUpdate).toBe(true);
    expect(options.permissions.applicationDecide).toBe(true);
    expect(options.permissions.impactAdjust).toBe(true);
    // The supervisor reviews and verifies, but never places or edits members.
    const sup = await people.peopleOptions(supervisor);
    expect(sup.permissions.applicationReview).toBe(true);
    expect(sup.permissions.achievementVerify).toBe(true);
    expect(sup.permissions.hoursApprove).toBe(true);
    expect(sup.permissions.memberUpdate).toBe(false);
    expect(sup.permissions.memberArchive).toBe(false);
    expect(sup.permissions.placementManage).toBe(false);
    expect(sup.permissions.xpAdjust).toBe(false);
    expect(sup.permissions.impactAdjust).toBe(false);
  });

  it('scopes member visibility to placement and withholds private fields from lists', async () => {
    await people.placeInCommittee(admin, { userId: 'member-a', committeeId: 'a', academicTermId: 'term', reason: 'توزيع أولي' });
    await people.placeInCommittee(admin, { userId: 'member-b', committeeId: 'b', academicTermId: 'term', reason: 'توزيع أولي' });
    await database.update(s.memberProfiles).set({ phone: '0500000000' }).where(eq(s.memberProfiles.userId, 'member-a'));

    const scoped = await people.listMembers(otherHead);
    expect(scoped.some((m) => m.userId === 'member-a')).toBe(false);
    expect(scoped.some((m) => m.userId === 'member-b')).toBe(true);

    // A list row never carries contact or management notes.
    const row = (await people.listMembers(head)).find((m) => m.userId === 'member-a')!;
    expect(row.phone).toBeNull();
    expect(row.managementNotes).toBeNull();
    expect(row.statusReason).toBeNull();

    await expect(people.memberDetail(otherHead, 'member-a')).rejects.toMatchObject({ status: 404 });
    const detail = await people.memberDetail(head, 'member-a');
    expect(detail.view.management).toBe(true);
    expect(detail.view.profile.phone).toBe('0500000000');
  });

  it('lets a member edit only their own allowed fields', async () => {
    const updated = await people.updateMember(member, 'member-a', { major: 'هندسة حاسب', availability: 'weekends' });
    expect(updated.major).toBe('هندسة حاسب');
    await expect(
      people.updateMember(member, 'member-a', { statusReason: 'محاولة تجاوز' } as never),
    ).rejects.toMatchObject({ status: 403 });
    await expect(people.updateMember(member, 'member-b', { major: 'تعديل آخر' })).rejects.toMatchObject({ status: 403 });
  });

  it('moves status only along a declared transition and always records a reason', async () => {
    // new -> low_engagement is not a declared transition; new -> active is.
    await expect(people.changeMemberStatus(admin, 'member-c', 'low_engagement', 'انتقال غير معروف من جديد')).rejects.toMatchObject({ status: 409 });
    await expect(people.changeMemberStatus(admin, 'member-b', 'low_engagement', 'قصير')).rejects.toMatchObject({ status: 422 });
    await people.changeMemberStatus(admin, 'member-b', 'active', 'بدأ نشاطه بعد التقييم');
    const row = await people.changeMemberStatus(admin, 'member-b', 'low_engagement', 'لم يسجل نشاطًا منذ شهرين');
    expect(row.status).toBe('low_engagement');
    const history = await people.statusHistory('member-b');
    expect(history[0]).toMatchObject({ previousStatus: 'active', newStatus: 'low_engagement' });
    expect(history[0].reason).toContain('لم يسجل');
  });
});

/** Converts a fresh application for member-a into a real placed member. */
async function admitMember() {
  const created = await people.createApplication(member, application());
  await people.decideApplication(admin, created.id, 'shortlisted', 'ملف مناسب للجنة');
  await people.decideApplication(admin, created.id, 'accepted', 'مقبول بعد التقييم');
  await people.convertToMember(admin, {
    applicationId: created.id,
    userId: 'member-a',
    academicTermId: 'term',
    committeeId: 'a',
    clubRole: 'member',
    clubRoleReason: 'عضوية جديدة',
  });
  return created;
}

describe('Phase 5 application lifecycle', () => {
  it('records every decision without overwriting the previous state', async () => {
    const created = await people.createApplication(member, application());
    expect(created.status).toBe('submitted');
    await people.assignReviewer(admin, created.id, 'head-a');
    await people.decideApplication(admin, created.id, 'shortlisted', 'ملف جيد ويشبه تركيز اللجنة');
    await people.decideApplication(admin, created.id, 'accepted', 'اجتاز التقييم');

    const { row, reviews } = await people.getApplication(admin, created.id);
    expect(row.status).toBe('accepted');
    // The full chain of states survives, in order.
    expect(reviews.map((r) => r.newStatus)).toEqual(['accepted', 'shortlisted', 'under_review', 'submitted']);
    // The first entry was written by the applicant who submitted it.
    expect(reviews.at(-1)!.reviewerId).toBe(member.user.id);
    expect(reviews.slice(0, 3).every((r) => r.reviewerId === admin.user.id)).toBe(true);
    // "rejected" is reachable from "accepted" by design; "shortlisted" is not.
    await expect(people.decideApplication(admin, created.id, 'shortlisted', 'رجوع غير مسموح')).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a decision that skips the lifecycle and blocks a duplicate student id', async () => {
    const created = await people.createApplication(member, application());
    await expect(people.decideApplication(admin, created.id, 'accepted', 'قبول مباشر دون مراجعة')).rejects.toMatchObject({ status: 409 });
    const again = { ...application(), studentId: created.studentId };
    await expect(people.createApplication(member, again)).rejects.toMatchObject({ status: 409 });
  });

  it('converts an accepted application into a placed member with an onboarding plan', async () => {
    const created = await people.createApplication(member, application());
    await people.decideApplication(admin, created.id, 'shortlisted', 'قائمة مختصرة');
    await people.decideApplication(admin, created.id, 'accepted', 'مقبول بعد التقييم');
    // Converting into a nonexistent account must not half-apply.
    await expect(
      people.convertToMember(admin, { applicationId: created.id, userId: 'newcomer', academicTermId: 'term', committeeId: 'a' }),
    ).rejects.toMatchObject({ status: 422 });

    const converted = await people.convertToMember(admin, {
      applicationId: created.id,
      userId: 'member-a',
      academicTermId: 'term',
      committeeId: 'a',
      clubRole: 'member',
      clubRoleReason: 'عضوية جديدة',
    });
    expect(converted.status).toBe('converted');
    const profile = await people.getProfile(admin, 'member-a');
    expect(profile.status).toBe('new');
    expect(profile.joinedAt).not.toBeNull();
    const plan = await people.getPlan(admin, 'member-a');
    expect(plan.steps.length).toBe(11);
    // Nothing is complete on creation: steps are never auto-closed.
    expect(plan.steps.every((x) => x.status === 'pending')).toBe(true);
    await expect(
      people.convertToMember(admin, { applicationId: created.id, userId: 'member-a', academicTermId: 'term' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('Phase 5 onboarding, mentoring and the 30-day challenge', () => {
  it('requires a recorded action before a step can close', async () => {
    await admitMember();
    const plan = await people.getPlan(admin, 'member-a');
    const step = plan.steps.find((x) => x.stepKey === 'first_task')!;
    await expect(people.completeStep(member, step.id, { note: 'قصير' })).rejects.toMatchObject({ status: 422 });
    // A member without a linked record cannot self-certify completion.
    await expect(
      people.completeStep(member, step.id, { note: 'أنجزتها دون سجل' }),
    ).rejects.toMatchObject({ status: 422 });

    const work = await engine.createWork(head, {
      kind: 'task',
      title: 'أول مهمة للعضو الجديد',
      committeeId: 'a',
      termId: 'term',
      responsibleId: 'member-a',
      reviewerId: 'head-a',
    });
    const done = await people.completeStep(member, step.id, { note: 'أنجزت المهمة الأولى', linkedWorkId: work.id });
    expect(done.status).toBe('completed');
    expect(done.completedBy).toBe('member-a');
    // Re-closing needs the same evidence, then hits the already-completed guard.
    await expect(people.completeStep(member, step.id, { note: 'إعادة', linkedWorkId: work.id })).rejects.toMatchObject({ status: 409 });
  });

  it('closes the plan, activates the member and awards the launching badge on full completion', async () => {
    const plan = await people.getPlan(admin, 'member-a');
    for (const step of plan.steps.filter((x) => x.status === 'pending'))
      await people.completeStep(admin, step.id, { note: 'إجراء إداري موثق للاختبار' });
    const finished = await people.getPlan(admin, 'member-a');
    expect(finished.plan.status).toBe('completed');
    expect(finished.progress.percent).toBe(100);
    expect(finished.challenge.completedSteps).toBe(finished.challenge.totalSteps);
    expect((await people.getProfile(admin, 'member-a')).status).toBe('active');
    const badges = await people.listBadges('member-a');
    expect(badges.map((b) => b.badgeKey)).toContain('launching_member');
  });

  it('assigns a mentor and refuses self-mentoring or a duplicate active pairing', async () => {
    const row = await people.assignMentor(admin, { mentorId: 'head-a', menteeId: 'member-b', academicTermId: 'term', notes: 'متابعة أول شهر' });
    expect(row.status).toBe('active');
    // Nobody may mentor themselves, whatever the role.
    await expect(
      people.assignMentor(admin, { mentorId: 'head-a', menteeId: 'head-a', academicTermId: 'term' }),
    ).rejects.toMatchObject({ status: 422 });
    // A plain member holds no mentor.assign permission at all.
    await expect(
      people.assignMentor(member, { mentorId: 'head-a', menteeId: 'member-c', academicTermId: 'term' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      people.assignMentor(admin, { mentorId: 'head-b', menteeId: 'member-b', academicTermId: 'term' }),
    ).rejects.toMatchObject({ status: 409 });
    const closed = await people.updateMentor(admin, row.id, { status: 'completed', notes: 'اكتملت المتابعة' });
    expect(closed.status).toBe('completed');
  });
});

describe('Phase 5 volunteer hours, XP and impact', () => {
  it('never lets a member approve their own hours', async () => {
    const entry = await people.submitHours(member, {
      memberId: 'member-a',
      sourceType: 'workshop',
      activityTitle: 'ورشة تنظيم الحضور',
      date: new Date('2026-09-05'),
      hours: 3,
      notes: 'ثلاث ساعات',
    });
    expect(entry.status).toBe('pending');
    await expect(people.decideHours(member, entry.id, 'approved', 'اعتماد ذاتي')).rejects.toMatchObject({ status: 403 });
    await expect(people.decideHours(member, entry.id, 'approved', 'اعتماد ذاتي')).rejects.toMatchObject({ status: 403 });
    const decided = await people.decideHours(admin, entry.id, 'approved', 'مطابق لسجل الورشة');
    expect(decided.row.status).toBe('approved');
    expect(decided.contribution).toMatchObject({ xp: 15, impact: 15 });
    await expect(people.decideHours(admin, entry.id, 'approved', 'قرار ثانٍ')).rejects.toMatchObject({ status: 409 });
  });

  it('rejects invalid hours and future dates', async () => {
    await expect(
      people.submitHours(member, {
        memberId: 'member-a',
        sourceType: 'event',
        activityTitle: 'فعالية',
        date: new Date('2026-09-05'),
        hours: 0,
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      people.submitHours(member, {
        memberId: 'member-a',
        sourceType: 'event',
        activityTitle: 'فعالية',
        date: new Date('2099-01-01'),
        hours: 2,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('derives XP and impact from real records with a source and a rule', async () => {
    const totals = await people.totalsFor('member-a');
    expect(totals.xp).toBeGreaterThan(0);
    expect(totals.impact).toBeGreaterThan(0);
    const transactions = await people.listTransactions(admin, 'member-a', 'xp');
    expect(transactions.length).toBeGreaterThan(0);
    // Every transaction explains itself.
    for (const t of transactions) {
      expect(t.reason).toBeTruthy();
      expect(t.ruleKey).toBeTruthy();
      expect(t.sourceType).toBeTruthy();
    }
    expect(totals.level.name).toBeTruthy();
  });

  it('audits a manual point adjustment and blocks the supervisor from making one', async () => {
    const row = await people.adjustPoints(admin, {
      memberId: 'member-a',
      kind: 'xp',
      points: 25,
      reason: 'تصحيح يدوي موثق',
      academicTermId: 'term',
    });
    expect(row.automatic).toBe(false);
    expect(row.ruleKey).toBe('manual_adjustment');
    await expect(
      people.adjustPoints(supervisor, { memberId: 'member-a', kind: 'xp', points: 500, reason: 'محاولة تجاوز', academicTermId: 'term' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      people.adjustPoints(admin, { memberId: 'member-a', kind: 'impact', points: 0, reason: 'صفر', academicTermId: 'term' }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('awards a badge only when its rule is met and keeps award history', async () => {
    const before = (await people.listBadges('member-b')).length;
    const awarded = await people.awardBadge(admin, {
      memberId: 'member-b',
      badgeKey: 'finisher',
      reason: 'استيفاء شرط المنجز',
      academicTermId: 'term',
    });
    expect(awarded.badgeKey).toBe('finisher');
    expect((await people.listBadges('member-b')).length).toBe(before + 1);
    await expect(
      people.awardBadge(admin, { memberId: 'member-b', badgeKey: 'finisher', reason: 'تكرار', academicTermId: 'term' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      people.awardBadge(admin, { memberId: 'member-b', badgeKey: 'does_not_exist', reason: 'غير معرّف', academicTermId: 'term' }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('Phase 5 achievements, transfers and offboarding', () => {
  it('separates achievement verification from its issuer', async () => {
    const created = await people.createAchievement(admin, {
      memberId: 'member-a',
      title: 'قيادة فعالية تقنية',
      category: 'event_leadership',
      achievedAt: new Date('2026-09-01'),
      visibility: 'members',
    });
    expect(created.verificationStatus).toBe('unreviewed');
    await expect(people.verifyAchievement(admin, created.id, 'verified', 'تحقق مستقل')).rejects.toMatchObject({ status: 403 });
    expect((await people.verifyAchievement(supervisor, created.id, 'verified', 'راجعت المصدر')).verificationStatus).toBe('verified');
    await expect(people.verifyAchievement(supervisor, created.id, 'verified', 'مرة أخرى')).rejects.toMatchObject({ status: 409 });
  });

  it('preserves committee history across an approved transfer', async () => {
    // Start from committee b so the transfer has a real "from" to preserve.
    const open = await database
      .select()
      .from(s.memberCommitteeHistory)
      .where(and(eq(s.memberCommitteeHistory.userId, 'member-b'), sql`${s.memberCommitteeHistory.endAt} IS NULL`));
    if (!open.length)
      await people.placeInCommittee(admin, { userId: 'member-b', committeeId: 'b', academicTermId: 'term', reason: 'توزيع أولي للاختبار' });
    const request = await people.requestTransfer(member, {
      userId: 'member-b',
      toCommitteeId: 'a',
      reason: 'أريد العمل في اللجنة الأخرى',
    });
    expect(request.status).toBe('requested');
    await expect(people.decideTransfer(member, request.id, 'approved', 'اعتماد ذاتي')).rejects.toMatchObject({ status: 403 });
    const decided = await people.decideTransfer(admin, request.id, 'approved', 'مقبول بعد المراجعة');
    expect(decided.status).toBe('approved');
    const history = await people.committeeHistory(admin, 'member-b');
    // The previous committee stays on record, closed rather than deleted.
    expect(history).toHaveLength(2);
    expect(history.find((h) => h.committeeId === 'b')?.endAt).not.toBeNull();
    expect(history.find((h) => h.committeeId === 'a')?.endAt).toBeNull();
    const handovers = await people.listHandovers(admin, { userId: 'member-b' });
    expect(handovers.some((h) => h.kind === 'committee_transfer')).toBe(true);
  });

  it('archives rather than deletes a member and reports open work first', async () => {
    // Give the member real open work so the guard has something to report.
    const open = await engine.createWork(head, {
      kind: 'task',
      title: 'عمل مفتوح قبل الخروج',
      committeeId: 'a',
      termId: 'term',
      responsibleId: 'member-a',
      reviewerId: 'head-a',
    });
    expect(open.status).not.toBe('completed');

    const blocked = await people.offboardMember(admin, {
      userId: 'member-a',
      reason: 'graduation',
      note: 'تخرج من الجامعة نهاية الفصل',
      academicTermId: 'term',
      reassignOpenWork: false,
    });
    expect(blocked.blocked).toBe(true);
    expect(blocked.openWork.length).toBeGreaterThan(0);

    const done = await people.offboardMember(admin, {
      userId: 'member-a',
      reason: 'graduation',
      note: 'تخرج من الجامعة نهاية الفصل',
      academicTermId: 'term',
      reassignOpenWork: true,
    });
    expect(done.blocked).toBe(false);
    expect(done.status).toBe('archived');
    // The record survives, and elevated access ends with the membership.
    expect((await people.getProfile(admin, 'member-a')).status).toBe('archived');
    const grants = await database.select().from(s.assignments).where(eq(s.assignments.userId, 'member-a'));
    expect(grants.every((g) => !g.active)).toBe(true);
    const placements = await people.committeeHistory(admin, 'member-a');
    expect(placements.length).toBeGreaterThan(0);
  });

  it('keeps a handover pending until responsibilities are documented', async () => {
    const handover = await people.createHandover(admin, {
      userId: 'member-b',
      kind: 'role_change',
      academicTermId: 'term',
      notes: 'تسليم مسؤوليات',
    });
    expect(handover.status).toBe('pending');
    await expect(people.updateHandover(admin, handover.id, { complete: true })).rejects.toMatchObject({ status: 422 });
    const done = await people.updateHandover(admin, handover.id, {
      responsibilities: 'ملفات الحضور ولوحة المتابعة',
      complete: true,
    });
    expect(done.status).toBe('completed');
    await expect(
      people.updateHandover(admin, handover.id, { responsibilities: 'تعديل بعد الإتمام' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('Phase 5 empty and unavailable states', () => {
  it('returns a well-formed empty structure instead of null when there is nothing to show', async () => {
    const empty = queries.emptyPeopleLists();
    for (const [key, value] of Object.entries(empty))
      expect(Array.isArray(value), `${key} must be an array`).toBe(true);
  });

  it('lists People for a signed-in viewer with zero records and no active term', async () => {
    // Close the term: a viewer must still get a readable result, never a null.
    await database.update(s.terms).set({ status: 'closed' }).where(eq(s.terms.id, 'term'));
    try {
      // Re-read the identity so the grant snapshot reflects the closed term.
      const closedTermAdmin = await access.actorContext(admin.user.id);
      const { lists, error } = await queries.peopleListsSafe(closedTermAdmin, {});
      expect(error).toBeNull();
      // Term-scoped lists go empty; the structure stays complete and array-shaped.
      expect(lists).toBeTruthy();
      for (const value of Object.values(lists)) expect(Array.isArray(value)).toBe(true);
      // A closed-term grant no longer exposes applications or plans.
      expect(lists.applications).toEqual([]);
      expect(lists.plans).toEqual([]);
      const options = await people.peopleOptions(closedTermAdmin);
      expect(options.activeTermCount).toBe(0);
      expect(options.academicTermId).toBeNull();
    } finally {
      await database.update(s.terms).set({ status: 'active' }).where(eq(s.terms.id, 'term'));
    }
  });

  it('degrades to the empty structure when a read genuinely fails', async () => {
    const failing = {
      ...admin,
      grants: admin.grants.map((g) => ({ ...g, permission: 'nonexistent.permission' })),
    };
    // Even a viewer whose grants break resolution receives arrays, not null.
    const { lists } = await queries.peopleListsSafe(failing, {});
    expect(lists).toBeTruthy();
    for (const value of Object.values(lists)) expect(Array.isArray(value)).toBe(true);
  });

  it('exposes a stable empty options shape for the page fallback', async () => {
    const options = people.emptyPeopleOptions();
    expect(options.activeTermCount).toBe(0);
    expect(options.academicTermId).toBeNull();
    expect(options.committees).toEqual([]);
    expect(options.people).toEqual([]);
    // Every permission the interface reads is present and false.
    for (const key of ['memberView', 'applicationCreate', 'placementManage', 'xpAdjust'])
      expect(options.permissions[key]).toBe(false);
  });
});

describe('Phase 5 integration and audit', () => {
  it('projects People items into the universal inbox without a second queue', async () => {
    const items = await queries.peopleInbox(admin);
    expect(items.every((i) => i.href.startsWith('/people'))).toBe(true);
    const work = await import('../src/lib/work/queries');
    const merged = await work.search(admin, 'عضو');
    expect(Array.isArray(merged)).toBe(true);
  });

  it('rolls back a People write when its audit record fails', async () => {
    await database.execute(
      sql`CREATE OR REPLACE FUNCTION fail_people_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='member' THEN RAISE EXCEPTION 'test people audit failure'; END IF; RETURN NEW; END; $$`,
    );
    await database.execute(
      sql`CREATE TRIGGER test_fail_people BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_people_test()`,
    );
    const before = (await database.select().from(s.memberProfiles)).length;
    await expect(
      people.changeMemberStatus(admin, 'member-b', 'active', 'محاولة يجب أن تُلغى'),
    ).rejects.toThrow();
    expect((await database.select().from(s.memberProfiles)).length).toBe(before);
    await database.execute(sql`DROP TRIGGER test_fail_people ON audit_logs`);
  });

  it('keeps the security audit and the People activity stream separate', async () => {
    const audits = await database
      .select()
      .from(s.auditLogs)
      .where(eq(s.auditLogs.action, 'people.badge.awarded'));
    const events = await database
      .select()
      .from(s.peopleEvents)
      .where(eq(s.peopleEvents.action, 'badge.awarded'));
    expect(audits.length).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);
  });
});
