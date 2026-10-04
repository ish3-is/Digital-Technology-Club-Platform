import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { actorContext } from "@/lib/work/access";
import type { Connection } from "@/lib/work/access";
import {
  allowed,
  currentTermId,
  isManager,
  isSupervisor,
  list,
  memberScopeWhere,
  memberVisibility,
  notify,
  peopleId,
  record,
  requiredText,
  text,
  visibleMemberIds,
  write,
  writeSelf,
} from "./helpers";
import { memberStatusTransitions } from "./types";

export type MemberRow = typeof s.memberProfiles.$inferSelect;

export async function getProfile(ctx: Identity, userId: string) {
  const [row] = await db
    .select()
    .from(s.memberProfiles)
    .where(eq(s.memberProfiles.userId, userId));
  if (!row) throw new HttpError(404, "ملف العضو غير موجود");
  return row;
}

export async function ensureProfile(userId: string) {
  const [row] = await db
    .select()
    .from(s.memberProfiles)
    .where(eq(s.memberProfiles.userId, userId));
  if (row) return row;
  const [created] = await db
    .insert(s.memberProfiles)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  return created ?? (await getProfileRaw(userId));
}

async function getProfileRaw(userId: string) {
  const [row] = await db
    .select()
    .from(s.memberProfiles)
    .where(eq(s.memberProfiles.userId, userId));
  if (!row) throw new HttpError(404, "ملف العضو غير موجود");
  return row;
}

/**
 * The committee a member is currently placed in, from placement history only.
 * Pass the open transaction when calling inside a write, otherwise the nested
 * query would open a second connection while the first one holds the row locks.
 */
export async function currentPlacements(
  userIds: string[],
  conn: Connection = db,
) {
  if (!userIds.length) return [];
  return conn
    .select({
      userId: s.memberCommitteeHistory.userId,
      committeeId: s.memberCommitteeHistory.committeeId,
      committeeName: s.committees.name,
      assignmentType: s.memberCommitteeHistory.assignmentType,
      startAt: s.memberCommitteeHistory.startAt,
      academicTermId: s.memberCommitteeHistory.academicTermId,
    })
    .from(s.memberCommitteeHistory)
    .innerJoin(s.committees, eq(s.committees.id, s.memberCommitteeHistory.committeeId))
    .where(
      and(
        inArray(s.memberCommitteeHistory.userId, userIds),
        sql`${s.memberCommitteeHistory.endAt} IS NULL`,
      ),
    );
}

export async function listMembers(
  ctx: Identity,
  filters: {
    status?: s.MemberStatus;
    committeeId?: string;
    query?: string;
    role?: string;
  } = {},
) {
  const visible = await visibleMemberIds(ctx);
  if (!visible.all && !visible.ids.length) return [];
  const rows = await db
    .select({
      userId: s.memberProfiles.userId,
      name: s.user.name,
      email: s.user.email,
      status: s.memberProfiles.status,
      major: s.memberProfiles.major,
      college: s.memberProfiles.college,
      academicLevel: s.memberProfiles.academicLevel,
      studentId: s.memberProfiles.studentId,
      skills: s.memberProfiles.skills,
      joinedAt: s.memberProfiles.joinedAt,
      imageUrl: s.memberProfiles.imageUrl,
    })
    .from(s.memberProfiles)
    .innerJoin(s.user, eq(s.user.id, s.memberProfiles.userId))
    .where(
      and(
        visible.all ? undefined : inArray(s.memberProfiles.userId, visible.ids),
        filters.status ? eq(s.memberProfiles.status, filters.status) : undefined,
        filters.query
          ? sql`strpos(lower(${s.user.name}),lower(${filters.query}))>0 OR strpos(lower(coalesce(${s.memberProfiles.major},'')),lower(${filters.query}))>0 OR strpos(coalesce(${s.memberProfiles.studentId},''),${filters.query})>0 OR strpos(lower(${s.user.email}),lower(${filters.query}))>0`
          : undefined,
      ),
    )
    .orderBy(s.user.name);
  const placements = await currentPlacements(rows.map((r) => r.userId));
  const roleRows = await activeMemberRoles(rows.map((r) => r.userId));
  return rows
    .map((row) => {
      const mine = placements.filter((p) => p.userId === row.userId);
      const role = roleRows.find((r) => r.userId === row.userId);
      const committeeId = filters.committeeId ?? mine[0]?.committeeId ?? null;
      return {
        ...row,
        // Contact and management fields are withheld here on purpose.
        phone: null as string | null,
        managementNotes: null as string | null,
        statusReason: null as string | null,
        committees: mine.map((p) => ({
          id: p.committeeId,
          name: p.committeeName,
          type: p.assignmentType,
        })),
        role: role ? { clubRole: role.clubRole, committeeId: role.committeeId } : null,
        visibleFields: {
          management: isManager(ctx, committeeId) || isManager(ctx, null),
          supervisor: isSupervisor(ctx),
        },
      };
    })
    .filter(
      (r) =>
        !filters.committeeId ||
        r.committees.some((c) => c.id === filters.committeeId) ||
        r.role?.committeeId === filters.committeeId,
    )
    .filter((r) => !filters.role || r.role?.clubRole === filters.role);
}

