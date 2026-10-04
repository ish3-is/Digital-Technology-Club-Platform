import { beforeAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import * as s from '../src/db/schema';
import { roleCatalog, permissionCatalog } from '../src/db/catalog';

const database = drizzle(new PGlite(), { schema: s });
Object.assign(globalThis, { clubDb: database });
process.env.BETTER_AUTH_SECRET =
  'operations-test-secret-with-at-least-thirty-two-characters';

const access = await import('../src/lib/work/access');
const ops = await import('../src/lib/operations');
const accounting = await import('../src/lib/operations/accounting');

type Context = Awaited<ReturnType<typeof access.actorContext>>;

const term = {
  id: 'term',
  name: 'فصل تجريبي',
  year: 'تجريبي',
  status: 'active',
  startAt: new Date('2026-01-01'),
  endAt: new Date('2028-01-01'),
} as const;

let mediaHead: Context, digitalHead: Context, orgHead: Context, leader: Context;
let supervisor: Context, member: Context, resourcesLead: Context;

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
  return access.actorContext(id);
}

// An event is a work item first, so the operations tests create the work row
// and then the event row that references it.
async function seedEvent(id: string, title: string, startsAt: string) {
  await database.insert(s.workItems).values({
    id,
    kind: 'event',
    title,
    status: 'planning',
    createdBy: 'leader',
    committeeId: 'org',
    termId: 'term',
  });
  await database.insert(s.events).values({
    id,
    eventType: 'workshop',
    leadId: 'org-head',
    endAt: new Date(startsAt),
    locationType: 'onsite',
    targetAudience: 'أعضاء النادي',
    approverId: 'leader',
  });
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
    { id: 'digital', name: 'اللجنة الرقمية' },
    { id: 'media', name: 'اللجنة الإعلامية' },
    { id: 'org', name: 'اللجنة التنظيمية' },
  ]);
  await database.insert(s.terms).values([term]);
    // Sequential on purpose: each actorContext must see its own assignment row.
    // Media and digital run as club-wide service desks, so their leads hold the
        // dedicated service role at club scope; the organization head stays a
        // committee-scoped requester.
        mediaHead = await seedUser('media-head', 'media_lead');
        digitalHead = await seedUser('digital-head', 'digital_lead');
        orgHead = await seedUser('org-head', 'committee_head', 'org');
    leader = await seedUser('leader', 'president');
    supervisor = await seedUser('supervisor', 'supervisor');
    member = await seedUser('member', 'committee_member', 'org');
  resourcesLead = await seedUser('resources-lead', 'resources_lead');
});

const budgetFor = async (title = 'ميزانية اختبار') =>
  ops.createBudget(leader, {
    title,
    allocatedAmount: 1000,
    startsOn: new Date('2026-02-01'),
    endsOn: new Date('2026-06-01'),
    committeeId: 'org',
  });

