import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { generateId } from "@/lib/governance/helpers";
import {
  currentTermId,
  hasLiveGrant,
  notify,
  record,
  write,
  writeShared,
  type PeopleScope,
} from "@/lib/people/helpers";
import { reservationTransitions } from "./types";

export const resourceId = generateId;

export type ResourceScope = PeopleScope;

/** Assets are visible to anyone with resource.view; nothing here is private. */
export async function listAssets(ctx: Identity, input: { availability?: string; committeeId?: string; q?: string } = {}) {
  if (!hasLiveGrant(ctx, "resource.view")) return [];
  const rows = await db.select().from(s.assets).orderBy(s.assets.name);
  return rows.filter((r) => {
    if (input.availability && r.availability !== input.availability) return false;
    if (input.committeeId && r.committeeId !== input.committeeId) return false;
    if (input.q) {
      const q = input.q.trim();
      if (!r.name.includes(q) && !r.category.includes(q) && !(r.assetCode ?? "").includes(q)) return false;
    }
    return true;
  });
}

export async function getAsset(ctx: Identity, id: string) {
  if (!hasLiveGrant(ctx, "resource.view")) throw new HttpError(403, "لا تملك صلاحية قراءة الأصول");
  const row = await db.query.assets.findFirst({ where: eq(s.assets.id, id) });
  if (!row) throw new HttpError(404, "الأصل غير متاح");
  return row;
}

export type CreateAssetInput = {
  name: string;
  category: string;
  assetCode?: string | null;
  committeeId?: string | null;
  condition?: s.AssetCondition;
  custodianId?: string | null;
  notes?: string;
};

export async function createAsset(ctx: Identity, input: CreateAssetInput) {
  const name = input.name.trim();
  const category = input.category.trim();
  if (!name) throw new HttpError(422, "اسم الأصل مطلوب");
  if (!category) throw new HttpError(422, "تصنيف الأصل مطلوب");
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null}, "resource.manage", async (tx) => {
      // The uniqueness check must run on the transaction's connection: PGlite
      // serialises transactions, so a query on the outer connection would wait.
      if (input.assetCode) {
        const clash = await tx
          .select({ id: s.assets.id })
        .from(s.assets)
        .where(eq(s.assets.assetCode, input.assetCode.trim()))
        .limit(1);
      if (clash.length) throw new HttpError(422, "رمز الأصل مستخدم بالفعل");
    }
    const [created] = await tx
      .insert(s.assets)
      .values({
        id: resourceId(),
        name,
        category,
        assetCode: input.assetCode?.trim() || null,
        committeeId: input.committeeId ?? null,
        condition: input.condition ?? "good",
        custodianId: input.custodianId ?? null,
        notes: input.notes?.trim() ?? "",
      })
      .returning();
    await record(tx, ctx, {
      action: "resource.asset.create",
      entityType: "asset",
      entityId: created.id,
      committeeId: created.committeeId,
      metadata: { name, category },
    });
    return created;
  });
}

export async function updateAsset(ctx: Identity, id: string, patch: Partial<CreateAssetInput> & { availability?: s.AssetAvailability }) {
  const asset = await getAsset(ctx, id);
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null}, "resource.manage", async (tx) => {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["name", "category", "notes"] as const)
      if (patch[key] !== undefined) update[key] = String(patch[key]).trim();
    if (patch.assetCode !== undefined) update.assetCode = patch.assetCode?.trim() || null;
    if (patch.condition) update.condition = patch.condition;
    if (patch.availability) update.availability = patch.availability;
    if (patch.custodianId !== undefined) update.custodianId = patch.custodianId ?? null;
    const [updated] = await tx.update(s.assets).set(update as any).where(eq(s.assets.id, id)).returning();
    await record(tx, ctx, { action: "resource.asset.update", entityType: "asset", entityId: id, committeeId: asset.committeeId, metadata: update });
    return updated;
  });
}

/**
 * Two reservations overlap when each starts before the other ends. Approved
 * and checked-out rows block; requested rows may compete for approval and are
 * resolved when one of them is approved.
 */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export async function findConflicts(
  conn: { select: (...args: any[]) => any },
  assetId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
) {
  const rows = await conn
    .select()
    .from(s.assetReservations)
    .where(
      sql`${s.assetReservations.assetId} = ${assetId} AND ${s.assetReservations.status} IN ('approved','checked_out')`,
    );
  return rows.filter(
    (r: { id: string; startsAt: Date; endsAt: Date }) =>
      r.id !== excludeId && overlaps(startsAt, endsAt, r.startsAt, r.endsAt),
  );
}

