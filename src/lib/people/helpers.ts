import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { activeTerm, actorContext, grant, type Connection } from "@/lib/work/access";
import { generateId } from "@/lib/governance/helpers";

export type PeopleScope = {
  academicTermId: string;
  committeeId: string | null;
  memberId?: string | null;
};

export const peopleId = generateId;

/**
 * Members are visible to a viewer when any of these hold:
 *  - the viewer is the member (self-service),
 *  - the viewer holds member.view at club scope,
 *  - the member is placed in a committee the viewer can read,
 *  - the member sits in a committee the viewer leads (management scope).
 * There is no implicit "everyone sees everyone": placement is the boundary.
 */
export async function visibleMemberIds(ctx: Identity, conn: Connection = db) {
  const now = new Date();
  const club = ctx.grants.some(
    (g) => g.permission === "member.view" && valid(g, now) && g.scope === "club",
  );
  if (club) return { all: true as const, ids: [] as string[] };
  const committeeIds = new Set<string>();
  for (const g of ctx.grants)
    if (g.permission === "member.view" && valid(g, now) && g.committeeId)
      committeeIds.add(g.committeeId);
  if (!committeeIds.size) return { all: false, ids: [ctx.user.id] };
  const placements = await conn
    .select({ userId: s.memberCommitteeHistory.userId })
    .from(s.memberCommitteeHistory)
    .innerJoin(
      s.terms,
      eq(s.terms.id, s.memberCommitteeHistory.academicTermId),
    )
    .where(
      and(
        sql`${s.memberCommitteeHistory.endAt} IS NULL`,
        eq(s.terms.status, "active"),
        or(
          ...[...committeeIds].map((id) =>
            eq(s.memberCommitteeHistory.committeeId, id),
          ),
        ),
      ),
    );
  return {
    all: false,
    ids: [...new Set([ctx.user.id, ...placements.map((p) => p.userId)])],
  };
}

const valid = (
  g: { active: boolean; startAt: Date; endAt: Date | null; termStatus?: string | null },
  now: Date,
) => g.active && g.startAt <= now && (!g.endAt || g.endAt > now) && g.termStatus !== "closed";

/** SQL mirror of visibleMemberIds, for list queries. */
export function memberScopeWhere(ctx: Identity): SQL {
  const now = new Date();
  const branches: SQL[] = [];
  const committeeIds: string[] = [];
  for (const g of ctx.grants) {
    if (g.permission !== "member.view" || !valid(g, now)) continue;
    if (g.scope === "club") return sql`true`;
    if (g.committeeId) committeeIds.push(g.committeeId);
  }
  if (committeeIds.length)
    branches.push(
      sql`EXISTS (SELECT 1 FROM member_committee_history mch JOIN academic_terms t ON t.id = mch.academic_term_id WHERE mch.user_id = ${s.memberProfiles.userId} AND mch.end_at IS NULL AND t.status = 'active' AND mch.committee_id IN (${sql.join(committeeIds.map((id) => sql`${id}`), sql`, `)}))`,
    );
  branches.push(eq(s.memberProfiles.userId, ctx.user.id));
  return or(...branches)!;
}

export function canViewMember(ctx: Identity, userId: string) {
  if (userId === ctx.user.id) return true;
  return visibleMemberIds(ctx).then((v) => v.all || v.ids.includes(userId));
}

/** Management-only fields stay out of every generic list and search result. */
export const isManager = (ctx: Identity, committeeId?: string | null) =>
  ctx.grants.some((g) => {
    if (g.permission !== "member.update") return false;
    const now = new Date();
    if (!valid(g, now)) return false;
    if (g.scope === "club") return true;
    if (g.scope === "committee" && committeeId) return g.committeeId === committeeId;
    return false;
  });

export const isSupervisor = (ctx: Identity) =>
  ctx.grants.some((g) => g.permission === "supervisor.view");

/**
 * The full member record a viewer may see. Sensitive fields appear only for
 * someone who actually holds the management permission, or for the member themself
 * on their own contact details.
 */
export function memberVisibility(
  ctx: Identity,
  row: typeof s.memberProfiles.$inferSelect,
  committeeId: string | null,
) {
  const manager = isManager(ctx, committeeId) || isManager(ctx, null);
  const self = row.userId === ctx.user.id;
  return {
    management: manager,
    supervisor: isSupervisor(ctx),
    private: manager || self,
    // The application profile is what the committee sees.
    profile: {
      fullName: undefined as string | undefined,
      studentId: row.studentId,
      phone: manager || self ? (row.phone ?? null) : null,
      major: row.major,
      college: row.college,
      academicLevel: row.academicLevel,
      gender: row.gender ?? null,
      skills: row.skills,
      interests: row.interests,
      developmentGoals: row.developmentGoals,
      previousExperience: row.previousExperience,
      preferredAreas: row.preferredAreas,
      availability: row.availability,
      joinedAt: row.joinedAt,
      status: row.status,
      statusReason: manager || self ? row.statusReason : null,
      imageUrl: row.imageUrl,
      managementNotes: manager ? row.managementNotes : null,
    },
  };
}