describe('budget accounting', () => {
  it('derives committed, spent, remaining and utilisation from expense rows', async () => {
    const budget = await budgetFor('ميزانية الاشتقاق');
    const expense = await ops.createExpense(orgHead, {
      title: 'مستلزمات فعالية',
      category: 'supplies',
      amount: 300,
      budgetId: budget.id,
      committeeId: 'org',
      submit: true,
    });
    await ops.transitionExpense(leader, expense.id, 'start_review');
    await ops.transitionExpense(leader, expense.id, 'approve', 'اعتماد');

    const totals = accounting.calculateBudget(budget, [{ status: 'approved', amount: 300 }]);
    expect(totals.allocated).toBe(1000);
    expect(totals.committed).toBe(300);
    expect(totals.spent).toBe(0);
    expect(totals.remaining).toBe(700);
    expect(totals.utilizationPercent).toBe(30);
    expect(totals.overspent).toBe(false);
  });

  it('takes spent from the recorded purchase, not the requested amount', () => {
    // The expense asked for 300; the purchase actually paid 250. Spending is
    // the amount that left the account.
    const totals = accounting.calculateBudget(
      { allocatedAmount: 1000, alertThresholdPercent: 80 },
      [{ id: 'e1', status: 'purchased', amount: 300 }],
      [{ expenseId: 'e1', amount: 250, reconciliationStatus: 'pending' }],
    );
    // An unreconciled purchase is still committed, not yet spent.
    expect(totals.spent).toBe(0);
    expect(totals.committed).toBe(300);

    const reconciled = accounting.calculateBudget(
      { allocatedAmount: 1000, alertThresholdPercent: 80 },
      [{ id: 'e1', status: 'reconciled', amount: 300 }],
      [{ expenseId: 'e1', amount: 250, reconciliationStatus: 'reconciled' }],
    );
    expect(reconciled.spent).toBe(250);
    // The committed amount clears once the purchase is reconciled.
    expect(reconciled.committed).toBe(0);
    expect(reconciled.remaining).toBe(750);
    expect(reconciled.utilizationPercent).toBe(25);
  });

  it('reports overspend and a negative remaining balance', () => {
    const totals = accounting.calculateBudget(
      { allocatedAmount: 500, alertThresholdPercent: 80 },
      [{ status: 'approved', amount: 600 }],
    );
    expect(totals.overspent).toBe(true);
    expect(totals.remaining).toBe(-100);
    expect(totals.nearLimit).toBe(false);
  });

  it('flags a budget that reached its configured threshold without exceeding it', () => {
    const totals = accounting.calculateBudget(
      { allocatedAmount: 1000, alertThresholdPercent: 80 },
      [{ status: 'approved', amount: 850 }],
    );
    expect(totals.nearLimit).toBe(true);
    expect(totals.overspent).toBe(false);
  });

  it('returns zeroed totals for a budget with no expenses', () => {
    const totals = accounting.calculateBudget(
      { allocatedAmount: 400, alertThresholdPercent: 80 },
      [],
    );
    expect(totals).toMatchObject({
      allocated: 400,
      committed: 0,
      spent: 0,
      remaining: 400,
      utilizationPercent: 0,
    });
  });
});

