import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { generateId } from "@/lib/governance/helpers";
import {
  currentTermId,
  demand,
  hasLiveGrant,
  notify,
  record,
  write,
  writeShared,
  writeSharedSelf,
  type PeopleScope,
} from "@/lib/people/helpers";
import { mediaTransitions, openMediaStatuses } from "./types";

export const mediaId = generateId;

export type MediaScope = PeopleScope;

/**
 * Media and digital are club-wide service desks: the organization committee
 * raises a request and the media committee has to see and work it, so a live
 * media.view grant opens the whole queue regardless of its scope.
 *
 * That deliberately does not weaken the separation that matters: media cannot
 * reach digital records, digital cannot reach media records, and acting on a
 * request still requires the matching manage/approve permission plus the
 * self-approval guard.
 */
export async function visibleMediaIds(ctx: Identity) {
  if (!hasLiveGrant(ctx, "media.view")) return { all: false, ids: [] as string[] };
  return { all: true as const, ids: [] as string[] };
}

export async function listMediaRequests(
  ctx: Identity,
  input: { status?: string; eventId?: string; type?: string; q?: string } = {},
) {
  if (!hasLiveGrant(ctx, "media.view"))
    throw new HttpError(403, "لا تملك صلاحية قراءة الطلبات الإعلامية");
  const scope = await visibleMediaIds(ctx);
  const rows = scope.all
    ? await db.select().from(s.mediaRequests).orderBy(sql`${s.mediaRequests.createdAt} desc`)
    : await db
        .select()
        .from(s.mediaRequests)
        .where(
          scope.ids.length
            ? inArrayIds(scope.ids)
            : sql`false`,
        )
        .orderBy(sql`${s.mediaRequests.createdAt} desc`);
  let out = rows;
  if (input.status) out = out.filter((r) => r.status === input.status);
  if (input.eventId) out = out.filter((r) => r.eventId === input.eventId);
  if (input.type) out = out.filter((r) => r.mediaType === input.type);
  if (input.q) {
    const q = input.q.trim();
    out = out.filter((r) => r.title.includes(q) || r.description.includes(q));
  }
  return out;
}

