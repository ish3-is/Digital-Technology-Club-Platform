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

const eventEngine = await import("../src/lib/events/engine");
const eventQuery = await import("../src/lib/events/queries");
const eventAccess = await import("../src/lib/events/access");
const eventStorage = await import("../src/lib/events/storage");
const eventModel = await import("../src/lib/events/model");
beforeAll(async () => {
  await (
    await import("../src/lib/events/configuration")
  ).seedEventConfiguration();
});
const eventBase = {
  title: "ورشة تشغيل تجريبية",
  termId: "term",
  committeeId: "a",
  leadId: "member-a",
  approverId: "admin",
  startAt: "2026-10-01T09:00:00Z",
  endAt: "2026-10-01T12:00:00Z",
  locationType: "onsite",
  locationText: "قاعة تجريبية",
  targetAudience: "طلاب النادي",
  capacity: 10,
};
async function ev(playbook = false) {
  return eventEngine.createEvent(a, {
    ...eventBase,
    ...(playbook ? { playbookId: "workshop" } : {}),
  });
}
async function move(id: string, to: string, ctx = a, reason?: string) {
  return eventEngine.transitionEvent(ctx, id, {
    to,
    version: (await eventAccess.getEvent(ctx, id)).version,
    reason,
  });
}
async function reviewEvent(id: string, decision = "approved") {
  return eventEngine.reviewEvent(admin, id, {
    decision,
    comment: "تمت المراجعة",
    version: (await eventAccess.getEvent(admin, id)).version,
  });
}
describe("محرك عمليات الفعاليات", () => {
  it("دورة ورشة كاملة: قالب وفريق وعمل وطلب وجاهزية واعتماد وحضور وتقرير وأرشفة", async () => {
    const w = await ev(true);
    let d = await eventQuery.eventDetail(a, w.id);
    expect(d.requirements).toHaveLength(8);
    expect(d.work).toHaveLength(3);
    expect(d.readiness.percentage).toBe(0);
    await eventEngine.saveTeam(a, w.id, {
      userId: "member-b",
      roleId: "volunteer",
      committeeId: "b",
      startAt: "2026-01-01T00:00:00Z",
    });
    expect((await eventAccess.getEvent(other, w.id)).id).toBe(w.id);
    const request = await engine.createWork(a, {
      kind: "request",
      title: "تصميم بوستر الورشة",
      committeeId: "a",
      termId: "term",
      eventId: w.id,
      track: "media",
      receivingCommitteeId: "b",
      reviewerId: "head-a",
    });
    expect((await query.inbox(b)).some((i) => i.id === request.id)).toBe(true);
    let r = await engine.transition(b, request.id, "received", request.version);
    r = await engine.transition(b, r.id, "in_progress", r.version);
    r = await engine.transition(b, r.id, "review", r.version);
    await engine.review(a, r.id, "approved", "مقبول", r.version);
    for (const task of d.work) {
      await toReview(task.id);
      const taskNow = await access.getWork(admin, task.id);
      await engine.review(admin, task.id, "approved", "مقبول", taskNow.version);
    }
    for (const req of d.requirements)
      await eventEngine.completeRequirement(m, w.id, {
        id: req.id,
        completed: true,
        evidence: "تم التحقق",
      });
    await move(w.id, "planning");
    await move(w.id, "pending_approval");
    expect(
      (await query.inbox(admin)).some(
        (i) => i.id === w.id && i.action.includes("اعتماد"),
      ),
    ).toBe(true);
    await reviewEvent(w.id);
    await move(w.id, "registration_open");
    await eventEngine.registerParticipants(a, w.id, {
      participants: [
        { name: "مشارك تجريبي", email: "participant@example.test" },
      ],
    });
    d = await eventQuery.eventDetail(a, w.id);
    await eventEngine.recordAttendance(a, w.id, {
      participantId: d.participants![0].id,
      status: "present",
    });
    for (const to of ["preparing", "ready", "running", "evaluation"])
      await move(w.id, to);
    const report = Object.fromEntries(
      [
        "summary",
        "objectives",
        "execution",
        "results",
        "challenges",
        "recommendations",
        "evaluation",
        "lessons",
      ].map((k) => [k, "محتوى التقرير التجريبي"]),
    );
    await eventEngine.saveReport(a, w.id, report);
    await move(w.id, "final_report");
    await expect(move(w.id, "archived")).rejects.toMatchObject({ status: 409 });
    await eventEngine.submitReport(a, w.id);
    await expect(
      eventEngine.updateEvent(a, w.id, {
        version: (await eventAccess.getEvent(a, w.id)).version,
        actualSpend: 9000,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      eventStorage.uploadEventFile(
        a,
        w.id,
        "late.txt",
        "text/plain",
        Buffer.from("late"),
        "التقرير",
        "team",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await query.inbox(admin)).find((i) => i.id === w.id)?.action,
    ).toContain("التقرير");
    await reviewEvent(w.id);
    await move(w.id, "archived");
    d = await eventQuery.eventDetail(a, w.id);
    expect(d.status).toBe("archived");
    expect(d.report?.status).toBe("approved");
    expect(d.attendance.find((r) => r.status === "present")?.count).toBe(1);
    expect(
      d.timeline.some((t) => t.action === "event.attendance_recorded"),
    ).toBe(true);
  });
  it("يمنع IDOR والبحث والوارد خارج النطاق", async () => {
    const w = await ev();
    await expect(eventQuery.eventDetail(b, w.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      eventEngine.updateEvent(b, w.id, { version: 1, title: "تعديل غير مصرح" }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await eventQuery.listEvents(b)).some((e) => e.id === w.id)).toBe(
      false,
    );
    expect(
      (await query.search(b, eventBase.title)).some((e) => e.id === w.id),
    ).toBe(false);
    expect((await query.inbox(b)).some((e) => e.id === w.id)).toBe(false);
  });
  it("بيانات المشاركين والميزانية والملفات الحساسة لا ترث إذن قراءة الفعالية", async () => {
    const w = await ev();
    await move(w.id, "pending_approval");
    await reviewEvent(w.id);
    await move(w.id, "registration_open");
    await eventEngine.registerParticipants(a, w.id, {
      participants: [
        {
          name: "شخص محمي",
          email: "secret@example.test",
          phone: "0500000000",
          universityId: "s1",
        },
      ],
    });
    await eventEngine.updateEvent(a, w.id, {
      version: (await eventAccess.getEvent(a, w.id)).version,
      actualSpend: 5000,
    });
    const file = await eventStorage.uploadEventFile(
      a,
      w.id,
      "list.txt",
      "text/plain",
      Buffer.from("private"),
      "القوائم",
      "participants",
    );
    const d = await eventQuery.eventDetail(m, w.id);
    expect(d.participants).toBeNull();
    expect(d.budget).toBeNull();
    expect(d.files).toHaveLength(0);
    await expect(
      eventStorage.downloadEventFile(m, file.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      eventStorage.downloadEventFile(b, file.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await eventStorage.downloadEventFile(a, file.id)).content.toString(),
    ).toBe("private");
  });
  it("لا يضيف عضوًا غير مؤهل أو خارج اللجنة الممثلة ولا يصعد الصلاحيات", async () => {
    const w = await ev();
    await expect(
      eventEngine.saveTeam(m, w.id, {
        userId: "member-b",
        roleId: "organization",
        startAt: "2026-01-01T00:00:00Z",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      eventEngine.saveTeam(a, w.id, {
        userId: "member-b",
        roleId: "volunteer",
        committeeId: "a",
        startAt: "2026-01-01T00:00:00Z",
      }),
    ).rejects.toMatchObject({ status: 422 });
    await database
      .update(s.user)
      .set({ active: false })
      .where(eq(s.user.id, "member-b"));
    await expect(
      eventEngine.saveTeam(a, w.id, {
        userId: "member-b",
        roleId: "volunteer",
        startAt: "2026-01-01T00:00:00Z",
      }),
    ).rejects.toMatchObject({ status: 422 });
    await database
      .update(s.user)
      .set({ active: true })
      .where(eq(s.user.id, "member-b"));
  });
  it("الانتقالات محمية والتجاوز يحتاج إذنًا وسببًا ويسجل تدقيقًا", async () => {
    const w = await ev(true);
    await expect(move(w.id, "ready")).rejects.toMatchObject({ status: 422 });
    await expect(
      move(w.id, "pending_approval", a, "أريد تجاوز المتطلبات"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(move(w.id, "pending_approval", admin)).rejects.toMatchObject({
      status: 409,
    });
    await move(w.id, "planning", admin); // admin cannot submit to self; use override readiness gate toward planning separately
    const plain = await ev();
    await move(plain.id, "pending_approval");
    await reviewEvent(plain.id);
    await move(plain.id, "preparing");
    await eventEngine.saveRequirement(a, plain.id, {
      title: "خطة طوارئ",
      category: "التنظيم",
      required: true,
      ownerId: "member-a",
      gate: "ready",
    });
    await expect(move(plain.id, "ready")).rejects.toMatchObject({
      status: 409,
    });
    await move(plain.id, "ready", admin, "تم اعتماد البديل في المحضر");
    const audit = await database
      .select()
      .from(s.auditLogs)
      .where(
        and(
          eq(s.auditLogs.entityId, plain.id),
          eq(s.auditLogs.action, "event.stage_overridden"),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0].newValue)).toContain("البديل");
  });
  it("الاعتماد محصور بالمعتمد المحدد ويرفض النسخة القديمة والتكرار", async () => {
    const w = await ev();
    await move(w.id, "pending_approval");
    await expect(
      eventEngine.reviewEvent(a, w.id, {
        decision: "approved",
        comment: "اعتماد ذاتي",
        version: 2,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      eventEngine.reviewEvent(admin, w.id, {
        decision: "approved",
        comment: "قديم",
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await reviewEvent(w.id, "changes_requested");
    expect((await eventAccess.getEvent(a, w.id)).status).toBe("planning");
    await move(w.id, "pending_approval");
    await reviewEvent(w.id);
    await expect(reviewEvent(w.id)).rejects.toMatchObject({ status: 403 });
  });
  it("القرار وتحويله إلى مهمة يحافظان على سياق الفعالية", async () => {
    const w = await ev();
    const meeting = await engine.createWork(a, {
      kind: "meeting",
      title: "اجتماع الفعالية",
      termId: "term",
      committeeId: "a",
      eventId: w.id,
      startAt: eventBase.startAt,
      endAt: eventBase.endAt,
    });
    const decision = await engine.createWork(a, {
      kind: "decision",
      title: "قرار الفعالية",
      termId: "term",
      meetingId: meeting.id,
    });
    const task = await engine.createWork(a, {
      ...base,
      title: "تنفيذ القرار",
      sourceId: decision.id,
    });
    expect(decision.eventId).toBe(w.id);
    expect(task.eventId).toBe(w.id);
    expect(
      (await eventQuery.eventDetail(a, w.id)).work.some(
        (r) => r.id === decision.id,
      ),
    ).toBe(true);
  });
  it("CSV يستورد ذريًا ويحمي السعة ويمنع التكرار والحضور لمشارك من فعالية أخرى", async () => {
    const w = await ev();
    await move(w.id, "pending_approval");
    await reviewEvent(w.id);
    await move(w.id, "registration_open");
    await eventEngine.registerParticipants(a, w.id, {
      csv: 'name,email,status\n"اسم، تجريبي",csv@example.test,present',
    });
    await expect(
      eventEngine.registerParticipants(a, w.id, {
        csv: "name,email\nجديد,new@example.test\nمكرر,csv@example.test",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await eventQuery.eventDetail(a, w.id)).participants).toHaveLength(
      1,
    );
    const foreign = await ev();
    const participant = (await eventQuery.eventDetail(a, w.id))
      .participants![0];
    await expect(
      eventEngine.recordAttendance(a, foreign.id, {
        participantId: participant.id,
        status: "present",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      eventEngine.registerParticipants(a, w.id, {
        participants: Array.from({ length: 11 }, (_, i) => ({
          name: `مشارك ${i}`,
        })),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("الجاهزية مشتقة ولا تختلق نسبة عند غياب المتطلبات", () => {
    expect(eventModel.readiness([]).percentage).toBeNull();
    const items = Array.from({ length: 18 }, (_, i) => ({
      title: `r${i}`,
      status: i < 15 ? "completed" : "pending",
      required: true,
      dueAt: null,
      gate: "ready",
    }));
    expect(eventModel.readiness(items).percentage).toBe(83);
  });
  it("منع تعديل فعالية مؤرشفة أو فصل مغلق", async () => {
    const w = await ev();
    await database
      .update(s.terms)
      .set({ status: "closed" })
      .where(eq(s.terms.id, "term"));
    await expect(
      eventEngine.updateEvent(a, w.id, { version: 1, title: "مغلق" }),
    ).rejects.toMatchObject({ status: 409 });
    await database
      .update(s.terms)
      .set({ status: "active" })
      .where(eq(s.terms.id, "term"));
  });
});

describe("اتساق الفعاليات وحالات الحواف", () => {
  it("يرجع إنشاء القالب كاملًا عند عدم أهلية مسؤول المهام", async () => {
    const before = await eventQuery.listEvents(a);
    await expect(
      eventEngine.createEvent(a, {
        ...eventBase,
        leadId: "member-b",
        playbookId: "workshop",
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(await eventQuery.listEvents(a)).toHaveLength(before.length);
  });
  it("الخطر يظهر لمالكه ويمنع التنفيذ حتى المعالجة والفريق ينتهي بموعده", async () => {
    const w = await ev();
    await eventEngine.saveTeam(a, w.id, {
      userId: "member-b",
      roleId: "volunteer",
      committeeId: "b",
      startAt: "2026-01-01T00:00:00Z",
    });
    await eventEngine.saveRisk(a, w.id, {
      title: "انقطاع التقنية",
      ownerId: "member-b",
      probability: 2,
      impact: 3,
      mitigation: "خطة بديلة",
    });
    const risk = (await eventQuery.eventDetail(a, w.id)).risks[0];
    expect(
      (await query.inbox(other)).find((i) => i.id === w.id)?.action,
    ).toContain("مخاطر");
    await move(w.id, "pending_approval");
    await reviewEvent(w.id);
    await move(w.id, "preparing");
    await expect(move(w.id, "ready")).rejects.toMatchObject({ status: 409 });
    await eventEngine.resolveRisk(other, w.id, {
      id: risk.id,
      status: "closed",
      mitigation: "تم تجهيز بديل",
    });
    await move(w.id, "ready");
    await eventEngine.saveTeam(a, w.id, {
      userId: "member-b",
      roleId: "volunteer",
      committeeId: "b",
      startAt: "2026-01-01T00:00:00Z",
      endAt: "2026-02-01T00:00:00Z",
    });
    await expect(eventAccess.getEvent(other, w.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("المتلقي يحول الطلب لمهمة دون كشف غرفة الفعالية ويحافظ على الربط", async () => {
    const w = await ev();
    const r = await engine.createWork(a, {
      kind: "request",
      title: "طلب مرتبط خاص",
      termId: "term",
      committeeId: "a",
      receivingCommitteeId: "b",
      reviewerId: "head-a",
      eventId: w.id,
    });
    const task = await engine.createWork(b, {
      kind: "task",
      title: "تنفيذ الجهة المستلمة",
      termId: "term",
      sourceId: r.id,
      responsibleId: "member-b",
      reviewerId: "head-b",
    });
    expect(task.eventId).toBe(w.id);
    expect((await query.detail(b, task.id)).parentEvent).toBeNull();
  });
  it("المتطلبات المجتازة لا يمكن حذف أثرها بتعديل البنية", async () => {
    const w = await ev();
    await eventEngine.saveRequirement(a, w.id, {
      title: "متطلب الاعتماد",
      category: "التنظيم",
      required: true,
      gate: "pending_approval",
      ownerId: "member-a",
      status: "completed",
    });
    const r = (await eventQuery.eventDetail(a, w.id)).requirements[0];
    await move(w.id, "pending_approval");
    await expect(
      eventEngine.saveRequirement(a, w.id, {
        id: r.id,
        title: r.title,
        category: r.category,
        required: false,
        gate: "archived",
        ownerId: r.ownerId,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