describe('finance expense state machine', () => {
  it('walks the full lifecycle and records every decision', async () => {
    const budget = await budgetFor('ميزانية دورة الطلب');
    const expense = await ops.createExpense(orgHead, {
      title: 'ضيافة ورشة',
      category: 'catering',
      amount: 500,
      budgetId: budget.id,
      committeeId: 'org',
      submit: true,
    });
    expect(expense.status).toBe('submitted');
    await ops.transitionExpense(leader, expense.id, 'start_review');
    await ops.transitionExpense(leader, expense.id, 'approve', 'معتمد');
    const purchase = await ops.recordPurchase(leader, {
      expenseId: expense.id,
      vendor: 'مورّد تجريبي',
      purchasedAt: new Date('2026-03-01'),
      amount: 480,
    });
    expect(purchase.expense.status).toBe('purchased');
    await ops.reconcilePurchase(leader, purchase.purchase.id, 'مطابقة سند');
    const final = await ops.getExpense(leader, expense.id);
    expect(final.status).toBe('reconciled');

    const decisions = await ops.expenseDecisions(leader, expense.id);
    // The decision history is append-only and survives every transition.
    expect(decisions.map((d) => d.action)).toEqual([
      'submit',
      'start_review',
      'approve',
      'record_purchase',
      'reconcile',
    ]);
  });

  it('refuses a transition the current status does not allow', async () => {
    const budget = await budgetFor('ميزانية انتقال غير مسموح');
    const expense = await ops.createExpense(orgHead, {
      title: 'طباعة',
      category: 'printing',
      amount: 100,
      budgetId: budget.id,
      committeeId: 'org',
      submit: true,
    });
    // purchase is only reachable from approved.
    await expect(ops.transitionExpense(leader, expense.id, 'record_purchase')).rejects.toThrow(
      /غير متاح في الحالة الحالية/,
    );
  });

  it('keeps the requester out of their own review and approval', async () => {
    const budget = await budgetFor('ميزانية فصل الصلاحيات');
    // orgHead holds finance.expense.create but not review/approve at club scope.
    const expense = await ops.createExpense(orgHead, {
      title: 'معدات',
      category: 'equipment',
      amount: 200,
      budgetId: budget.id,
      committeeId: 'org',
      submit: true,
    });
    await expect(
      ops.transitionExpense(orgHead, expense.id, 'approve', 'محاولة اعتماد ذاتية'),
    ).rejects.toThrow(/بنفسك/);
  });

  it('separates review from approval as distinct permissions', async () => {
    expect(ops.expenseActionPermission('start_review')).toBe('finance.expense.review');
    expect(ops.expenseActionPermission('approve')).toBe('finance.expense.approve');
    expect(ops.expenseActionPermission('record_purchase')).toBe('finance.purchase.record');
    expect(ops.expenseActionPermission('reconcile')).toBe('finance.reconcile');
  });

  it('resolves each action to a status only when the transition exists', () => {
    expect(ops.targetForExpenseAction('approve', 'finance_review')).toBe('approved');
    expect(ops.targetForExpenseAction('approve', 'draft')).toBeNull();
    expect(ops.targetForExpenseAction('reconcile', 'purchased')).toBe('reconciled');
    expect(ops.targetForExpenseAction('archive', 'reconciled')).toBe('archived');
  });

  it('rejects a purchase recorded before approval', async () => {
    const budget = await budgetFor('ميزانية شراء مبكر');
    const expense = await ops.createExpense(orgHead, {
      title: 'نقل',
      category: 'transport',
      amount: 150,
      budgetId: budget.id,
      committeeId: 'org',
      submit: true,
    });
    await expect(
      ops.recordPurchase(leader, {
        expenseId: expense.id,
        vendor: 'شركة نقل',
        purchasedAt: new Date('2026-03-02'),
        amount: 150,
      }),
    ).rejects.toThrow(/قبل اعتماد الطلب/);
  });

  it('rejects a non-positive amount on create', async () => {
    await expect(
      ops.createExpense(orgHead, { title: 'مبلغ صفري', category: 'other', amount: 0 }),
    ).rejects.toThrow(/موجب/);
  });

  it('rejects a threshold outside 1..100', async () => {
    await expect(
      ops.createBudget(leader, {
        title: 'ميزانية بنسبة خاطئة',
        allocatedAmount: 100,
        startsOn: new Date('2026-02-01'),
        alertThresholdPercent: 150,
      }),
    ).rejects.toThrow(/بين 1 و100/);
  });
});

describe('finance alerts are derived from records', () => {
  it('raises a near-limit alert only when a real expense pushes it over', async () => {
    const budget = await budgetFor('ميزانية التنبيه', );
    const b = await database.query.budgets.findFirst({ where: eq(s.budgets.id, budget.id) });
    expect(b).toBeDefined();
    // 900 of 1000 with an 80% threshold.
    const expense = await ops.createExpense(orgHead, {
      title: 'تجهيزات كبيرة',
      category: 'equipment',
      amount: 900,
      budgetId: budget.id,
      committeeId: 'org',
      submit: true,
    });
    await ops.transitionExpense(leader, expense.id, 'start_review');
    await ops.transitionExpense(leader, expense.id, 'approve');
    const list = await ops.alerts(leader);
    const near = list.find((a) => a.kind === 'budget_near_limit');
    expect(near).toBeDefined();
    expect(near?.budgetId).toBe(budget.id);
  });

  it('does not invent an alert for a budget with no expenses', async () => {
    const fresh = await budgetFor('ميزانية هادئة');
    const list = await ops.alerts(leader);
    expect(list.some((a) => a.kind === 'budget_near_limit' && a.budgetId === fresh.id)).toBe(
      false,
    );
    expect(list.some((a) => a.kind === 'budget_exceeded' && a.budgetId === fresh.id)).toBe(
      false,
    );
  });
});