export type CreateReservationInput = {
  assetId: string;
  purpose: string;
  eventId?: string | null;
  startsAt: Date;
  endsAt: Date;
  notes?: string;
  /** Optional caller-supplied id; the demo seed uses it for deterministic rows. */
  id?: string;
};

export async function reserveAsset(ctx: Identity, input: CreateReservationInput) {
  if (!hasLiveGrant(ctx, "resource.view")) throw new HttpError(403, "لا تملك صلاحية حجز الأصول");
  const asset = await getAsset(ctx, input.assetId);
  const purpose = input.purpose.trim();
  if (!purpose) throw new HttpError(422, "الغرض من الحجز مطلوب");
  const startsAt = input.startsAt;
  const endsAt = input.endsAt;
  if (!(startsAt < endsAt)) throw new HttpError(422, "وقت النهاية يجب أن يكون بعد وقت البداية");
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null}, "resource.reserve", async (tx) => {
    const [created] = await tx
      .insert(s.assetReservations)
      .values({
        id: input.id ?? resourceId(),
        assetId: asset.id,
        requestedById: ctx.user.id,
        purpose,
        eventId: input.eventId ?? null,
        startsAt,
        endsAt,
        notes: input.notes?.trim() ?? "",
      })
      .returning();
    await record(tx, ctx, {
      action: "resource.reserve",
      entityType: "asset_reservation",
      entityId: created.id,
      committeeId: asset.committeeId,
      metadata: { assetId: asset.id, startsAt, endsAt },
    });
    return created;
  });
}

export async function listReservations(ctx: Identity, input: { assetId?: string; status?: string } = {}) {
  if (!hasLiveGrant(ctx, "resource.view")) return [];
  const rows = await db.select().from(s.assetReservations).orderBy(sql`${s.assetReservations.startsAt} desc`);
  return rows.filter((r) => {
    if (input.assetId && r.assetId !== input.assetId) return false;
    if (input.status && r.status !== input.status) return false;
    return true;
  });
}

export async function getReservation(ctx: Identity, id: string) {
  if (!hasLiveGrant(ctx, "resource.view")) throw new HttpError(403, "لا تملك صلاحية قراءة الحجوزات");
  const row = await db.query.assetReservations.findFirst({ where: eq(s.assetReservations.id, id) });
  if (!row) throw new HttpError(404, "الحجز غير متاح");
  return row;
}

/** Approving is where a conflicting window is refused. */
export async function approveReservation(ctx: Identity, id: string) {
  const reservation = await getReservation(ctx, id);
  if (!reservationTransitions[reservation.status].includes("approved"))
    throw new HttpError(422, "لا يمكن اعتماد الحجز في الحالة الحالية");
  if (reservation.requestedById === ctx.user.id)
    throw new HttpError(403, "لا يمكن اعتماد حجز طلبته بنفسك");
  const asset = await db.query.assets.findFirst({ where: eq(s.assets.id, reservation.assetId) });
  if (!asset) throw new HttpError(404, "الأصل غير متاح");
  if (asset.availability === "unavailable")
    throw new HttpError(422, "الأصل غير متاح حاليًا");
  const conflicts = await findConflicts(db, reservation.assetId, reservation.startsAt, reservation.endsAt, reservation.id);
  if (conflicts.length)
    throw new HttpError(422, "توجد حجوزات معتمدة متداخلة مع هذه الفترة");
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null}, "resource.approve", async (tx) => {
    const [updated] = await tx
      .update(s.assetReservations)
      .set({ status: "approved", approverId: ctx.user.id, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(s.assetReservations.id, id))
      .returning();
    await record(tx, ctx, { action: "resource.reservation.approve", entityType: "asset_reservation", entityId: id, committeeId: asset.committeeId, metadata: { assetId: asset.id } });
    await notify(tx, reservation.requestedById, "تم اعتماد حجز الأصل", purposeOf(reservation));
    return updated;
  });
}

const purposeOf = (r: { purpose: string; assetId: string }) => `${r.purpose} (${r.assetId})`;

