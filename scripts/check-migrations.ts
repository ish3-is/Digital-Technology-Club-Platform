import { sql } from "drizzle-orm";
import { db } from "../src/db";

/**
 * Local readiness check: reports whether the database this process is talking
 * to carries the current migration set. It never migrates anything, so a
 * developer or CI run cannot silently alter a database it was not asked to.
 */
// Drizzle keeps its ledger in the `drizzle` schema, not public.
const applied = await db.execute<{ n: number }>(
  sql`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`,
);
const tables = await db.execute<{ t: string }>(
  sql`SELECT table_name t FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'operation_%'
      ORDER BY table_name`,
);
const operations = tables.rows.length;
const appliedCount = (applied.rows?.[0] ?? applied as unknown as { n: number }).n;
console.log(`سجل الهجرات: ${appliedCount} · جداول العمليات: ${operations}`);
if (operations < 14) {
  console.error(
    "قاعدة البيانات الحالية لا تشمل هجرات المرحلة 6. شغّل: npm run db:migrate",
  );
  process.exit(1);
}
console.log("قاعدة البيانات مهيأة لمرحلة العمليات.");
process.exit(0);