describe('media production flow', () => {
  it('moves a request from new to published with a recorded history', async () => {
    const request = await ops.createMediaRequest(orgHead, {
      title: 'بوستر ورشة',
      mediaType: 'poster',
      eventId: null,
      committeeId: 'org',
      priority: 'high',
    });
    expect(request.status).toBe('new');
    await ops.assignMedia(mediaHead, request.id, orgHead.user.id, mediaHead.user.id);
    const assigned = await ops.getMediaRequest(mediaHead, request.id);
    expect(assigned.status).toBe('accepted');
    expect(assigned.assigneeId).toBe(orgHead.user.id);

    await ops.advanceMedia(mediaHead, request.id, 'in_production');
    await ops.submitRevision(orgHead, request.id, { note: 'النسخة الأولى' });
    await ops.reviewMedia(mediaHead, request.id, 'request_changes', 'لون الخلفية');
    const changed = await ops.getMediaRequest(mediaHead, request.id);
    expect(changed.status).toBe('changes_requested');

    await ops.advanceMedia(mediaHead, request.id, 'in_production');
    await ops.submitRevision(orgHead, request.id, { note: 'النسخة الثانية' });
    await ops.reviewMedia(mediaHead, request.id, 'approve', 'مقبول');
    await ops.scheduleMedia(mediaHead, request.id, new Date('2026-04-01'));
    await ops.publishMedia(mediaHead, request.id);
    const done = await ops.getMediaRequest(mediaHead, request.id);
    expect(done.status).toBe('published');

    const detail = await ops.mediaDetail(mediaHead, request.id);
    expect(detail.revisions.length).toBe(2);
    expect(detail.decisions.map((d) => d.action)).toContain('request_changes');
  });

  it('refuses to review or approve your own work', async () => {
    const request = await ops.createMediaRequest(orgHead, {
      title: 'صورة تغطية',
      mediaType: 'photography',
      committeeId: 'org',
    });
    // mediaHead assigns itself, then tries to approve its own output.
    await ops.assignMedia(mediaHead, request.id, mediaHead.user.id, orgHead.user.id);
    await ops.advanceMedia(mediaHead, request.id, 'in_production');
    await ops.submitRevision(mediaHead, request.id, {});
    await expect(ops.reviewMedia(mediaHead, request.id, 'approve', 'ذاتي')).rejects.toThrow(
      /بنفسك/,
    );
  });

  it('blocks publishing before approval', async () => {
    const request = await ops.createMediaRequest(orgHead, {
      title: 'منشور بلا اعتماد',
      mediaType: 'social_post',
      committeeId: 'org',
    });
    await expect(
      ops.scheduleMedia(mediaHead, request.id, new Date('2026-04-02')),
    ).rejects.toThrow(/اعتمادًا مسبقًا/);
  });

  it('refuses an assignee who is also the reviewer', async () => {
    const request = await ops.createMediaRequest(orgHead, {
      title: 'إسناد غير صالح',
      mediaType: 'announcement',
      committeeId: 'org',
    });
    await expect(
      ops.assignMedia(mediaHead, request.id, orgHead.user.id, orgHead.user.id),
    ).rejects.toThrow(/المراجع هو المكلَّف/);
  });

  it('only offers legal transitions from a status', () => {
    expect(ops.mediaTransitions.in_review).toContain('changes_requested');
    expect(ops.mediaTransitions.in_review).toContain('approved');
    expect(ops.mediaTransitions.published).toEqual(['completed']);
    expect(ops.mediaTransitions.cancelled).toEqual([]);
  });
});