export async function rejectReservation(ctx: Identity, id: string, reason = "") {
  const reservation = await getReservation(ctx, id);
  if (!reservationTransitions[reservation.status].includes("rejected"))
    throw new HttpError(422, "لا يمكن رفض الحجز في الحالة الحالية");
  const asset = await db.query.assets.findFirst({ where: eq(s.assets.id, reservation.assetId) });
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null}, "resource.approve", async (tx) => {
    const [updated] = await tx
      .update(s.assetReservations)
      .set({ status: "rejected", approverId: ctx.user.id, notes: reason.trim(), updatedAt: new Date() })
      .where(eq(s.assetReservations.id, id))
      .returning();
    await record(tx, ctx, { action: "resource.reservation.reject", entityType: "asset_reservation", entityId: id, metadata: { reason } });
    await notify(tx, reservation.requestedById, "تم رفض حجز الأصل", purposeOf(reservation));
    return updated;
  });
}

/** Dispatch for the reservation actions the API exposes. */
export async function advanceReservation(ctx: Identity, id: string, action: string) {
  switch (action) {
    case "approve":
      return approveReservation(ctx, id);
    case "reject":
      return rejectReservation(ctx, id);
    case "checkout":
      return checkoutReservation(ctx, id);
    case "return":
      return returnReservation(ctx, id);
    default:
      throw new HttpError(404, "الإجراء غير متاح");
  }
}

/** Checkout records the condition observed before the item leaves. */
export async function checkoutReservation(ctx: Identity, id: string, conditionBefore?: string) {
  const reservation = await getReservation(ctx, id);
  if (!reservationTransitions[reservation.status].includes("checked_out"))
    throw new HttpError(422, "لا يمكن الاستلام إلا بعد اعتماد الحجز");
  const asset = await db.query.assets.findFirst({ where: eq(s.assets.id, reservation.assetId) });
  if (!asset) throw new HttpError(404, "الأصل غير متاح");
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null}, "resource.checkout", async (tx) => {
    const condition = conditionBefore?.trim() || asset.condition;
    const [updated] = await tx
      .update(s.assetReservations)
      .set({ status: "checked_out", checkedOutAt: new Date(), conditionBefore: condition, updatedAt: new Date() })
      .where(eq(s.assetReservations.id, id))
      .returning();
    await tx.update(s.assets).set({ availability: "checked_out", updatedAt: new Date() }).where(eq(s.assets.id, asset.id));
    await record(tx, ctx, { action: "resource.reservation.checkout", entityType: "asset_reservation", entityId: id, committeeId: asset.committeeId, metadata: { conditionBefore: condition } });
    return updated;
  });
}

/** Return records the condition after, and preserves the before value. */
export async function returnReservation(ctx: Identity, id: string, conditionAfter?: string) {
  const reservation = await getReservation(ctx, id);
  if (!reservationTransitions[reservation.status].includes("returned"))
    throw new HttpError(422, "لا يمكن الإرجاع قبل الاستلام");
  const asset = await db.query.assets.findFirst({ where: eq(s.assets.id, reservation.assetId) });
  if (!asset) throw new HttpError(404, "الأصل غير متاح");
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null}, "resource.checkout", async (tx) => {
    const condition = conditionAfter?.trim() || asset.condition;
    const [updated] = await tx
      .update(s.assetReservations)
      .set({ status: "returned", returnedAt: new Date(), conditionAfter: condition, updatedAt: new Date() })
      .where(eq(s.assetReservations.id, id))
      .returning();
    await tx
      .update(s.assets)
      .set({
        availability: "available",
        condition: condition as s.AssetCondition,
        updatedAt: new Date(),
      })
      .where(eq(s.assets.id, asset.id));
    await record(tx, ctx, { action: "resource.reservation.return", entityType: "asset_reservation", entityId: id, committeeId: asset.committeeId, metadata: { conditionAfter: condition, conditionBefore: reservation.conditionBefore } });
    // A damaged return is an operational fact; blame is never inferred from it.
    if (["damaged", "maintenance"].includes(condition))
      await tx.insert(s.assetIncidents).values({
        id: resourceId(),
        assetId: asset.id,
        reportedById: ctx.user.id,
        kind: condition === "damaged" ? "damaged" : "maintenance",
        details: reservation.conditionBefore
                  ? `تغيّرت حالة الأصل عند الإرجاع من "${reservation.conditionBefore}" إلى "${condition}"`
          : `أُرجع الأصل بحالة ${condition}`,
        status: "open",
      });
    return updated;
  });
}