/**
 * A grant only counts while it is live: active, started, unexpired, and in a
 * term that is not closed. Read paths use this so a stale or closed-term grant
 * never widens what someone can see.
 */
export function hasLiveGrant(
  ctx: Identity,
  permission: string,
  now = new Date(),
) {
  return ctx.grants.some(
    (g) =>
      g.permission === permission &&
      g.active &&
      g.startAt <= now &&
      (!g.endAt || g.endAt > now) &&
      g.termStatus !== "closed",
  );
}

export function demand(ctx: Identity, permission: string, scope: PeopleScope) {
  if (!allowed(ctx, permission, scope))
    throw new HttpError(403, "لا تملك صلاحية هذا الإجراء ضمن النطاق");
}

export function allowed(ctx: Identity, permission: string, scope: PeopleScope) {
  return grant(
    ctx,
    permission,
    scope.committeeId,
    scope.academicTermId,
    scope.memberId ?? ctx.user.id,
  );
}

/**
 * Every People write runs in one transaction that re-checks the live session,
 * the active term, and the permission, so a revoked grant cannot land a write.
 */
export async function write<T>(
  ctx: Identity,
  scope: PeopleScope,
  permission: string,
  fn: (tx: Connection) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await activeTerm(scope.academicTermId, tx);
    const fresh = await actorContext(ctx.user.id, tx).catch(() => {
      throw new HttpError(401, "الحساب غير متاح");
    });
    if (!fresh.user.onboarded) throw new HttpError(409, "أكمل إعداد الحساب");
    ctx.grants = fresh.grants;
    demand(ctx, permission, scope);
    return fn(tx);
  });
}

/**
 * Writes for club-shared domains (assets, reservations) where the record has no
 * owning committee. Same re-checks as write(), but the permission is resolved
 * without a committee scope.
 */
export async function writeShared<T>(
  ctx: Identity,
  scope: PeopleScope,
  permission: string,
  fn: (tx: Connection) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    if (scope.academicTermId) await activeTerm(scope.academicTermId, tx);
    const fresh = await actorContext(ctx.user.id, tx).catch(() => {
      throw new HttpError(401, "الحساب غير متاح");
    });
    if (!fresh.user.onboarded) throw new HttpError(409, "أكمل إعداد الحساب");
    ctx.grants = fresh.grants;
    if (!hasLiveGrant(ctx, permission))
      throw new HttpError(403, "لا تملك صلاحية هذا الإجراء ضمن النطاق");
    return fn(tx);
  });
}

/**
 * Self-service writes. The session and the active term are re-checked, but no
 * management permission is required; the caller has already narrowed the fields
 * to the member-editable set.
 */
export async function writeSelf<T>(
  ctx: Identity,
  scope: PeopleScope,
  fn: (tx: Connection) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    if (scope.academicTermId) await activeTerm(scope.academicTermId, tx);
    const fresh = await actorContext(ctx.user.id, tx).catch(() => {
      throw new HttpError(401, "الحساب غير متاح");
    });
    if (!fresh.user.onboarded) throw new HttpError(409, "أكمل إعداد الحساب");
        ctx.grants = fresh.grants;
        return fn(tx);
      });
    }

    /**
     * A self-service write for a club-shared domain: the same transaction and
     * session re-checks as writeShared, but without requiring the desk permission,
     * because the caller has already established the actor owns the row.
     */
    export async function writeSharedSelf<T>(
      ctx: Identity,
      scope: PeopleScope,
      fn: (tx: Connection) => Promise<T>,
    ) {
      return writeSelf(ctx, scope, fn);
    }

    /** Appends to the shared audit log and the People activity stream separately. */
export async function record(
  tx: Connection,
  ctx: Identity,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    memberId?: string | null;
    committeeId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(s.auditLogs).values({
    id: generateId(),
    actorId: ctx.user.id,
    action: `people.${entry.action}`,
    entityType: entry.entityType,
    entityId: entry.entityId,
    sessionId: ctx.sessionId,
    newValue: entry.metadata ?? {},
  });
  await tx.insert(s.peopleEvents).values({
    actorId: ctx.user.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    memberId: entry.memberId ?? null,
    committeeId: entry.committeeId ?? null,
    metadata: entry.metadata ?? {},
  });
}

export async function notify(
  tx: Connection,
  userId: string,
  title: string,
  body: string,
) {
  await tx.insert(s.notifications).values({ id: generateId(), userId, title, body });
}

export async function currentTermId(conn: Connection = db) {
  const [term] = await conn
    .select()
    .from(s.terms)
    .where(eq(s.terms.status, "active"));
  if (!term) throw new HttpError(409, "لا يوجد فصل أكاديمي نشط");
  return term.id;
}

export const text = (value: string, max = 4000, label = "النص") => {
  const v = value.trim();
  if (v.length > max) throw new HttpError(422, `${label} أطول من الحد المسموح`);
  return v;
};

export const requiredText = (value: string, min: number, max: number, label: string) => {
  const v = value.trim();
  if (v.length < min || v.length > max)
    throw new HttpError(422, `${label} بين ${min} و${max} حرفًا`);
  return v;
};

export const list = (value: string[] | undefined, max = 20) =>
  (value ?? [])
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