export async function activeMemberRoles(userIds: string[]) {
  if (!userIds.length) return [];
  return db
    .select()
    .from(s.memberRoleHistory)
    .where(
      and(
        inArray(s.memberRoleHistory.userId, userIds),
        sql`${s.memberRoleHistory.endAt} IS NULL`,
      ),
    );
}

export type MemberInput = {
  studentId?: string | null;
  phone?: string | null;
  major?: string;
  college?: string;
  academicLevel?: string;
  gender?: "male" | "female";
  joinedAt?: Date;
  skills?: string[];
  interests?: string[];
  developmentGoals?: string[];
  previousExperience?: string;
  preferredAreas?: string[];
  availability?: string;
  motivation?: string;
  imageUrl?: string | null;
};

/** Fields a member may change on their own profile. Everything else needs management. */
const selfEditable = [
  "phone",
  "major",
  "college",
  "academicLevel",
  "skills",
  "interests",
  "developmentGoals",
  "previousExperience",
  "preferredAreas",
  "availability",
  "imageUrl",
] as const;

export async function updateMember(
  ctx: Identity,
  userId: string,
  input: MemberInput,
) {
  const termId = await currentTermId();
  const placements = await currentPlacements([userId]);
  const committeeId = placements[0]?.committeeId ?? null;
  const self = userId === ctx.user.id;
  const manages =
    allowed(ctx, "member.update", { academicTermId: termId, committeeId }) ||
    allowed(ctx, "member.update", { academicTermId: termId, committeeId: null });
  if (!self && !manages) throw new HttpError(403, "لا تملك صلاحية تعديل هذا الملف");
  if (self && !manages) {
    const illegal = Object.keys(input).filter(
      (k) => !(selfEditable as readonly string[]).includes(k),
    );
    if (illegal.length)
      throw new HttpError(403, "هذا الحقل تديره الإدارة فقط");
  }
  const scope = { academicTermId: termId, committeeId };
  const run = async (tx: Parameters<Parameters<typeof write>[3]>[0]) => {
    const [before] = await tx
      .select()
      .from(s.memberProfiles)
      .where(eq(s.memberProfiles.userId, userId));
    if (!before) throw new HttpError(404, "ملف العضو غير موجود");
    const patch = { ...input, updatedAt: new Date() };
    if (input.skills) patch.skills = list(input.skills);
    if (input.interests) patch.interests = list(input.interests);
    if (input.developmentGoals) patch.developmentGoals = list(input.developmentGoals);
    if (input.preferredAreas) patch.preferredAreas = list(input.preferredAreas);
    const [row] = await tx
      .update(s.memberProfiles)
      .set(patch)
      .where(eq(s.memberProfiles.userId, userId))
      .returning();
    await record(tx, ctx, {
      action: self && !manages ? "profile.self_updated" : "profile.updated",
      entityType: "member",
      entityId: userId,
      memberId: userId,
      committeeId,
      metadata: { fields: Object.keys(input) },
    });
    if (!self)
      await notify(
        tx,
        userId,
        "تم تحديث ملفك",
        "حدّثت الإدارة بيانات ملفك. راجع ملفك للتأكد.",
      );
    return row;
  };
  return manages
    ? write(ctx, scope, "member.update", run)
    : writeSelf(ctx, scope, run);
}