// --- Incidents -----------------------------------------------------------
export type CreateIncidentInput = {
  assetId: string;
  kind: s.IncidentKind;
  details?: string;
  /** Explicit only: nothing infers responsibility from the incident itself. */
  responsibleUserId?: string | null;
  evidenceFileId?: string | null;
};

export async function reportIncident(ctx: Identity, input: CreateIncidentInput) {
  const asset = await getAsset(ctx, input.assetId);
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null}, "resource.manage", async (tx) => {
    const [created] = await tx
      .insert(s.assetIncidents)
      .values({
        id: resourceId(),
        assetId: asset.id,
        reportedById: ctx.user.id,
        kind: input.kind,
        details: input.details?.trim() ?? "",
        responsibleUserId: input.responsibleUserId ?? null,
        evidenceFileId: input.evidenceFileId ?? null,
      })
      .returning();
    if (input.kind === "damaged" || input.kind === "maintenance")
      await tx.update(s.assets).set({ condition: input.kind, availability: "unavailable", updatedAt: new Date() }).where(eq(s.assets.id, asset.id));
    await record(tx, ctx, {
      action: "resource.incident.report",
      entityType: "asset_incident",
      entityId: created.id,
      committeeId: asset.committeeId,
      metadata: { kind: input.kind, assetId: asset.id },
    });
    return created;
  });
}

export async function listIncidents(ctx: Identity, assetId?: string) {
  if (!hasLiveGrant(ctx, "resource.view")) return [];
  const rows = await db.select().from(s.assetIncidents).orderBy(sql`${s.assetIncidents.createdAt} desc`);
  return assetId ? rows.filter((r) => r.assetId === assetId) : rows;
}

export async function resolveIncident(ctx: Identity, id: string, resolution: string, restoreAsset = true) {
  if (!hasLiveGrant(ctx, "resource.view")) throw new HttpError(403, "لا تملك صلاحية قراءة سجل الأعطال");
  const incident = await db.query.assetIncidents.findFirst({ where: eq(s.assetIncidents.id, id) });
  if (!incident) throw new HttpError(404, "الحادثة غير متاحة");
  if (incident.status === "resolved") throw new HttpError(422, "الحادثة مغلقة مسبقًا");
  const asset = await db.query.assets.findFirst({ where: eq(s.assets.id, incident.assetId) });
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null}, "resource.manage", async (tx) => {
    const [updated] = await tx
      .update(s.assetIncidents)
      .set({ resolution: resolution.trim(), resolvedAt: new Date(), status: "resolved", updatedAt: new Date() })
      .where(eq(s.assetIncidents.id, id))
      .returning();
    if (restoreAsset && asset)
      await tx.update(s.assets).set({ condition: "good", availability: "available", updatedAt: new Date() }).where(eq(s.assets.id, asset.id));
    await record(tx, ctx, { action: "resource.incident.resolve", entityType: "asset_incident", entityId: id, metadata: { resolution } });
    return updated;
  });
}

export async function resourceSummary(ctx: Identity) {
  if (!hasLiveGrant(ctx, "resource.view"))
    return {
      total: 0,
      byAvailability: {} as Record<string, number>,
      byCondition: {} as Record<string, number>,
      pendingReservations: [] as typeof s.assetReservations.$inferSelect[],
      checkedOut: [] as typeof s.assetReservations.$inferSelect[],
      overdue: [] as typeof s.assetReservations.$inferSelect[],
      openIncidents: 0,
    };
  const [assets, reservations, incidents] = await Promise.all([
    db.select().from(s.assets),
    db.select().from(s.assetReservations),
    db.select().from(s.assetIncidents),
  ]);
  const now = new Date();
  return {
    total: assets.length,
    byAvailability: assets.reduce<Record<string, number>>((acc, a) => {
      acc[a.availability] = (acc[a.availability] ?? 0) + 1;
      return acc;
    }, {}),
    byCondition: assets.reduce<Record<string, number>>((acc, a) => {
      acc[a.condition] = (acc[a.condition] ?? 0) + 1;
      return acc;
    }, {}),
    pendingReservations: reservations.filter((r) => r.status === "requested"),
    checkedOut: reservations.filter((r) => r.status === "checked_out"),
    // Overdue only when an approved end time has actually passed.
    overdue: reservations.filter(
      (r) => (r.status === "checked_out" || r.status === "approved") && r.endsAt < now,
    ),
    openIncidents: incidents.filter((i) => i.status === "open").length,
  };
}