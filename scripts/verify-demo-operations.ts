/**
 * Reports the Phase 6 demo record counts and the derived budget totals.
 * Read-only: nothing is written.
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";

const tables: [string, string][] = [
  ["operation_budgets", "budgets"],
  ["operation_expense_requests", "expenses"],
  ["operation_purchases", "purchases"],
  ["operation_media_requests", "media requests"],
  ["operation_media_revisions", "media revisions"],
  ["operation_media_decisions", "media decisions"],
  ["operation_digital_requests", "digital requests"],
  ["operation_digital_forms", "forms"],
  ["operation_certificate_batches", "certificate batches"],
  ["operation_assets", "assets"],
  ["operation_asset_reservations", "reservations"],
  ["operation_asset_incidents", "incidents"],
];

for (const [table, label] of tables) {
  const total = await db.execute<{ n: number }>(sql`SELECT count(*)::int n FROM ${sql.identifier(table)}`);
  const demo = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int n FROM ${sql.identifier(table)} WHERE id LIKE 'demo-%'`,
  );
  console.log(
    `${label.padEnd(20)} total=${String(total.rows[0].n).padStart(3)} demo=${String(demo.rows[0].n).padStart(3)}`,
  );
}

console.log("\nExpense states:");
const states = await db.execute<{ status: string; n: number }>(
  sql`SELECT status, count(*)::int n FROM operation_expense_requests GROUP BY status ORDER BY status`,
);
for (const r of states.rows) console.log(`  ${r.status}: ${r.n}`);

console.log("\nMedia states:");
const media = await db.execute<{ status: string; n: number }>(
  sql`SELECT status, count(*)::int n FROM operation_media_requests GROUP BY status ORDER BY status`,
);
for (const r of media.rows) console.log(`  ${r.status}: ${r.n}`);

console.log("\nDigital states:");
const dig = await db.execute<{ status: string; n: number }>(
  sql`SELECT status, count(*)::int n FROM operation_digital_requests GROUP BY status ORDER BY status`,
);
for (const r of dig.rows) console.log(`  ${r.status}: ${r.n}`);

console.log("\nReservation states:");
const res = await db.execute<{ status: string; n: number }>(
  sql`SELECT status, count(*)::int n FROM operation_asset_reservations GROUP BY status ORDER BY status`,
);
for (const r of res.rows) console.log(`  ${r.status}: ${r.n}`);

console.log("\nAsset availability:");
const av = await db.execute<{ availability: string; n: number }>(
  sql`SELECT availability, count(*)::int n FROM operation_assets GROUP BY availability ORDER BY availability`,
);
for (const r of av.rows) console.log(`  ${r.availability}: ${r.n}`);

console.log("\nRequested vs actual purchase (proves derived spending):");
const flow = await db.execute<{ title: string; requested: number; paid: number | null; status: string }>(sql`
  SELECT e.title, e.amount requested, p.amount paid, e.status
  FROM operation_expense_requests e
  LEFT JOIN operation_purchases p ON p.expense_id = e.id
  ORDER BY e.title`);
for (const r of flow.rows)
  console.log(
    `  ${r.title}: requested=${r.requested} paid=${r.paid ?? "—"} status=${r.status}${r.paid && r.paid !== r.requested ? "  ← different" : ""}`,
  );

console.log("\nEvent integration — دعم العمليات لكل فعالية:");
const events = await db.execute<{ title: string; finance: number; media: number; digital: number }>(sql`
  SELECT w.title,
    (SELECT count(*)::int FROM operation_expense_requests e WHERE e.event_id = w.id) finance,
    (SELECT count(*)::int FROM operation_media_requests m WHERE m.event_id = w.id) media,
    (SELECT count(*)::int FROM operation_digital_requests d WHERE d.event_id = w.id) digital
  FROM work_items w
  WHERE w.id IN (
    SELECT event_id FROM operation_expense_requests WHERE event_id IS NOT NULL
    UNION SELECT event_id FROM operation_media_requests WHERE event_id IS NOT NULL
    UNION SELECT event_id FROM operation_digital_requests WHERE event_id IS NOT NULL
  )
  ORDER BY w.title`);
for (const r of events.rows)
  console.log(`  ${r.title}: مالية ${r.finance} · إعلام ${r.media} · رقمية ${r.digital}`);
process.exit(0);