/**
 * Status is a sensitive label. It only moves along a declared transition and a
 * recorded reason, so nothing is ever marked "low engagement" silently.
 */
export async function changeMemberStatus(
  ctx: Identity,
  userId: string,
  next: s.MemberStatus,
  reason: string,
) {
  const termId = await currentTermId();
  const placements = await currentPlacements([userId]);
  const committeeId = placements[0]?.committeeId ?? null;
  const clean = requiredText(reason, 5, 500, "سبب تغيير الحالة");
  return write(ctx, { academicTermId: termId, committeeId }, "member.update", async (tx) => {
    const [before] = await tx
      .select()
      .from(s.memberProfiles)
      .where(eq(s.memberProfiles.userId, userId))
      .for("update");
    if (!before) throw new HttpError(404, "ملف العضو غير موجود");
    if (before.status === next)
      throw new HttpError(409, "الحالة الحالية هي نفسها المطلوبة");
    if (!memberStatusTransitions[before.status].includes(next))
      throw new HttpError(409, "انتقال الحالة غير مسموح");
    const [row] = await tx
      .update(s.memberProfiles)
      .set({ status: next, statusReason: clean, updatedAt: new Date() })
      .where(eq(s.memberProfiles.userId, userId))
      .returning();
    await tx.insert(s.memberStatusHistory).values({
      id: peopleId(),
      userId,
      previousStatus: before.status,
      newStatus: next,
      reason: clean,
      changedBy: ctx.user.id,
    });
    await record(tx, ctx, {
      action: "status.changed",
      entityType: "member",
      entityId: userId,
      memberId: userId,
      committeeId,
      metadata: { from: before.status, to: next, reason: clean },
    });
    await notify(
      tx,
      userId,
      "تحديث حالة العضوية",
      `تم تحديث حالتك إلى «${next}» بعد قرار مسجّل.`,
    );
    return row;
  });
}

export async function setClubRole(
  ctx: Identity,
  input: {
    userId: string;
    clubRole: string;
    committeeId?: string | null;
    academicTermId: string;
    reason?: string;
  },
) {
  const reason = text(input.reason ?? "", 500);
  return write(
    ctx,
    {
      academicTermId: input.academicTermId,
      committeeId: input.committeeId ?? null,
    },
    "member.update",
    async (tx) => {
      // The previous open row is closed, never overwritten.
      const [current] = await tx
        .select()
        .from(s.memberRoleHistory)
        .where(
          and(
            eq(s.memberRoleHistory.userId, input.userId),
            sql`${s.memberRoleHistory.endAt} IS NULL`,
          ),
        );
      if (current?.clubRole === input.clubRole && (current.committeeId ?? null) === (input.committeeId ?? null))
        throw new HttpError(409, "الدور الحالي مطابق");
      const now = new Date();
      if (current)
        await tx
          .update(s.memberRoleHistory)
          .set({ endAt: now })
          .where(eq(s.memberRoleHistory.id, current.id));
      const [row] = await tx
        .insert(s.memberRoleHistory)
        .values({
          id: peopleId(),
          userId: input.userId,
          clubRole: input.clubRole,
          previousClubRole: current?.clubRole ?? null,
          committeeId: input.committeeId ?? null,
          academicTermId: input.academicTermId,
          reason,
          assignedBy: ctx.user.id,
          startAt: now,
        })
        .returning();
      await ensureProfileInTx(tx, input.userId);
      await record(tx, ctx, {
        action: "role.changed",
        entityType: "member",
        entityId: input.userId,
        memberId: input.userId,
        committeeId: input.committeeId ?? null,
        metadata: { from: current?.clubRole ?? null, to: input.clubRole, reason },
      });
      await notify(
        tx,
        input.userId,
        "تحديث الدور",
        `تم تسجيل تغيير دورك إلى «${input.clubRole}».`,
      );
      return row;
    },
  );
}

