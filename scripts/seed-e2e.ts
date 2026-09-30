import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!process.env.PGLITE_DIR?.startsWith(".data/e2e-"))
  throw new Error("Dedicated test database required");
process.env.CLUB_PROVISION = "1";
const { auth } = await import("../src/lib/auth");
const { db } = await import("../src/db");
const s = await import("../src/db/schema");
const email = "e2e@example.test",
  password = randomBytes(24).toString("base64url");
const result = await auth.api.signUpEmail({
  body: { email, password, name: "بيانات تجريبية" },
});
await db.insert(s.committees).values([
  {
    id: "test-media",
    name: "لجنة تجريبية",
    description: "بيانات تجريبية للتحقق فقط",
  },
  { id: "test-private", name: "لجنة أخرى للاختبار" },
]);
await db.insert(s.assignments).values({
  id: crypto.randomUUID(),
  userId: result.user.id,
  roleId: "committee_head",
  committeeId: "test-media",
  scope: "committee",
});
writeFileSync(
  ".data/e2e-credentials.json",
  JSON.stringify({ email, password }),
);
console.log("تم تجهيز بيانات تجريبية في قاعدة اختبار منفصلة.");
process.exit(0);
