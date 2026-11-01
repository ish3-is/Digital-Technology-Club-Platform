import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as s from "../src/db/schema";
import { permissionCatalog, roleCatalog } from "../src/db/catalog";

const database = drizzle(new PGlite(), { schema: s });
Object.assign(globalThis, { clubDb: database });
const committees = await import("../src/lib/committees");
const presence = await import("../src/lib/presence");
const access = await import("../src/lib/work/access");
const work = await import("../src/lib/work/queries");

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "migrations" });
  await database.insert(s.permissions).values(
    Object.entries(permissionCatalog).map(([id, description]) => ({ id, description })),
  );
  await database.insert(s.roles).values(
    Object.entries(roleCatalog).map(([id, role]) => ({ id, name: role.name })),
  );
  await database.insert(s.rolePermissions).values(
    Object.entries(roleCatalog).flatMap(([roleId, role]) =>
      role.permissions.map((permissionId) => ({ roleId, permissionId })),
    ),
  );
  await database.insert(s.terms).values({
    id: "term",
    name: "الفصل التجريبي",
    year: "2026",
    status: "active",
    startAt: new Date("2026-01-01"),
    endAt: new Date("2027-01-01"),
  });
  await database.insert(s.user).values([
    { id: "admin", name: "مدير النظام", email: "admin@test.local", onboarded: true },
    { id: "ammar", name: "عمار محمد", email: "ammar@test.local", onboarded: true },
    { id: "member", name: "عضو اللجنة", email: "member@test.local", onboarded: true },
  ]);
  await database.insert(s.memberProfiles).values([
    { userId: "admin" },
    { userId: "ammar" },
    { userId: "member" },
  ]);
  await database.insert(s.assignments).values([
    { id: "admin-role", userId: "admin", roleId: "system_admin", scope: "club", termId: "term" },
    { id: "ammar-role", userId: "ammar", roleId: "male_section_lead", scope: "club", termId: "term" },
  ]);
});

describe("تشكيل اللجان والحضور المباشر", () => {
  it("ينشئ لجنة ويمنح أعضاءها الوصول ويقصر المراجعة على المعتمد", async () => {
    const admin = await access.actorContext("admin");
    const created = await committees.createCommitteeFormation(admin, {
      name: "لجنة المشروع الخاص",
      description: "فريق عمل محدد",
      memberIds: ["member"],
      headId: "member",
      approverIds: ["ammar"],
    });

    const [assignment] = await database
      .select()
      .from(s.assignments)
      .where(eq(s.assignments.committeeId, created.id));
    expect(assignment).toMatchObject({
      userId: "member",
      roleId: "committee_head",
      scope: "committee",
      active: true,
    });
    const [approver] = await database
      .select()
      .from(s.committeeApprovers)
      .where(eq(s.committeeApprovers.committeeId, created.id));
    expect(approver.userId).toBe("ammar");

    const member = await access.actorContext("member");
    const options = await work.workOptions(member);
    const context = options.contexts.find((item) => item.committeeId === created.id);
    expect(context?.create).toContain("task");
    expect(context?.approverIds).toEqual(["ammar"]);
  });

  it("يعرض فقط الأعضاء ذوي الحضور الحديث", async () => {
    const member = await access.actorContext("member");
    await presence.touchPresence(member);
    expect((await presence.onlineMembers()).map((row) => row.name)).toContain("عضو اللجنة");
  });
});