export async function ensureProfileInTx(
  tx: Parameters<Parameters<typeof write>[3]>[0],
  userId: string,
) {
  await tx
    .insert(s.memberProfiles)
    .values({ userId })
    .onConflictDoNothing();
}

export async function roleHistory(ctx: Identity, userId: string) {
  await getProfile(ctx, userId);
  return db
    .select()
    .from(s.memberRoleHistory)
    .where(eq(s.memberRoleHistory.userId, userId))
    .orderBy(desc(s.memberRoleHistory.startAt));
}

export async function committeeHistory(ctx: Identity, userId: string) {
  await getProfile(ctx, userId);
  return db
    .select({
      id: s.memberCommitteeHistory.id,
      committeeId: s.memberCommitteeHistory.committeeId,
      committeeName: s.committees.name,
      assignmentType: s.memberCommitteeHistory.assignmentType,
      reason: s.memberCommitteeHistory.reason,
      startAt: s.memberCommitteeHistory.startAt,
      endAt: s.memberCommitteeHistory.endAt,
    })
    .from(s.memberCommitteeHistory)
    .innerJoin(
      s.committees,
      eq(s.committees.id, s.memberCommitteeHistory.committeeId),
    )
    .where(eq(s.memberCommitteeHistory.userId, userId))
    .orderBy(desc(s.memberCommitteeHistory.startAt));
}

export async function statusHistory(userId: string) {
  return db
    .select()
    .from(s.memberStatusHistory)
    .where(eq(s.memberStatusHistory.userId, userId))
    .orderBy(desc(s.memberStatusHistory.createdAt));
}

/** The visible projection of a profile; sensitive fields respect the viewer. */
export async function memberView(ctx: Identity, userId: string) {
  const row = await getProfile(ctx, userId);
  const [account] = await db
    .select({ name: s.user.name, email: s.user.email, active: s.user.active })
    .from(s.user)
    .where(eq(s.user.id, userId));
  if (!account) throw new HttpError(404, "الحساب غير موجود");
  const placements = await currentPlacements([userId]);
  const committeeId = placements[0]?.committeeId ?? null;
  if (!ctx.user.id) throw new HttpError(401, "يرجى تسجيل الدخول");
  const visible = await visibleMemberIds(ctx);
  if (!visible.all && !visible.ids.includes(userId))
    throw new HttpError(404, "العضو غير متاح ضمن نطاقك");
  const role = (await activeMemberRoles([userId]))[0] ?? null;
  return {
    row,
    account,
    view: memberVisibility(ctx, row, committeeId),
    placements: await committeeHistory(ctx, userId),
    roles: await roleHistory(ctx, userId),
  };
}

/** Candidate mentors: active members who are not the mentee. */
export async function mentorCandidates(ctx: Identity, excludeUserId: string) {
  const visible = await visibleMemberIds(ctx);
  if (!visible.all && !visible.ids.length) return [];
  const rows = await db
    .select({ userId: s.memberProfiles.userId, name: s.user.name })
    .from(s.memberProfiles)
    .innerJoin(s.user, eq(s.user.id, s.memberProfiles.userId))
    .where(
      and(
        inArray(s.memberProfiles.userId, visible.ids),
        sql`${s.memberProfiles.userId} <> ${excludeUserId}`,
        inArray(s.memberProfiles.status, ["active", "new"]),
      ),
    )
    .orderBy(s.user.name);
  return rows;
}