describe('media scope separation', () => {
  it('does not let a media committee head manage digital records', async () => {
    const digital = await ops.createDigitalRequest(orgHead, {
      title: 'نموذج تسجيل رقمية',
      serviceType: 'registration_form',
      committeeId: 'org',
    });
    // mediaHead holds media.* but must not reach digital.request.manage.
    await expect(
      ops.advanceDigital(mediaHead, digital.id, 'in_progress'),
    ).rejects.toThrow();
  });

  it('does not let a digital committee head approve media work', async () => {
    const request = await ops.createMediaRequest(orgHead, {
      title: 'مراجعة عبر اللجنة',
      mediaType: 'poster',
      committeeId: 'org',
    });
    await ops.assignMedia(mediaHead, request.id, orgHead.user.id, mediaHead.user.id);
    await ops.advanceMedia(mediaHead, request.id, 'in_production');
    await ops.submitRevision(orgHead, request.id, {});
    await expect(
      ops.reviewMedia(digitalHead, request.id, 'approve', 'تجاوز'),
    ).rejects.toThrow();
  });

  it('does not let the supervisor edit committee internals', () => {
    const grants = new Set(supervisor.grants.map((g) => g.permission));
    expect(grants.has('media.view')).toBe(true);
    expect(grants.has('media.approve')).toBe(true);
    // Oversight without committee-internal edit rights.
    expect(grants.has('media.request.manage')).toBe(false);
    expect(grants.has('media.assign')).toBe(false);
    expect(grants.has('digital.forms.manage')).toBe(false);
    expect(grants.has('resource.manage')).toBe(false);
    expect(grants.has('finance.budget.create')).toBe(false);
  });
});

describe('digital services', () => {
  it('runs a request through to completion with a recorded result', async () => {
    const request = await ops.createDigitalRequest(orgHead, {
      title: 'إعداد نموذج التسجيل',
      serviceType: 'registration_form',
      committeeId: 'org',
    });
    await ops.advanceDigital(digitalHead, request.id, 'received');
    await ops.advanceDigital(digitalHead, request.id, 'in_progress');
    const form = await ops.createForm(digitalHead, {
      title: 'نموذج دورة UI/UX',
      provider: 'نماذج النادي',
      url: 'https://forms.example.test/uiux',
      formType: 'registration',
      status: 'active',
    });
    await ops.advanceDigital(digitalHead, request.id, 'in_review');
    const done = await ops.completeDigitalRequest(digitalHead, request.id, {
      resultFormId: form.id,
      resultUrl: 'https://forms.example.test/uiux',
    });
    expect(done.status).toBe('completed');
    expect(done.resultFormId).toBe(form.id);
  });

  it('refuses completion without a recorded output', async () => {
    const request = await ops.createDigitalRequest(orgHead, {
      title: 'طلب بلا مخرج',
      serviceType: 'survey',
      committeeId: 'org',
    });
    await ops.advanceDigital(digitalHead, request.id, 'received');
    await ops.advanceDigital(digitalHead, request.id, 'in_progress');
    await ops.advanceDigital(digitalHead, request.id, 'in_review');
    await expect(ops.completeDigitalRequest(digitalHead, request.id, {})).rejects.toThrow(
      /رابط أو مخرج مرتبط/,
    );
  });

  it('records certificate delivery counts only when supplied', async () => {
    const batch = await ops.createBatch(digitalHead, {
      title: 'شهادات دورة الأمن السيبراني',
      issuedOn: new Date('2026-03-15'),
      participantSource: 'قائمة المشاركين في الفعالية',
    });
    expect(batch.sentCount).toBe(0);
    const updated = await ops.recordDelivery(digitalHead, batch.id, {
      generated: 40,
      sent: 38,
      failures: 2,
      status: 'partial',
    });
    expect(updated.generatedCount).toBe(40);
    expect(updated.sentCount).toBe(38);
    expect(updated.failureCount).toBe(2);
    expect(updated.status).toBe('partial');
  });

  it('leaves a form response count unset when nobody measured it', async () => {
    const form = await ops.createForm(digitalHead, {
      title: 'استبانة بلا عد',
      provider: 'اختبار',
      formType: 'survey',
    });
    expect(form.responseCount).toBeNull();
    const counted = await ops.recordFormResponses(digitalHead, form.id, 12);
    expect(counted.responseCount).toBe(12);
  });

  it('rejects a form URL that is not http(s)', async () => {
    await expect(
      ops.createForm(digitalHead, { title: 'رابط خاطئ', url: 'javascript:alert(1)' }),
    ).rejects.toThrow();
  });

  it('only allows legal digital transitions', () => {
    expect(ops.digitalTransitions.received).toContain('in_progress');
    expect(ops.digitalTransitions.in_review).toContain('completed');
    expect(ops.digitalTransitions.completed).toEqual([]);
  });
});

