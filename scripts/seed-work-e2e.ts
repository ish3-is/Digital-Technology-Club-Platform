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
  // The committee that raises cross-committee operations requests in Phase 6.
  { id: "test-org", name: "اللجنة التنظيمية التجريبية" },
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
  // Phase 7 executive intelligence needs a club leadership account.
  ["president", "رئيس النادي التجريبي", "president", ""],
  // Phase 6 service desks run at club scope, so they need club-scoped roles.
  ["mediaLead", "مسؤول الإعلام التجريبي", "media_lead", ""],
  ["digitalLead", "مسؤول رقمي تجريبي", "digital_lead", ""],
  ["financeLead", "مسؤول مالي تجريبي", "finance_lead", ""],
  ["resourcesLead", "مسؤول موارد تجريبي", "resources_lead", ""],
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
// Phase 5: give the new member account a real profile and placement so the
// People area has genuine data rather than an empty directory.
await db
  .insert(s.memberProfiles)
  .values([
    {
      userId: people.member.id,
      studentId: "20260001",
      major: "علوم حاسب",
      college: "كلية الحاسب",
      academicLevel: "السادس",
      phone: "0500000001",
      joinedAt: new Date("2026-02-01"),
      status: "active",
      statusReason: "عضوية معتمدة",
      skills: ["برمجة", "تنظيم"],
      interests: ["تقنية"],
      availability: "مسائي",
    },
    {
      userId: people.head.id,
      studentId: "20260002",
      major: "علوم حاسب",
      status: "active",
      joinedAt: new Date("2025-09-01"),
    },
    {
      userId: people.supervisor.id,
      studentId: "20260003",
      major: "نظم معلومات",
      status: "active",
      joinedAt: new Date("2025-09-01"),
    },
  ])
  .onConflictDoNothing();
await db.insert(s.memberCommitteeHistory).values([
  {
    id: crypto.randomUUID(),
    userId: people.member.id,
    committeeId: "test-media",
    academicTermId: "test-term",
    assignmentType: "permanent",
    reason: "توزيع تجريبي",
    placedBy: people.approver.id,
  },
  {
    id: crypto.randomUUID(),
    userId: people.head.id,
    committeeId: "test-media",
    academicTermId: "test-term",
    assignmentType: "permanent",
    reason: "توزيع تجريبي",
    placedBy: people.approver.id,
  },
]);
await db.insert(s.memberRoleHistory).values([
  {
    id: crypto.randomUUID(),
    userId: people.member.id,
    clubRole: "member",
    academicTermId: "test-term",
    reason: "عضوية تجريبية",
    assignedBy: people.approver.id,
  },
  {
    id: crypto.randomUUID(),
    userId: people.head.id,
    clubRole: "committee_head",
    committeeId: "test-media",
    academicTermId: "test-term",
    reason: "رئاسة اللجنة",
    assignedBy: people.approver.id,
  },
]);
console.log("أُعدت حسابات لجنتين في قاعدة اختبار منفصلة.");
process.exit(0);
