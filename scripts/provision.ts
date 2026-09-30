import { z } from "zod";
import { eq } from "drizzle-orm";
process.env.CLUB_PROVISION = "1";
const { auth } = await import("../src/lib/auth");
const { db } = await import("../src/db");
const s = await import("../src/db/schema");
const [email, name, role = "committee_member", committeeId] =
  process.argv.slice(2);
const input = z
  .object({
    email: z.email(),
    name: z.string().min(2),
    password: z.string().min(12),
  })
  .parse({ email, name, password: process.env.CLUB_INITIAL_PASSWORD });
const [roleRow] = await db.select().from(s.roles).where(eq(s.roles.id, role));
if (!roleRow) throw new Error("الدور غير موجود");
const scoped = [
  "male_section_lead",
  "female_section_lead",
  "committee_head",
  "deputy_head",
  "committee_member",
].includes(role);
if (scoped && !committeeId) throw new Error("هذا الدور يتطلب معرف لجنة");
if (committeeId) {
  const [c] = await db
    .select()
    .from(s.committees)
    .where(eq(s.committees.id, committeeId));
  if (!c) throw new Error("اللجنة غير موجودة");
}
const result = await auth.api.signUpEmail({ body: input });
await db.transaction(async (tx) => {
  await tx.insert(s.assignments).values({
    id: crypto.randomUUID(),
    userId: result.user.id,
    roleId: role,
    scope: committeeId ? "committee" : "club",
    committeeId: committeeId || null,
  });
  await tx.insert(s.auditLogs).values({
    id: crypto.randomUUID(),
    action: "user.provisioned",
    entityType: "user",
    entityId: result.user.id,
    newValue: { role, committeeId: committeeId || null },
  });
});
console.log("تم إنشاء الحساب. أكمل التهيئة عند أول دخول.");
process.exit(0);