describe('resources', () => {
  it('detects overlapping windows correctly', () => {
    const base = new Date('2026-05-01T10:00:00Z');
    expect(
      ops.overlaps(
        base,
        new Date('2026-05-01T12:00:00Z'),
        new Date('2026-05-01T11:00:00Z'),
        new Date('2026-05-01T13:00:00Z'),
      ),
    ).toBe(true);
    // Touching endpoints do not overlap.
    expect(
      ops.overlaps(
        base,
        new Date('2026-05-01T12:00:00Z'),
        new Date('2026-05-01T12:00:00Z'),
        new Date('2026-05-01T13:00:00Z'),
      ),
    ).toBe(false);
    expect(
      ops.overlaps(
        base,
        new Date('2026-05-01T12:00:00Z'),
        new Date('2026-05-01T13:00:00Z'),
        new Date('2026-05-01T14:00:00Z'),
      ),
    ).toBe(false);
  });

  it('reserves, approves, checks out and returns while preserving conditions', async () => {
    const asset = await ops.createAsset(leader, {
      name: 'كاميرا تجريبية',
      category: 'كاميرا',
      assetCode: 'CAM-TEST-1',
    });
    const reservation = await ops.reserveAsset(member, {
      assetId: asset.id,
      purpose: 'تغطية فعالية',
      startsAt: new Date('2026-05-01T09:00:00Z'),
      endsAt: new Date('2026-05-01T15:00:00Z'),
    });
    expect(reservation.status).toBe('requested');
    const approved = await ops.approveReservation(resourcesLead, reservation.id);
    expect(approved.status).toBe('approved');

    const out = await ops.checkoutReservation(resourcesLead, reservation.id, 'good');
    expect(out.status).toBe('checked_out');
    expect(out.conditionBefore).toBe('good');

    const back = await ops.returnReservation(resourcesLead, reservation.id, 'good');
    expect(back.status).toBe('returned');
    // The condition observed at checkout is preserved, not overwritten.
    expect(back.conditionBefore).toBe('good');
    expect(back.conditionAfter).toBe('good');
  });

  it('rejects a second overlapping approved reservation', async () => {
    const asset = await ops.createAsset(leader, {
      name: 'ميكروفون تجريبي',
      category: 'صوت',
      assetCode: 'MIC-TEST-1',
    });
    const first = await ops.reserveAsset(member, {
      assetId: asset.id,
      purpose: 'فعالية أولى',
      startsAt: new Date('2026-06-01T09:00:00Z'),
      endsAt: new Date('2026-06-01T13:00:00Z'),
    });
    await ops.approveReservation(resourcesLead, first.id);
    const clash = await ops.reserveAsset(member, {
      assetId: asset.id,
      purpose: 'فعالية متداخلة',
      startsAt: new Date('2026-06-01T12:00:00Z'),
      endsAt: new Date('2026-06-01T16:00:00Z'),
    });
    await expect(ops.approveReservation(resourcesLead, clash.id)).rejects.toThrow(/حجوزات معتمدة متداخلة/);
  });

  it('allows two reservations that do not overlap', async () => {
    const asset = await ops.createAsset(leader, {
      name: 'حامل ثلاثي',
      category: 'تصوير',
    });
    const first = await ops.reserveAsset(member, {
      assetId: asset.id,
      purpose: 'صباح',
      startsAt: new Date('2026-07-01T08:00:00Z'),
      endsAt: new Date('2026-07-01T12:00:00Z'),
    });
    await ops.approveReservation(resourcesLead, first.id);
    const second = await ops.reserveAsset(member, {
      assetId: asset.id,
      purpose: 'مساء',
      startsAt: new Date('2026-07-01T13:00:00Z'),
      endsAt: new Date('2026-07-01T17:00:00Z'),
    });
    const approved = await ops.approveReservation(resourcesLead, second.id);
    expect(approved.status).toBe('approved');
  });

  it('does not let a member approve their own reservation', async () => {
    const asset = await ops.createAsset(leader, { name: 'شاشة عرض', category: 'عرض' });
    const reservation = await ops.reserveAsset(member, {
      assetId: asset.id,
      purpose: 'حجز ذاتي',
      startsAt: new Date('2026-08-01T09:00:00Z'),
      endsAt: new Date('2026-08-01T12:00:00Z'),
    });
    await expect(ops.approveReservation(member, reservation.id)).rejects.toThrow(/بنفسك/);
  });

  it('rejects a window that ends before it starts', async () => {
    const asset = await ops.createAsset(leader, { name: 'حقيبة معدات', category: 'معدات' });
    await expect(
      ops.reserveAsset(member, {
        assetId: asset.id,
        purpose: 'فترة معكوسة',
        startsAt: new Date('2026-09-01T15:00:00Z'),
        endsAt: new Date('2026-09-01T09:00:00Z'),
      }),
    ).rejects.toThrow(/بعد وقت البداية/);
  });

  it('records an incident without inferring blame', async () => {
    const asset = await ops.createAsset(leader, { name: 'جهاز لاسلكي', category: 'معدات' });
    const incident = await ops.reportIncident(leader, {
      assetId: asset.id,
      kind: 'damaged',
      details: 'عدسة متضررة',
    });
    // Responsibility is never guessed from the report.
    expect(incident.responsibleUserId).toBeNull();
    expect(incident.status).toBe('open');
    const after = await ops.getAsset(leader, asset.id);
    expect(after.availability).toBe('unavailable');
    const resolved = await ops.resolveIncident(leader, incident.id, 'تم استبدال العدسة');
    expect(resolved.status).toBe('resolved');
    const restored = await ops.getAsset(leader, asset.id);
    expect(restored.availability).toBe('available');
  });
});

