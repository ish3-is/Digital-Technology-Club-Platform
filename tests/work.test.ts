import { beforeAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, and } from "drizzle-orm";
import * as s from "../src/db/schema";
import { roleCatalog, permissionCatalog } from "../src/db/catalog";
const database = drizzle(new PGlite(), { schema: s });
(globalThis as unknown as { clubDb: typeof database }).clubDb = database;
process.env.BETTER_AUTH_SECRET =
  "work-test-secret-with-at-least-thirty-two-characters";
const access = await import("../src/lib/work/access");
const engine = await import("../src/lib/work/engine");
const query = await import("../src/lib/work/queries");
const storage = await import("../src/lib/work/storage");
const { deliverDueSoon } = await import("../src/lib/work/due");
const model = await import("../src/lib/work/model");
type Context = Awaited<ReturnType<typeof access.actorContext>>;
let a: Context, b: Context, m: Context, other: Context, admin: Context;
const base = {
  kind: "task",
  title: "مهمة اختبار",
  committeeId: "a",
  termId: "term",
  responsibleId: "member-a",
  reviewerId: "head-a",
};
async function task(title = "مهمة اختبار") {
  return engine.createWork(a, { ...base, title });
}
async function toReview(id: string, actor = m) {
  let d = await access.getWork(actor, id);
  if (d.status === "not_started")
    d = await engine.transition(actor, id, "in_progress", d.version);
  return engine.transition(actor, id, "review", d.version);
}
beforeAll(async () => {
  await migrate(database, { migrationsFolder: "migrations" });
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
  await database.insert(s.committees).values([
    { id: "a", name: "لجنة أ" },
    { id: "b", name: "لجنة ب" },
  ]);
  await database.insert(s.terms).values([
    {
      id: "term",
      name: "فصل تجريبي",
      year: "تجريبي",
      status: "active",
      startAt: new Date("2026-01-01"),
      endAt: new Date("2028-01-01"),
    },
    {
      id: "closed",
      name: "فصل مغلق",
      year: "تجريبي",
      status: "closed",
      startAt: new Date("2024-01-01"),
      endAt: new Date("2025-01-01"),
    },
  ]);
  for (const [id, role, committee] of [
    ["head-a", "committee_head", "a"],
    ["head-b", "committee_head", "b"],
    ["member-a", "committee_member", "a"],
    ["member-b", "committee_member", "b"],
    ["admin", "system_admin", ""],
  ]) {
    await database.insert(s.user).values({
      id,
      name: `بيانات تجريبية ${id}`,
      email: `${id}@example.test`,
      onboarded: true,
    });
    await database.insert(s.assignments).values({
      id: `role-${id}`,
      userId: id,
      roleId: role,
      committeeId: committee || null,
      scope: committee ? "committee" : "club",
      termId: "term",
    });
  }
  [a, b, m, other, admin] = await Promise.all(
    ["head-a", "head-b", "member-a", "member-b", "admin"].map((id) =>
      access.actorContext(id),
    ),
  );
});
describe("طبقة تشغيل العمل", () => {
  it("دورة مهمة: إنشاء وتعيين وتنفيذ وتعليق ومراجعة وإكمال موثق", async () => {
    const w = await task("دورة المهمة الكاملة");
    await engine.assign(a, w.id, "member-a", "responsible");
    let current = await access.getWork(m, w.id);
    current = await engine.transition(m, w.id, "in_progress", current.version);
    await engine.addComment(m, w.id, "أكملت التنفيذ وأحتاج مراجعة", ["head-a"]);
    current = await engine.transition(m, w.id, "review", current.version);
    expect(
      (await query.inbox(a)).some(
        (i) => i.id === w.id && i.action.includes("قرار"),
      ),
    ).toBe(true);
    await engine.review(a, w.id, "approved", "تم التحقق", current.version);
    const d = await query.detail(a, w.id);
    expect(d.status).toBe("completed");
    expect(d.task?.progress).toBe(100);
    expect(d.approvals[0].decision).toBe("approved");
    expect(d.timeline.some((e) => e.label.includes("غيّر الحالة"))).toBe(true);
  });
  it("يمنع القراءة والتعديل وتغيير ID خارج النطاق", async () => {
    const w = await task("سر لجنة أ");
    await expect(access.getWork(other, w.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      engine.transition(other, w.id, "in_progress", w.version),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      engine.updateDetails(other, w.id, {
        title: "اختراق",
        version: w.version,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("دورة طلب بين لجنتين مع مهمة مرتبطة واعتماد مستقل", async () => {
    const w = await engine.createWork(a, {
      kind: "request",
      title: "تصميم إعلان تجريبي",
      committeeId: "a",
      receivingCommitteeId: "b",
      termId: "term",
      reviewerId: "head-a",
    });
    expect((await query.inbox(b)).some((i) => i.id === w.id)).toBe(true);
    let c = await engine.transition(b, w.id, "received", w.version);
    c = await engine.transition(b, w.id, "in_progress", c.version);
    const linked = await engine.createWork(b, {
      kind: "task",
      title: "تنفيذ تصميم الإعلان",
      termId: "term",
      sourceId: w.id,
      responsibleId: "member-b",
      reviewerId: "head-b",
    });
    const t = await toReview(linked.id, other);
    await engine.review(b, linked.id, "approved", "", t.version);
    expect((await access.getWork(a, w.id)).status).toBe("in_progress");
    c = await engine.transition(b, w.id, "review", c.version);
    await engine.review(a, w.id, "approved", "اعتمدت الجهة الطالبة", c.version);
    expect((await query.detail(a, w.id)).status).toBe("completed");
  });
  it("لا يكشف الطلب لغير نطاقه ولا يسمح للمرسل باستلامه", async () => {
    const w = await engine.createWork(a, {
      kind: "request",
      title: "طلب مستقل",
      committeeId: "a",
      receivingCommitteeId: "b",
      termId: "term",
    });
    await expect(
      engine.transition(a, w.id, "received", w.version),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      access.getWork({ ...other, grants: [] }, w.id),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("يرفض الاعتماد الذاتي وانتقال حالة غير صالح وتحديثًا قديمًا", async () => {
    const w = await task();
    await expect(
      engine.transition(m, w.id, "completed", 1),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      engine.transition(m, w.id, "in_progress", 999),
    ).rejects.toMatchObject({ status: 409 });
    const r = await toReview(w.id);
    await expect(
      engine.review(m, w.id, "approved", "", r.version),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("يمنع الاعتماديات الذاتية والدائرية والمتسابقة", async () => {
    const first = await task("اعتمادية أولى"),
      second = await task("اعتمادية ثانية");
    await expect(
      engine.dependency(a, first.id, first.id),
    ).rejects.toMatchObject({ status: 422 });
    await engine.dependency(a, first.id, second.id);
    await expect(
      engine.dependency(a, second.id, first.id),
    ).rejects.toMatchObject({ status: 422 });
    const third = await task("اعتمادية ثالثة"),
      fourth = await task("اعتمادية رابعة");
    const results = await Promise.allSettled([
      engine.dependency(a, third.id, fourth.id),
      engine.dependency(a, fourth.id, third.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("يمنع إكمال مهمة متوقفة والتجاوز بلا صلاحية ثم يسمح بعد إكمال المانع", async () => {
    const blocker = await task("المانع"),
      blocked = await task("المتوقفة");
    await engine.dependency(a, blocked.id, blocker.id);
    const w = await toReview(blocked.id);
    await expect(
      engine.review(a, w.id, "approved", "", w.version),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      engine.review(a, w.id, "approved", "", w.version, "تجاوز استثنائي"),
    ).rejects.toMatchObject({ status: 403 });
    const t = await toReview(blocker.id);
    await engine.review(a, t.id, "approved", "", t.version);
    await engine.review(a, w.id, "approved", "", w.version);
    expect((await access.getWork(a, w.id)).status).toBe("completed");
  });
  it("التجاوز المصرح يسجل السبب والاعتماديات في التدقيق", async () => {
    const blocker = await task("مانع استثنائي");
    const w = await engine.createWork(a, { ...base, reviewerId: "admin" });
    await engine.dependency(a, w.id, blocker.id);
    const ready = await toReview(w.id);
    await engine.review(
      admin,
      w.id,
      "approved",
      "",
      ready.version,
      "استثناء معتمد لضرورة تشغيلية",
    );
    const logs = await database
      .select()
      .from(s.auditLogs)
      .where(
        and(
          eq(s.auditLogs.entityId, w.id),
          eq(s.auditLogs.action, "task.dependency_overridden"),
        ),
      );
    expect(logs).toHaveLength(1);
    expect(logs[0].newValue).toMatchObject({
      reason: "استثناء معتمد لضرورة تشغيلية",
    });
  });
  it("الإشارة لا تصل لمن لا يستطيع رؤية العنصر وتحتاج تأكيد اطلاع", async () => {
    const w = await task("إشارة محمية");
    await expect(
      engine.addComment(m, w.id, "إشارة غير مسموحة", ["member-b"]),
    ).rejects.toMatchObject({ status: 422 });
    await engine.addComment(m, w.id, "يرجى الاطلاع", ["head-a"]);
    const item = (await query.inbox(a)).find((i) => i.id === w.id);
    expect(item?.mentionId).toBeTruthy();
    await engine.acknowledge(a, item!.mentionId!);
    expect(
      (await query.inbox(a)).find((i) => i.id === w.id)?.mentionId,
    ).toBeUndefined();
  });
  it("المرفقات خاصة وتتحقق من النوع والحجم ولا تسرب مع تغيير المعرف", async () => {
    const w = await task("مرفق محمي");
    const file = await storage.upload(
      m,
      w.id,
      "دليل.txt",
      "text/plain",
      Buffer.from("دليل إنجاز تجريبي"),
    );
    expect((await storage.download(a, file.id)).content.toString()).toBe(
      "دليل إنجاز تجريبي",
    );
    await expect(storage.download(other, file.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      storage.upload(
        m,
        w.id,
        "fake.png",
        "image/png",
        Buffer.from("<script>alert(1)</script>"),
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(() =>
      storage.validateFile("x.txt", "text/plain", Buffer.alloc(5242881)),
    ).toThrow();
  });
  it("دورة اجتماع ودعوة وقرار ومهمة ناتجة وسجل قرار", async () => {
    const meeting = await engine.createWork(a, {
      kind: "meeting",
      title: "اجتماع فريق تجريبي",
      termId: "term",
      committeeId: "a",
      startAt: "2027-01-01T10:00:00+03:00",
      endAt: "2027-01-01T11:00:00+03:00",
      agenda: "إطلاق التسجيل",
      attendeeIds: ["member-a"],
    });
    expect(
      (await query.inbox(m)).some(
        (i) => i.id === meeting.id && i.action.includes("دعوة"),
      ),
    ).toBe(true);
    await engine.respondInvitation(m, meeting.id, "accepted");
    const decision = await engine.createWork(a, {
      kind: "decision",
      title: "إطلاق التسجيل الأحد",
      termId: "term",
      meetingId: meeting.id,
    });
    const linked = await engine.createWork(a, {
      ...base,
      title: "إعداد نموذج التسجيل",
      sourceId: decision.id,
    });
    const d = await query.detail(a, decision.id);
    expect(d.linkedTasks[0].id).toBe(linked.id);
    expect(d.parentMeeting?.id).toBe(meeting.id);
    expect(
      (await query.listWork(a, "decision")).some((w) => w.id === decision.id),
    ).toBe(true);
  });
  it("البحث والوارد والقوائم لا تكشف عناصر غير مصرح بها", async () => {
    const w = await task("عنوان سري لا يتسرب");
    expect((await query.search(other, "عنوان سري")).length).toBe(0);
    expect((await query.inbox(other)).some((i) => i.id === w.id)).toBe(false);
    expect((await query.listWork(other)).some((i) => i.id === w.id)).toBe(
      false,
    );
  });
  it("الحساب المعطل والتعيين المغلق والفصل المغلق ممنوعون", async () => {
    const w = await task("اختبار حالة الحساب");
    await database
      .update(s.user)
      .set({ active: false })
      .where(eq(s.user.id, m.user.id));
    await expect(access.getWork(m, w.id)).rejects.toMatchObject({
      status: 401,
    });
    await database
      .update(s.user)
      .set({ active: true })
      .where(eq(s.user.id, m.user.id));
    const closed = {
      ...m,
      grants: m.grants.map((g) => ({ ...g, termStatus: "closed" })),
    };
    await expect(access.getWork(closed, w.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      engine.createWork(admin, { ...base, termId: "closed" }),
    ).rejects.toMatchObject({ status: 409 });
    await database
      .update(s.terms)
      .set({ status: "closed" })
      .where(eq(s.terms.id, "term"));
    await expect(
      engine.transition(m, w.id, "in_progress", w.version),
    ).rejects.toMatchObject({ status: 409 });
    await database
      .update(s.terms)
      .set({ status: "active" })
      .where(eq(s.terms.id, "term"));
  });
  it("التأخر وتوقيت الرياض والترتيب محددة وقابلة للتفسير", () => {
    const now = new Date("2026-09-28T22:00:00Z");
    expect(model.riyadhDay(now)).toBe("2026-09-29");
    expect(
      model.overdue(
        { kind: "task", dueAt: "2026-09-28T20:00:00Z", status: "completed" },
        now,
      ),
    ).toBe(false);
    expect(
      model.urgency({ priority: "medium", dueAt: "2026-09-29T10:00:00Z" }, now)
        .bucket,
    ).toBe("اليوم");
    expect(model.urgency({ priority: "urgent", dueAt: null }, now).bucket).toBe(
      "عاجل",
    );
  });
  it("تنبيه اقتراب الموعد لا يتكرر عند إعادة تشغيل العامل", async () => {
    await engine.createWork(a, {
      ...base,
      title: "قرب الموعد",
      dueAt: new Date(Date.now() + 3600000).toISOString(),
    });
    expect((await deliverDueSoon()).delivered).toBeGreaterThan(0);
    expect((await deliverDueSoon()).delivered).toBe(0);
  });
  it("التنبيه المرتبط بالعمل يُحجب بعد سحب النطاق", async () => {
    const w = await task("تنبيه محمي");
    const { foundation, readNotification } =
      await import("../src/lib/services");
    const before = await foundation(m);
    const notice = before.notifications.find((n) => n.workId === w.id);
    expect(notice).toBeDefined();
    const revoked = { ...m, grants: [] };
    expect(
      (await foundation(revoked)).notifications.some((n) => n.workId === w.id),
    ).toBe(false);
    await expect(readNotification(revoked, notice!.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
