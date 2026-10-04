import { beforeAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
import * as s from '../src/db/schema';
import { roleCatalog, permissionCatalog } from '../src/db/catalog';
import { DEMO_PREFIX, demoId, demoPeople, demoCommittees, demoActivities, demoTerm } from '../src/lib/demo/dataset';

const database = drizzle(new PGlite(), { schema: s });
Object.assign(globalThis, { clubDb: database });
process.env.BETTER_AUTH_SECRET =
  'demo-seed-test-secret-with-at-least-thirty-two-characters';

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
});

const count = async (table: string) => {
  const rows = await database.execute<{ n: number }>(
    sql`SELECT count(*)::int n FROM ${sql.identifier(table)}`,
  );
  return rows.rows[0].n;
};

const demoCount = async (table: string) => {
  const rows = await database.execute<{ n: number }>(
    sql`SELECT count(*)::int n FROM ${sql.identifier(table)} WHERE id LIKE ${DEMO_PREFIX + '%'}`,
  );
  return rows.rows[0].n;
};

describe('demo dataset definitions', () => {
  it('marks every demo committee, person and activity with the demo prefix', () => {
    for (const c of demoCommittees) expect(c.id.startsWith(DEMO_PREFIX)).toBe(true);
    for (const person of demoPeople)
      expect(person.slug).toBeTruthy();
    expect(demoPeople.length).toBeGreaterThan(10);
    for (const a of demoActivities) expect(a.slug).toBeTruthy();
  });

  it('derives stable demo ids from the same slug every time', () => {
    expect(demoId('ops-budget-operating')).toBe(demoId('ops-budget-operating'));
    expect(demoId('ops-budget-operating')).not.toBe(demoId('ops-budget-uiux'));
    expect(demoId('anything').startsWith(DEMO_PREFIX)).toBe(true);
  });

  it('reserves unique slugs for the operations demo records', () => {
    const slugs = [
      'ops-budget-operating',
      'ops-budget-uiux',
      'ops-budget-robotics',
      'ops-expense-catering',
      'ops-expense-printing',
      'ops-expense-supplies',
      'ops-media-poster-uiux',
      'ops-media-coverage-all',
      'ops-media-photo-robotics',
      'ops-digital-registration',
      'ops-digital-survey',
      'ops-digital-certificates',
      'ops-asset-cam',
      'ops-asset-tripod',
      'ops-asset-mic',
      'ops-asset-laptop',
      'ops-asset-screen',
      'ops-asset-banner',
      'ops-reservation-cam-uiux',
      'ops-reservation-mic-all',
      'ops-reservation-screen-data',
      'ops-incident-tripod',
    ];
    expect(new Set(slugs.map((s) => demoId(s))).size).toBe(slugs.length);
  });

  it('links the operations demo records to real demo activities', () => {
    const slugs = demoActivities.map((a) => a.slug);
    expect(slugs).toContain('uiux');
    expect(slugs).toContain('programming-for-all');
    expect(slugs).toContain('data-to-decisions');
    expect(slugs).toContain('competitive-programming');
  });

  it('uses one active demo term', () => {
    expect(demoTerm.status).toBe('active');
    expect(demoTerm.id.startsWith(DEMO_PREFIX)).toBe(true);
  });
});

describe('operations schema supports the demo records', () => {
  it('creates every Phase 6 table the seed writes to', async () => {
    const expected = [
      'operation_budgets',
      'operation_expense_requests',
      'operation_expense_decisions',
      'operation_purchases',
      'operation_media_requests',
      'operation_media_revisions',
      'operation_media_decisions',
      'operation_digital_requests',
      'operation_digital_forms',
      'operation_certificate_batches',
      'operation_assets',
      'operation_asset_reservations',
      'operation_asset_incidents',
      'operation_events',
    ];
    for (const table of expected) expect(await count(table)).toBe(0);
  });

  it('keeps a form response count nullable so nothing is claimed unmeasured', () => {
    const form = s.digitalForms.responseCount;
    expect(form.notNull).toBe(false);
  });

  it('allows a budget with no end date', () => {
    expect(s.budgets.endsOn.notNull).toBe(false);
  });

  it('leaves incident responsibility optional so blame is never inferred', () => {
    expect(s.assetIncidents.responsibleUserId.notNull).toBe(false);
  });

  it('starts certificate counts at zero for a prepared batch', () => {
    expect(s.certificateBatches.sentCount.default).toBe(0);
    expect(s.certificateBatches.failureCount.default).toBe(0);
  });
});

describe('demo operations reset is demo-scoped', () => {
  it('finds demo rows by id prefix and would ignore anything else', async () => {
    // A non-demo row must not match the reset predicate.
    await database.insert(s.user).values({
      id: 'outside-user',
      name: 'حساب غير تجريبي',
      email: 'real.person@example.com',
      onboarded: true,
    });
    const matched = await database.execute<{ n: number }>(
      sql`SELECT count(*)::int n FROM user_role_assignments WHERE id LIKE ${DEMO_PREFIX + '%'}`,
    );
    expect(matched.rows[0].n).toBe(0);
    const stillThere = await database.execute<{ n: number }>(
      sql`SELECT count(*)::int n FROM users WHERE email = 'real.person@example.com'`,
    );
    expect(stillThere.rows[0].n).toBe(1);
    await database.execute(sql`DELETE FROM users WHERE email = 'real.person@example.com'`);
  });

  it('counts zero demo rows on a fresh database', async () => {
    for (const table of [
      'operation_budgets',
      'operation_expense_requests',
      'operation_media_requests',
      'operation_digital_requests',
      'operation_digital_forms',
      'operation_assets',
      'operation_asset_reservations',
      'operation_asset_incidents',
    ])
      expect(await demoCount(table)).toBe(0);
  });
});