/** The shape used when the options read fails; keeps the page renderable. */
export function emptyPeopleOptions() {
  return {
    academicTermId: null as string | null,
    activeTermCount: 0,
    committees: [] as { id: string; name: string }[],
    people: [] as { id: string; name: string }[],
    permissions: Object.fromEntries(
      [
        "memberView", "memberUpdate", "memberArchive", "applicationView",
        "applicationCreate", "applicationReview", "applicationDecide",
        "onboardingView", "onboardingManage", "placementView", "placementManage",
        "mentorView", "mentorAssign", "mentorUpdate", "hoursView", "hoursSubmit",
        "hoursApprove", "achievementView", "achievementCreate", "achievementVerify",
        "badgeView", "badgeManage", "badgeAward", "xpView", "xpAdjust", "impactView",
        "impactAdjust", "transferView", "transferRequest", "transferApprove",
        "handoverView", "handoverManage",
      ].map((key) => [key, false]),
    ) as Record<string, boolean>,
  };
}

export async function peopleOptions(ctx: Identity) {
  const termId = await currentTermId().catch(() => null);
  const committees = ctx.grants.some((g) => g.committeeId)
    ? await db
        .select({ id: s.committees.id, name: s.committees.name })
        .from(s.committees)
    : [];
  const visible = await visibleMemberIds(ctx);
  const people = visible.all || visible.ids.length
    ? await db
        .select({ id: s.user.id, name: s.user.name })
        .from(s.user)
        .where(
          and(
            eq(s.user.active, true),
            visible.all ? undefined : inArray(s.user.id, visible.ids),
          ),
        )
        .orderBy(s.user.name)
    : [];
  const grants = new Set(ctx.grants.filter((g) => g.active).map((g) => g.permission));
  return {
    academicTermId: termId,
    activeTermCount: termId ? 1 : 0,
    committees,
    people,
    permissions: {
      memberView: grants.has("member.view"),
      memberUpdate: grants.has("member.update"),
      memberArchive: grants.has("member.archive"),
      applicationView: grants.has("application.view"),
      applicationCreate: grants.has("application.create"),
      applicationReview: grants.has("application.review"),
      applicationDecide: grants.has("application.decide"),
      onboardingView: grants.has("onboarding.view"),
      onboardingManage: grants.has("onboarding.manage"),
      placementView: grants.has("committee_assignment.view"),
      placementManage: grants.has("committee_assignment.manage"),
      mentorView: grants.has("mentor.view"),
      mentorAssign: grants.has("mentor.assign"),
      mentorUpdate: grants.has("mentor.update"),
      hoursView: grants.has("volunteer_hours.view"),
      hoursSubmit: grants.has("volunteer_hours.submit"),
      hoursApprove: grants.has("volunteer_hours.approve"),
      achievementView: grants.has("achievement.view"),
      achievementCreate: grants.has("achievement.create"),
      achievementVerify: grants.has("achievement.verify"),
      badgeView: grants.has("badge.view"),
      badgeManage: grants.has("badge.manage"),
      badgeAward: grants.has("badge.award"),
      xpView: grants.has("xp.view"),
      xpAdjust: grants.has("xp.adjust"),
      impactView: grants.has("impact.view"),
      impactAdjust: grants.has("impact.adjust"),
      transferView: grants.has("transfer.view"),
      transferRequest: grants.has("transfer.request"),
      transferApprove: grants.has("transfer.approve"),
      handoverView: grants.has("handover.view"),
      handoverManage: grants.has("handover.manage"),
    },
  };
}

export async function activeContextUser(userId: string) {
  try {
    return await actorContext(userId);
  } catch {
    throw new HttpError(422, "العضو غير متاح");
  }
}
