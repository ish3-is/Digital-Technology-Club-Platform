import { and, eq, desc, inArray, or, isNull } from "drizzle-orm";
import { db } from "../db";
import * as s from "../db/schema";
import { auth } from "./auth";
import { permits } from "./policy";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function identity(headers: Headers, allowSetup = false) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new HttpError(401, "يرجى تسجيل الدخول");
  const [user] = await db
    .select({
      id: s.user.id,
      name: s.user.name,
      email: s.user.email,
      active: s.user.active,
      onboarded: s.user.onboarded,
    })
    .from(s.user)
    .where(eq(s.user.id, session.user.id));
  if (!user?.active) throw new HttpError(401, "الحساب غير متاح");
  if (!allowSetup && !user.onboarded)
    throw new HttpError(409, "أكمل إعداد حسابك");
  const grants = await db
    .select({
      permission: s.rolePermissions.permissionId,
      scope: s.assignments.scope,
      committeeId: s.assignments.committeeId,
      startAt: s.assignments.startAt,
      endAt: s.assignments.endAt,
      active: s.assignments.active,
      termStatus: s.terms.status,
      termId: s.assignments.termId,
    })
    .from(s.assignments)
    .innerJoin(
      s.rolePermissions,
      eq(s.assignments.roleId, s.rolePermissions.roleId),
    )
    .leftJoin(s.terms, eq(s.assignments.termId, s.terms.id))
    .where(eq(s.assignments.userId, user.id));
  return { user, grants, sessionId: session.session.id };
}
export type Identity = Awaited<ReturnType<typeof identity>>;
export async function visibleCommittees(ctx: Identity) {
  const ids = ctx.grants
    .filter(
      (g) =>
        g.committeeId &&
        permits(ctx.grants, "committee.read", { committeeId: g.committeeId }),
    )
    .map((g) => g.committeeId!);
  if (permits(ctx.grants, "committee.read"))
    return db.select().from(s.committees);
  return ids.length
    ? db.select().from(s.committees).where(inArray(s.committees.id, ids))
    : [];
}
export async function committee(ctx: Identity, id: string) {
  if (!permits(ctx.grants, "committee.read", { committeeId: id }))
    throw new HttpError(404, "اللجنة غير متاحة");
  const [row] = await db
    .select()
    .from(s.committees)
    .where(eq(s.committees.id, id));
  if (!row) throw new HttpError(404, "اللجنة غير متاحة");
  return row;
}
export async function updateCommittee(
  ctx: Identity,
  id: string,
  description: string,
) {
  if (!permits(ctx.grants, "committee.update", { committeeId: id }))
    throw new HttpError(404, "اللجنة غير متاحة");
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(s.committees)
      .where(eq(s.committees.id, id))
      .for("update");
    if (!before) throw new HttpError(404, "اللجنة غير متاحة");
    const [after] = await tx
      .update(s.committees)
      .set({ description })
      .where(eq(s.committees.id, id))
      .returning();
    await tx.insert(s.activities).values({
      id: crypto.randomUUID(),
      actorId: ctx.user.id,
      action: "committee.updated",
      entityType: "committee",
      entityId: id,
      committeeId: id,
      metadata: { label: "تم تحديث نبذة اللجنة" },
    });
    await tx.insert(s.auditLogs).values({
      id: crypto.randomUUID(),
      actorId: ctx.user.id,
      action: "committee.updated",
      entityType: "committee",
      entityId: id,
      previousValue: before,
      newValue: after,
      sessionId: ctx.sessionId,
    });
    return after;
  });
}
export async function updateProfile(ctx: Identity, name: string) {
  return db.transaction(async (tx) => {
    await tx
      .update(s.user)
      .set({ name, onboarded: true, updatedAt: new Date() })
      .where(eq(s.user.id, ctx.user.id));
    await tx
      .insert(s.profiles)
      .values({ userId: ctx.user.id })
      .onConflictDoNothing();
    await tx.insert(s.activities).values({
      id: crypto.randomUUID(),
      actorId: ctx.user.id,
      ownerId: ctx.user.id,
      action: "profile.updated",
      entityType: "user",
      entityId: ctx.user.id,
      metadata: {
        label: ctx.user.onboarded
          ? "تم تحديث ملفك الشخصي"
          : "اكتمل إعداد حسابك",
      },
    });
    await tx.insert(s.auditLogs).values({
      id: crypto.randomUUID(),
      actorId: ctx.user.id,
      action: "profile.updated",
      entityType: "user",
      entityId: ctx.user.id,
      previousValue: { name: ctx.user.name },
      newValue: { name },
      sessionId: ctx.sessionId,
    });
    if (!ctx.user.onboarded)
      await tx.insert(s.notifications).values({
        id: crypto.randomUUID(),
        userId: ctx.user.id,
        title: "أهلًا بك في المقر الرقمي",
        body: "اكتمل إعداد حسابك. ستظهر لجانك بحسب التعيينات المعتمدة.",
      });
    return { ok: true };
  });
}
export async function foundation(ctx: Identity) {
  const { accessWhere } = await import("./work/access");
  const committees = await visibleCommittees(ctx);
  const ids = committees.map((c) => c.id);
  return {
    user: ctx.user,
    committees,
    notifications: await db
      .select()
      .from(s.notifications)
      .where(
        and(
          eq(s.notifications.userId, ctx.user.id),
          or(
            isNull(s.notifications.workId),
            inArray(
              s.notifications.workId,
              db
                .select({ id: s.workItems.id })
                .from(s.workItems)
                .where(accessWhere(ctx)),
            ),
          ),
        ),
      )
      .orderBy(desc(s.notifications.createdAt))
      .limit(50),
    activities: await db
      .select()
      .from(s.activities)
      .where(
        or(
          eq(s.activities.ownerId, ctx.user.id),
          ...(ids.length ? [inArray(s.activities.committeeId, ids)] : []),
        ),
      )
      .orderBy(desc(s.activities.createdAt))
      .limit(12),
    terms: await db.select().from(s.terms).where(eq(s.terms.status, "active")),
    admin: permits(ctx.grants, "organization.manage"),
    supervisor: permits(ctx.grants, "report.review"),
  };
}
export async function readNotification(ctx: Identity, id: string) {
  const [notice] = await db
    .select()
    .from(s.notifications)
    .where(
      and(eq(s.notifications.id, id), eq(s.notifications.userId, ctx.user.id)),
    );
  if (!notice) throw new HttpError(404, "التنبيه غير متاح");
  if (notice.workId) {
    const { getWork } = await import("./work/access");
    await getWork(ctx, notice.workId);
  }
  const rows = await db
    .update(s.notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(s.notifications.id, id), eq(s.notifications.userId, ctx.user.id)),
    )
    .returning({ id: s.notifications.id });
  if (!rows.length) throw new HttpError(404, "التنبيه غير متاح");
  return { ok: true };
}
