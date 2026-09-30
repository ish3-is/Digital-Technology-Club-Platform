import { beforeAll, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import * as s from "../src/db/schema";
import { roleCatalog, permissionCatalog } from "../src/db/catalog";
const client = new PGlite();
const database = drizzle(client, { schema: s });
process.env.BETTER_AUTH_SECRET =
  "test-only-secret-at-least-thirty-two-characters";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.CLUB_PROVISION = "1";
(globalThis as unknown as { clubDb: typeof database }).clubDb = database;
const { auth } = await import("../src/lib/auth");
const mail = await import("nodemailer");
const service = await import("../src/lib/services");
let headHeaders: Headers;
let headId: string;
let otherId: string;
beforeAll(async () => {
  await migrate(database, { migrationsFolder: "migrations" });
  for (const [id, description] of Object.entries(permissionCatalog))
    await database.insert(s.permissions).values({ id, description });
  for (const [id, r] of Object.entries(roleCatalog)) {
    await database.insert(s.roles).values({ id, name: r.name });
    for (const permissionId of r.permissions)
      await database
        .insert(s.rolePermissions)
        .values({ roleId: id, permissionId });
  }
  await database.insert(s.committees).values([
    { id: "a", name: "لجنة اختبار أ" },
    { id: "b", name: "لجنة اختبار ب" },
  ]);
  const u = await auth.api.signUpEmail({
    body: {
      email: "head@example.test",
      name: "بيانات تجريبية",
      password: "Test-only-password-5678",
    },
  });
  headId = u.user.id;
  const v = await auth.api.signUpEmail({
    body: {
      email: "other@example.test",
      name: "عضو اختبار",
      password: "Test-only-password-9012",
    },
  });
  otherId = v.user.id;
  await database.insert(s.assignments).values({
    id: "head-role",
    userId: headId,
    roleId: "committee_head",
    committeeId: "a",
    scope: "committee",
  });
  const result = await auth.api.signInEmail({
    body: { email: "head@example.test", password: "Test-only-password-5678" },
    asResponse: true,
  });
  headHeaders = new Headers({
    cookie: result.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
});
describe("المصادقة وقاعدة البيانات وخدمات الوصول", () => {
  it("يحفظ كلمة مرور مجزأة ويمنع غير المصادق", async () => {
    const [a] = await database
      .select()
      .from(s.account)
      .where(eq(s.account.userId, headId));
    expect(a.password).not.toContain("Test-only");
    await expect(service.identity(new Headers())).rejects.toMatchObject({
      status: 401,
    });
  });
  it("يفرض التهيئة الأولى ويسجل النشاط والتدقيق معًا", async () => {
    await expect(service.identity(headHeaders)).rejects.toMatchObject({
      status: 409,
    });
    const ctx = await service.identity(headHeaders, true);
    await service.updateProfile(ctx, "عضو تجريبي");
    const updated = await service.identity(headHeaders);
    expect(updated.user.onboarded).toBe(true);
    expect((await database.select().from(s.activities)).length).toBe(1);
    expect(
      (await database.select().from(s.auditLogs)).some(
        (a) => a.action === "profile.updated",
      ),
    ).toBe(true);
  });
  it("يقيد قائمة اللجان ويمنع IDOR للقراءة والتعديل", async () => {
    const ctx = await service.identity(headHeaders);
    expect((await service.visibleCommittees(ctx)).map((c) => c.id)).toEqual([
      "a",
    ]);
    await expect(service.committee(ctx, "b")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.updateCommittee(ctx, "b", "تغيير"),
    ).rejects.toMatchObject({ status: 404 });
    await service.updateCommittee(ctx, "a", "نبذة جديدة");
    expect((await service.committee(ctx, "a")).description).toBe("نبذة جديدة");
  });
  it("لا يقرأ تنبيه شخص آخر", async () => {
    await database
      .insert(s.notifications)
      .values({ id: "private", userId: otherId, title: "خاص", body: "خاص" });
    await expect(
      service.readNotification(await service.identity(headHeaders), "private"),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("يرفض API غير المصرح وأصلًا خارجيًا", async () => {
    const routes = await import("../src/app/api/[...path]/route");
    const noSession = await routes.GET(
      new Request("http://localhost:3000/api/foundation"),
    );
    expect(noSession.status).toBe(401);
    const foreign = await routes.POST(
      new Request("http://localhost:3000/api/profile", {
        method: "POST",
        headers: {
          ...Object.fromEntries(headHeaders),
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "تغيير" }),
      }),
    );
    expect(foreign.status).toBe(403);
    const admin = await routes.GET(
      new Request("http://localhost:3000/api/admin", { headers: headHeaders }),
    );
    expect(admin.status).toBe(403);
  });
  it("يرفض الحساب المعطل فورًا حتى مع جلسة سارية", async () => {
    await database
      .update(s.user)
      .set({ active: false })
      .where(eq(s.user.id, headId));
    await expect(service.identity(headHeaders)).rejects.toMatchObject({
      status: 401,
    });
    await database
      .update(s.user)
      .set({ active: true })
      .where(eq(s.user.id, headId));
  });
  it("يلغي الجلسة عند الخروج", async () => {
    await auth.api.signOut({ headers: headHeaders });
    await expect(service.identity(headHeaders)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("يستعيد كلمة المرور برمز أحادي الاستخدام ويلغي الجلسات", async () => {
    process.env.SMTP_URL = "smtps://test.invalid";
    process.env.MAIL_FROM = "club@example.test";
    let message = "";
    const spy = vi.spyOn(mail.default, "createTransport").mockReturnValue({
      sendMail: async (m: { text: string }) => {
        message = m.text;
      },
    } as unknown as ReturnType<typeof mail.default.createTransport>);
    const signed = await auth.api.signInEmail({
      body: { email: "head@example.test", password: "Test-only-password-5678" },
      asResponse: true,
    });
    const headers = new Headers({
      cookie: signed.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
    });
    await auth.api.requestPasswordReset({
      body: { email: "head@example.test", redirectTo: "/reset-password" },
    });
    const token = message.match(/reset-password\/([^?\s]+)/)?.[1];
    expect(token).toBeTruthy();
    await auth.api.resetPassword({
      body: { token: token!, newPassword: "Changed-test-password-9012" },
    });
    await expect(service.identity(headers)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      auth.api.resetPassword({
        body: { token: token!, newPassword: "Changed-again-password-4567" },
      }),
    ).rejects.toThrow();
    const r = await auth.api.signInEmail({
      body: {
        email: "head@example.test",
        password: "Changed-test-password-9012",
      },
    });
    expect(r.user.id).toBe(headId);
    spy.mockRestore();
    delete process.env.SMTP_URL;
  });
  it("يمنع التسجيل العام وتجاوز خدمة الملف الشخصي", async () => {
    const route = await import("../src/app/api/auth/[...all]/route");
    for (const path of ["sign-up/email", "update-user"])
      expect(
        (
          await route.POST(
            new Request(`http://localhost:3000/api/auth/${path}`, {
              method: "POST",
            }),
          )
        ).status,
      ).toBe(403);
  });
  it("يحافظ على سجل تدقيق غير قابل للتعديل والحذف", async () => {
    await client.exec(
      `CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append only'; END; $$; CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();`,
    );
    await expect(
      database.update(s.auditLogs).set({ action: "tampered" }),
    ).rejects.toThrow();
    await expect(database.delete(s.auditLogs)).rejects.toThrow();
  });
  it("يرجع كامل المعاملة عند فشل كتابة التدقيق", async () => {
    await client.exec(
      `CREATE OR REPLACE FUNCTION reject_test_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$; CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_test_insert();`,
    );
    const ctx = {
      user: {
        id: headId,
        name: "اختبار",
        email: "head@example.test",
        active: true,
        onboarded: true,
      },
      grants: [
        {
          permission: "committee.update",
          scope: "committee",
          committeeId: "a",
          startAt: new Date("2020-01-01"),
          endAt: null,
          active: true,
          termStatus: null,
          termId: null,
        },
      ],
      sessionId: "test",
    };
    await expect(
      service.updateCommittee(ctx, "a", "لا يحفظ"),
    ).rejects.toThrow();
    const [c] = await database
      .select()
      .from(s.committees)
      .where(eq(s.committees.id, "a"));
    expect(c.description).toBe("نبذة جديدة");
  });
});