describe('privacy and scope', () => {
  it('refuses finance reads without any finance grant', async () => {
    await expect(ops.listExpenses(member)).rejects.toThrow(/صلاحية قراءة العمليات المالية/);
  });

  it('does not expose a budget from another committee', async () => {
    const budget = await ops.createBudget(leader, {
      title: 'ميزانية سرية',
      allocatedAmount: 500,
      startsOn: new Date('2026-02-01'),
      committeeId: 'digital',
    });
    // The finance desk reads the whole finance ledger; media and digital leads
    // hold no finance.view, so they cannot read financial records at all.
    const expenses = await ops.listExpenses(leader);
    expect(expenses.some((e) => e.budgetId === budget.id)).toBe(false);
    await expect(ops.listExpenses(mediaHead)).rejects.toThrow();
    await expect(ops.listExpenses(digitalHead)).rejects.toThrow();
  });

  it('keeps each domain overview empty rather than null when unpermitted', async () => {
    const finance = await ops.financeOverview(member);
    expect(finance.available).toBe(false);
    expect(finance.budgets).toEqual([]);
    // media.view and digital.view are club-wide desks, so a member does see
    // those queues — that is the design, not a leak.
    const media = await ops.mediaOverview(member);
    expect(media.available).toBe(true);
    const digital = await ops.digitalOverview(member);
    expect(digital.available).toBe(true);
    const resources = await ops.resourceOverview(member);
    expect(resources.available).toBe(true);
  });

  it('reports no linked support for an event with no operations records', async () => {
    await seedEvent('event-bare', 'فعالية بلا دعم', '2026-10-01T09:00:00Z');
    const support = await ops.eventSupport(leader, 'event-bare');
    expect(support.readiness.state).toBe('no_linked_support');
    expect(support.readiness.linkedTotal).toBe(0);
    expect(support.readiness.settledPercent).toBeNull();
  });

  it('counts linked open support from the three real lists', async () => {
    await seedEvent('event-linked', 'فعالية مرتبطة', '2026-10-02T09:00:00Z');
    await ops.createExpense(orgHead, {
      title: 'مصاريف فعالية مرتبطة',
      category: 'other',
      amount: 100,
      eventId: 'event-linked',
      committeeId: 'org',
      submit: true,
    });
    await ops.createMediaRequest(orgHead, {
      title: 'تغطية فعالية مرتبطة',
      mediaType: 'event_coverage',
      eventId: 'event-linked',
      committeeId: 'org',
    });
    await ops.createDigitalRequest(orgHead, {
      title: 'شهادات فعالية مرتبطة',
      serviceType: 'certificate_generation',
      eventId: 'event-linked',
      committeeId: 'org',
    });
    const support = await ops.eventSupport(leader, 'event-linked');
    expect(support.readiness.linkedTotal).toBe(3);
    expect(support.readiness.totalOpen).toBe(3);
    expect(support.readiness.state).toBe('in_progress');
    expect(support.readiness.settledPercent).toBe(0);
  });
});

