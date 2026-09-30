import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
if (!process.env.PGLITE_DIR?.startsWith(".data/e2e-"))
  throw new Error("Dedicated test database required");
process.env.CLUB_PROVISION = "1";
const { auth } = await import("../src/lib/auth");
const { db } = await import("../src/db");
const s = await import("../src/db/schema");
await db.insert(s.committees).values([
  { id: "test-media", name: "لجنة تجريبية", description: "بيانات تجريبية فقط" },
  { id: "test-private", name: "اللجنة المستلمة التجريبية" },
]);
await db.insert(s.terms).values({
  id: "test-term",
  name: "الفصل التجريبي",
  year: "بيانات تجريبية",
  status: "active",
  startAt: new Date("2026-01-01"),
  endAt: new Date("2028-01-01"),
});
const people: Record<
  string,
  { id: string; email: string; password: string; name: string }
> = {};
for (const [key, name, role, committeeId] of [
  ["head", "رئيس لجنة تجريبي", "committee_head", "test-media"],
  ["member", "عضو تجريبي", "committee_member", "test-media"],
  ["recipient", "مستلم تجريبي", "committee_head", "test-private"],
  ["approver", "معتمد تجريبي", "system_admin", ""],
  ["supervisor", "مشرف تجريبي", "supervisor", ""],
]) {
  const password = randomBytes(24).toString("base64url"),
    email = `${key}@example.test`;
  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  });
  await db
    .update(s.user)
    .set({ onboarded: key !== "head" })
    .where(eq(s.user.id, result.user.id));
  await db.insert(s.assignments).values({
    id: crypto.randomUUID(),
    userId: result.user.id,
    roleId: role,
    committeeId: committeeId || null,
    termId: "test-term",
    scope: committeeId ? "committee" : "club",
  });
  people[key] = { id: result.user.id, email, password, name };
}
await db.insert(s.reportTypes).values({
  id: "weekly-committee-report",
  name: "تقرير لجنة أسبوعي",
  description: "تقارير الحوكمة المخصَّصة للجنة",
  isSystem: false,
  category: "custom",
});
writeFileSync(".data/e2e-credentials.json", JSON.stringify(people.head));
writeFileSync(".data/work-e2e-credentials.json", JSON.stringify(people));
console.log("أُعدت حسابات لجنتين في قاعدة اختبار منفصلة.");
process.exit(0);