const inArrayIds = (ids: string[]) =>
  sql`${s.mediaRequests.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;

export async function getMediaRequest(ctx: Identity, id: string) {
  if (!hasLiveGrant(ctx, "media.view"))
    throw new HttpError(403, "لا تملك صلاحية قراءة الطلبات الإعلامية");
  const row = await db.query.mediaRequests.findFirst({ where: eq(s.mediaRequests.id, id) });
  if (!row) throw new HttpError(404, "السجل غير متاح");
  const scope = await visibleMediaIds(ctx);
  if (
    !scope.all &&
    !scope.ids.includes(id) &&
    row.requestedById !== ctx.user.id &&
    row.assigneeId !== ctx.user.id
  )
    throw new HttpError(403, "لا تملك صلاحية قراءة هذا السجل");
  return row;
}

export async function mediaDetail(ctx: Identity, id: string) {
  const row = await getMediaRequest(ctx, id);
  const [revisions, decisions] = await Promise.all([
    db
      .select()
      .from(s.mediaRevisions)
      .where(eq(s.mediaRevisions.mediaRequestId, id))
      .orderBy(s.mediaRevisions.revision),
    db
      .select()
      .from(s.mediaDecisions)
      .where(eq(s.mediaDecisions.mediaRequestId, id))
      .orderBy(s.mediaDecisions.createdAt),
  ]);
  return { ...row, revisions, decisions };
}

export type CreateMediaRequestInput = {
  title: string;
  description?: string;
  committeeId?: string | null;
  eventId?: string | null;
  workRequestId?: string | null;
  mediaType: s.MediaType;
  audience?: string;
  platform?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  deadline?: Date | null;
  specs?: string;
  copyText?: string;
  references?: string;
  /** Optional caller-supplied id; the demo seed uses it for deterministic rows. */
  id?: string;
};

export async function createMediaRequest(ctx: Identity, input: CreateMediaRequestInput) {
  const academicTermId = await currentTermId();
  const title = input.title.trim();
  if (!title) throw new HttpError(422, "عنوان الطلب مطلوب");
  return writeShared(ctx, { academicTermId, committeeId: null }, "media.request.create", async (tx) => {
    const [created] = await tx
      .insert(s.mediaRequests)
      .values({
        id: input.id ?? mediaId(),
        title,
        description: input.description?.trim() ?? "",
        requestedById: ctx.user.id,
        committeeId: input.committeeId ?? null,
        eventId: input.eventId ?? null,
        workRequestId: input.workRequestId ?? null,
        mediaType: input.mediaType,
        audience: input.audience?.trim() ?? "",
        platform: input.platform?.trim() ?? "",
        priority: input.priority ?? "medium",
        deadline: input.deadline ?? null,
        specs: input.specs?.trim() ?? "",
        copyText: input.copyText?.trim() ?? "",
        references: input.references?.trim() ?? "",
        academicTermId,
        status: "new",
      })
      .returning();
    await record(tx, ctx, {
      action: "media.create",
      entityType: "media_request",
      entityId: created.id,
      committeeId: created.committeeId,
      metadata: { mediaType: created.mediaType, eventId: created.eventId },
    });
    return created;
  });
}

export async function updateMediaRequest(
  ctx: Identity,
  id: string,
  patch: Partial<CreateMediaRequestInput>,
) {
  const row = await getMediaRequest(ctx, id);
  return writeShared(ctx, { academicTermId: row.academicTermId, committeeId: null }, "media.request.manage", async (tx) => {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["title", "description", "audience", "platform", "specs", "copyText", "references"] as const)
      if (patch[key] !== undefined) update[key] = String(patch[key]).trim();
    if (patch.mediaType) update.mediaType = patch.mediaType;
    if (patch.priority) update.priority = patch.priority;
    if (patch.deadline !== undefined) update.deadline = patch.deadline ? new Date(patch.deadline) : null;
    if (patch.eventId !== undefined) update.eventId = patch.eventId ?? null;
    const [updated] = await tx.update(s.mediaRequests).set(update as any).where(eq(s.mediaRequests.id, id)).returning();
    await record(tx, ctx, {
      action: "media.update",
      entityType: "media_request",
      entityId: id,
      committeeId: row.committeeId,
      metadata: update,
    });
    return updated;
  });
}

/**
 * Assigns an operator and reviewer. Reviewer and assignee must differ so the
 * approval step has a second pair of eyes.
 */
export async function assignMedia(ctx: Identity, id: string, assigneeId: string, reviewerId?: string | null) {
  const row = await getMediaRequest(ctx, id);
  if (!assigneeId) throw new HttpError(422, "المكلَّف مطلوب");
  if (reviewerId && reviewerId === assigneeId)
    throw new HttpError(422, "لا يمكن أن يكون المراجع هو المكلَّف بنفسه");
  return writeShared(ctx, { academicTermId: row.academicTermId, committeeId: null }, "media.assign", async (tx) => {
    const patch: Record<string, unknown> = {
      assigneeId,
      reviewerId: reviewerId ?? null,
      updatedAt: new Date(),
    };
    if (row.status === "new") patch.status = "accepted";
    const [updated] = await tx.update(s.mediaRequests).set(patch as any).where(eq(s.mediaRequests.id, id)).returning();
    await tx.insert(s.mediaDecisions).values({
      id: mediaId(),
      mediaRequestId: id,
      actorId: ctx.user.id,
      action: "assign",
      fromStatus: row.status,
      toStatus: (patch.status as s.MediaRequestStatus) ?? row.status,
      note: reviewerId ? `المكلف والمراجع محددان` : `تم الإسناد`,
    });
    await record(tx, ctx, {
      action: "media.assign",
      entityType: "media_request",
      entityId: id,
      committeeId: row.committeeId,
      metadata: { assigneeId, reviewerId },
    });
    await notify(tx, assigneeId, "إسناد مهمة إعلامية", row.title);
    if (reviewerId) await notify(tx, reviewerId, "مراجعة مطلوبة", row.title);
    return updated;
  });
}

export async function submitRevision(ctx: Identity, id: string, input: { fileId?: string | null; note?: string }) {
  const row = await getMediaRequest(ctx, id);
  // Submitting a revision is self-service for the assignee, so the manage
    // permission is only required for someone else acting on their behalf.
    const manage = row.assigneeId === ctx.user.id || hasLiveGrant(ctx, "media.request.manage");
    if (!manage)
      throw new HttpError(403, "لا تملك صلاحية رفع نسخة لهذا الطلب");
    if (!mediaTransitions[row.status].includes("in_review") && row.status !== "in_production")
      throw new HttpError(422, "لا يمكن رفع نسخة في الحالة الحالية");
  return writeSharedSelf(ctx, { academicTermId: row.academicTermId, committeeId: null }, async (tx) => {
    const last = await tx
      .select()
      .from(s.mediaRevisions)
      .where(eq(s.mediaRevisions.mediaRequestId, id))
      .orderBy(sql`${s.mediaRevisions.revision} desc`)
      .limit(1);
    const revision = (last[0]?.revision ?? 0) + 1;
    const [rev] = await tx
      .insert(s.mediaRevisions)
      .values({
        id: mediaId(),
        mediaRequestId: id,
        revision,
        fileId: input.fileId ?? null,
        note: input.note?.trim() ?? "",
        submittedById: ctx.user.id,
      })
      .returning();
    const target = "in_review" as const;
    const [updated] = await tx
      .update(s.mediaRequests)
      .set({ status: target, updatedAt: new Date() })
      .where(eq(s.mediaRequests.id, id))
      .returning();
    await tx.insert(s.mediaDecisions).values({
      id: mediaId(),
      mediaRequestId: id,
      actorId: ctx.user.id,
      action: "submit_revision",
      fromStatus: row.status,
      toStatus: target,
      note: `نسخة ${revision}`,
    });
    await record(tx, ctx, {
      action: "media.submit_revision",
      entityType: "media_request",
      entityId: id,
      committeeId: row.committeeId,
      metadata: { revision },
    });
    if (row.reviewerId && row.reviewerId !== ctx.user.id)
      await notify(tx, row.reviewerId, "نسخة جديدة بانتظار المراجعة", row.title);
    return { revision: rev, request: updated };
  });
}

/** Review and approval are separate permissions and separate actors. */
export async function reviewMedia(ctx: Identity, id: string, decision: "approve" | "request_changes" | "reject", note = "") {
  const row = await getMediaRequest(ctx, id);
  const target =
      decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";
    // Separation is checked before the state machine so an operator learns they
    // may never approve their own output, not merely that the state forbids it.
    if (row.assigneeId && row.assigneeId === ctx.user.id)
      throw new HttpError(403, "لا يمكن مراجعة عملك أو اعتماده بنفسك");
    if (!mediaTransitions[row.status].includes(target as s.MediaRequestStatus))
      throw new HttpError(422, "لا يمكن اتخاذ هذا القرار في الحالة الحالية");
  const permission = decision === "approve" ? "media.approve" : "media.review";
  return write(ctx, { academicTermId: row.academicTermId, committeeId: row.committeeId }, permission, async (tx) => {
    const [updated] = await tx
      .update(s.mediaRequests)
      .set({ status: target, updatedAt: new Date() })
      .where(eq(s.mediaRequests.id, id))
      .returning();
    await tx.insert(s.mediaDecisions).values({
      id: mediaId(),
      mediaRequestId: id,
      actorId: ctx.user.id,
      action: decision,
      fromStatus: row.status,
      toStatus: target,
      note,
    });
    await record(tx, ctx, {
      action: `media.${decision}`,
      entityType: "media_request",
      entityId: id,
      committeeId: row.committeeId,
      metadata: { from: row.status, to: target },
    });
    if (row.assigneeId) await notify(tx, row.assigneeId, `مراجعة إعلامية: ${decision === "approve" ? "اعتماد" : decision === "reject" ? "رفض" : "تعديلات"}`, row.title);
    return updated;
  });
}

/** Scheduling and publishing never imply approval happened. */
export async function scheduleMedia(ctx: Identity, id: string, scheduledFor: Date) {
  const row = await getMediaRequest(ctx, id);
  if (row.status !== "approved" && row.status !== "scheduled")
    throw new HttpError(422, "الجدولة تتطلب اعتمادًا مسبقًا");
  return writeShared(ctx, { academicTermId: row.academicTermId, committeeId: null }, "media.publish", async (tx) => {
    const [updated] = await tx
      .update(s.mediaRequests)
      .set({ status: "scheduled", scheduledFor, updatedAt: new Date() })
      .where(eq(s.mediaRequests.id, id))
      .returning();
    await tx.insert(s.mediaDecisions).values({
      id: mediaId(),
      mediaRequestId: id,
      actorId: ctx.user.id,
      action: "schedule",
      fromStatus: row.status,
      toStatus: "scheduled",
      note: "",
    });
    await record(tx, ctx, { action: "media.schedule", entityType: "media_request", entityId: id, committeeId: row.committeeId });
    return updated;
  });
}

export async function publishMedia(ctx: Identity, id: string) {
  const row = await getMediaRequest(ctx, id);
  if (!["approved", "scheduled", "published"].includes(row.status))
    throw new HttpError(422, "النشر يتطلب حالة معتمدة أو مجدولة");
  return writeShared(ctx, { academicTermId: row.academicTermId, committeeId: null }, "media.publish", async (tx) => {
    const [updated] = await tx
      .update(s.mediaRequests)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(s.mediaRequests.id, id))
      .returning();
    await tx.insert(s.mediaDecisions).values({
      id: mediaId(),
      mediaRequestId: id,
      actorId: ctx.user.id,
      action: "publish",
      fromStatus: row.status,
      toStatus: "published",
      note: "",
    });
    await record(tx, ctx, { action: "media.publish", entityType: "media_request", entityId: id, committeeId: row.committeeId });
    return updated;
  });
}

export async function advanceMedia(ctx: Identity, id: string, target: s.MediaRequestStatus, note = "") {
  const row = await getMediaRequest(ctx, id);
  if (!mediaTransitions[row.status].includes(target))
    throw new HttpError(422, "لا يمكن الانتقال إلى هذه الحالة");
  return writeShared(ctx, { academicTermId: row.academicTermId, committeeId: null }, "media.request.manage", async (tx) => {
    const [updated] = await tx
      .update(s.mediaRequests)
      .set({ status: target, updatedAt: new Date() })
      .where(eq(s.mediaRequests.id, id))
      .returning();
    await tx.insert(s.mediaDecisions).values({
      id: mediaId(),
      mediaRequestId: id,
      actorId: ctx.user.id,
      action: "advance",
      fromStatus: row.status,
      toStatus: target,
      note,
    });
    await record(tx, ctx, { action: "media.advance", entityType: "media_request", entityId: id, committeeId: row.committeeId });
    return updated;
  });
}

/** Archive filter; only approved or finished work enters the archive. */
export async function archiveIndex(ctx: Identity, input: { eventId?: string; type?: string; platform?: string; from?: string; to?: string } = {}) {
  const rows = await listMediaRequests(ctx);
  return rows.filter((r) => {
    if (!["published", "completed", "approved"].includes(r.status)) return false;
    if (input.eventId && r.eventId !== input.eventId) return false;
    if (input.type && r.mediaType !== input.type) return false;
    if (input.platform && r.platform !== input.platform) return false;
    if (input.from && r.updatedAt < new Date(input.from)) return false;
    if (input.to && r.updatedAt > new Date(input.to)) return false;
    return true;
  });
}

export async function mediaSummary(ctx: Identity) {
  const rows = await listMediaRequests(ctx).catch(() => []);
  const now = new Date();
  return {
    total: rows.length,
    // The whole queue, so a desk can review work in any stage including the
    // settled ones a dashboard list would otherwise hide.
    all: rows,
    inProduction: rows.filter((r) => r.status === "in_production"),
    waitingReview: rows.filter((r) => r.status === "in_review"),
    changesRequested: rows.filter((r) => r.status === "changes_requested"),
    scheduled: rows.filter((r) => r.status === "scheduled"),
    published: rows.filter((r) => r.status === "published"),
    // Overdue means a recorded deadline that has passed while still open.
    overdue: rows.filter(
      (r) => r.deadline && r.deadline < now && openMediaStatuses.includes(r.status),
    ),
    pipeline: rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
  };
}