describe('search, inbox and activity integration', () => {
  it('finds an expense through the existing search surface', async () => {
    const hits = await ops.operationsSearch(leader, 'مصاريف فعالية مرتبطة');
    expect(hits.some((h) => h.kind === 'expense')).toBe(true);
  });

  it('returns no finance hits for a caller without finance access', async () => {
    const hits = await ops.operationsSearch(member, 'مصاريف');
    expect(hits.some((h) => h.kind === 'expense')).toBe(false);
  });

  it('surfaces pending work in the one inbox', async () => {
    const items = await ops.operationsInbox(leader);
    expect(items.some((i) => i.kind === 'finance')).toBe(true);
    expect(items.some((i) => i.kind === 'media')).toBe(true);
    expect(items.some((i) => i.kind === 'digital')).toBe(true);
  });

  it('keeps the inbox empty for a member with nothing actionable', async () => {
    const items = await ops.operationsInbox(member);
    expect(items.every((i) => i.kind !== 'finance')).toBe(true);
  });
});

describe('catalog integrity', () => {
  it('registers every specialized permission with an Arabic label', () => {
    for (const key of Object.keys(operationsPermissionsExpected)) {
      expect(permissionCatalog[key]).toBeTruthy();
    }
  });

  it('never grants a committee head finance approval', () => {
    for (const role of ['committee_head', 'deputy_head', 'committee_member']) {
      expect(roleCatalog[role].permissions).not.toContain('finance.expense.approve');
      expect(roleCatalog[role].permissions).not.toContain('finance.reconcile');
      expect(roleCatalog[role].permissions).not.toContain('finance.budget.create');
    }
  });

  it('gives committee heads the media and digital desks but not cross-domain approval', () => {
    expect(roleCatalog.committee_head.permissions).toContain('media.request.manage');
    expect(roleCatalog.committee_head.permissions).toContain('digital.forms.manage');
    // Media and digital internals are separate families.
    expect(roleCatalog.committee_head.permissions).not.toContain('finance.expense.review');
  });

  it('lets any committee member raise a cross-committee request', () => {
    expect(roleCatalog.committee_member.permissions).toContain('media.request.create');
    expect(roleCatalog.committee_member.permissions).toContain('digital.request.create');
    expect(roleCatalog.committee_member.permissions).toContain('resource.reserve');
  });
});

const operationsPermissionsExpected = {
  'finance.view': 1,
  'finance.budget.create': 1,
  'finance.budget.update': 1,
  'finance.expense.create': 1,
  'finance.expense.review': 1,
  'finance.expense.approve': 1,
  'finance.purchase.record': 1,
  'finance.reconcile': 1,
  'media.view': 1,
  'media.request.create': 1,
  'media.request.manage': 1,
  'media.assign': 1,
  'media.review': 1,
  'media.approve': 1,
  'media.publish': 1,
  'media.archive': 1,
  'digital.view': 1,
  'digital.request.create': 1,
  'digital.request.manage': 1,
  'digital.forms.manage': 1,
  'digital.surveys.manage': 1,
  'digital.certificates.manage': 1,
  'digital.resources.manage': 1,
  'resource.view': 1,
  'resource.manage': 1,
  'resource.reserve': 1,
  'resource.approve': 1,
  'resource.checkout': 1,
} as const;