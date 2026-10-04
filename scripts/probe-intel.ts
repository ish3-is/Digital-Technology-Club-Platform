/**
 * Reads the intelligence layer for one demo account and prints what a caller
 * actually receives. Read-only: it never writes to the database.
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { actorContext } from "../src/lib/work/access";
import * as intel from "../src/lib/intelligence/queries";

const email = process.argv[2] ?? "demo-leader@club.local";
const found = await db.execute<{ id: string }>(
  sql`SELECT id FROM users WHERE email = ${email}`,
);
const userId = found.rows[0]?.id;
if (!userId) {
  console.log(`لم يُعثر على الحساب: ${email}`);
  process.exit(1);
}

const ctx = await actorContext(userId);
const rangeKey = process.argv[3] ?? "term";

console.log(`\n=== ${email} · النطاق: ${rangeKey} ===`);
console.log(
  "صلاحيات:",
  [
    ["view", intel.canRead(ctx)],
    ["executive", intel.canReadExecutive(ctx)],
    ["committees", intel.canReadCommittees(ctx)],
    ["reports", intel.canGenerateReports(ctx)],
  ]
    .map(([k, v]) => `${k}=${v ? "نعم" : "لا"}`)
    .join(" "),
);

try {
  const ex = await intel.executiveIntelligence(ctx, rangeKey);
  console.log("\nالفصل:", ex.summary.term?.name ?? "غير متاح");
  console.log(
    `اللجان ${ex.summary.committees} · الأعضاء ${ex.summary.members} · فعاليات قادمة ${ex.summary.upcomingEvents}`,
  );
  console.log(
    "\nنبض النادي:",
    ex.pulse.headline.label,
    "| البُعد المحرك:",
    ex.pulse.headline.drivenBy ?? "—",
  );
  for (const d of ex.pulse.dimensions)
    console.log(`  · ${d.title}: ${d.state} — ${d.explanation}`);
  console.log(
    "\nالمالية:",
    ex.finance.available
      ? `مخصص=${ex.finance.allocated.value} ملتزم=${ex.finance.committed.value} منصرف=${ex.finance.spent.value} متبقي=${ex.finance.remaining.value} استهلاك=${ex.finance.utilization.value ?? "غير متاح"}`
      : "غير متاحة لهذا الحساب",
  );
  console.log("\nالفعاليات:");
  for (const e of ex.events.slice(0, 5))
    console.log(
      `  · ${e.title}: جاهزية=${e.readinessPercent ?? "غير متاح"} (${e.completed}/${e.total}) دعم=${e.supportLinked ? "نعم" : "لا"}`,
    );
  console.log(`\nالرؤى التشغيلية: ${ex.insights.length}`);
  for (const i of ex.insights.slice(0, 6))
    console.log(`  [${i.severity}] ${i.title} — ${i.explanation}`);
  console.log(`\nإشارات السعة: ${ex.capacity.filter((c) => c.active).length} مفعّلة`);
} catch (e) {
  console.log("\nالتنفيذ:", (e as Error).message);
}

try {
  const ci = await intel.committeesIntelligence(ctx, rangeKey);
  console.log(`\nاللجان: ${ci.committees.length}`);
  for (const c of ci.committees.slice(0, 4))
    console.log(
      `  · ${c.name}: مفتوح=${c.openWork} متأخر=${c.overdue} صُرفت=${c.requestsSent} استُلمت=${c.requestsReceived}`,
    );
} catch (e) {
  console.log("\nاللجان:", (e as Error).message);
}

try {
  const rep = await intel.generateReport(ctx, {
    template: "executive_periodic",
    range: rangeKey,
  });
  console.log(
    `\nالتقرير التنفيذي: ${rep.sections.length} أقسام · ${rep.provenance.length} مؤشرًا بالإسناد`,
  );
} catch (e) {
  console.log("\nالتقرير:", (e as Error).message);
}

process.exit(0);