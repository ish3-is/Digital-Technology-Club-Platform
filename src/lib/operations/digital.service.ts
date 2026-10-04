import { eq, sql } from "drizzle-orm";
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
import { digitalTransitions, openDigitalStatuses } from "./types";

export const digitalId = generateId;

export type DigitalScope = PeopleScope;

/**
 * Digital is the same club-wide service desk as media: an open service queue
 * rather than per-committee data. Cross-domain separation still holds because
 * digital permissions never reach media records and vice versa.
 */
export async function visibleDigitalIds(ctx: Identity) {
  if (!hasLiveGrant(ctx, "digital.view")) return { all: false, ids: [] as string[] };
  return { all: true as const, ids: [] as string[] };
}

export async function listDigitalRequests(
  ctx: Identity,
  input: { status?: string; serviceType?: string; eventId?: string; q?: string } = {},
) {
  if (!hasLiveGrant(ctx, "digital.view"))
    throw new HttpError(403, "لا تملك صلاحية قراءة الخدمات الرقمية");
  const scope = await visibleDigitalIds(ctx);
  const rows = scope.all
    ? await db.select().from(s.digitalRequests).orderBy(sql`${s.digitalRequests.createdAt} desc`)
    : await db
        .select()
        .from(s.digitalRequests)
        .where(
          scope.ids.length
            ? sql`${s.digitalRequests.id} IN (${sql.join(scope.ids.map((id) => sql`${id}`), sql`, `)})`
            : sql`false`,
        )
        .orderBy(sql`${s.digitalRequests.createdAt} desc`);
  let out = rows;
  if (input.status) out = out.filter((r) => r.status === input.status);
  if (input.serviceType) out = out.filter((r) => r.serviceType === input.serviceType);
  if (input.eventId) out = out.filter((r) => r.eventId === input.eventId);
  if (input.q) {
    const q = input.q.trim();
    out = out.filter((r) => r.title.includes(q) || r.description.includes(q));
  }
  return out;
}

export async function getDigitalRequest(ctx: Identity, id: string) {
  if (!hasLiveGrant(ctx, "digital.view"))
    throw new HttpError(403, "لا تملك صلاحية قراءة الخدمات الرقمية");
  const row = await db.query.digitalRequests.findFirst({ where: eq(s.digitalRequests.id, id) });
  if (!row) throw new HttpError(404, "السجل غير متاح");
  const scope = await visibleDigitalIds(ctx);
  if (!scope.all && !scope.ids.includes(id))
    throw new HttpError(403, "لا تملك صلاحية قراءة هذا السجل");
  return row;
}

export type CreateDigitalRequestInput = {
  title: string;
  description?: string;
  committeeId?: string | null;
  eventId?: string | null;
  workRequestId?: string | null;
  serviceType: s.DigitalServiceType;
  deadline?: Date | null;
  priority?: "low" | "medium" | "high" | "urgent";
  /** Optional caller-supplied id; the demo seed uses it for deterministic rows. */
  id?: string;
};

export async function createDigitalRequest(ctx: Identity, input: CreateDigitalRequestInput) {
  const academicTermId = await currentTermId();
  const title = input.title.trim();
  if (!title) throw new HttpError(422, "عنوان الطلب مطلوب");
  return writeShared(ctx, { academicTermId, committeeId: null }, "digital.request.create", async (tx) => {
    const [created] = await tx
      .insert(s.digitalRequests)
      .values({
        id: input.id ?? digitalId(),
        title,
        description: input.description?.trim() ?? "",
        requestedById: ctx.user.id,
        committeeId: input.committeeId ?? null,
        eventId: input.eventId ?? null,
        workRequestId: input.workRequestId ?? null,
        serviceType: input.serviceType,
        deadline: input.deadline ?? null,
        priority: input.priority ?? "medium",
        academicTermId,
        status: "new",
      })
      .returning();
    await record(tx, ctx, {
      action: "digital.create",
      entityType: "digital_request",
      entityId: created.id,
      committeeId: created.committeeId,
      metadata: { serviceType: created.serviceType, eventId: created.eventId },
    });
    return created;
  });
}

/** Completion requires a recorded result: a URL or a linked produced record. */
export async function completeDigitalRequest(
  ctx: Identity,
  id: string,
  input: { resultUrl?: string | null; resultFormId?: string | null; resultCertificateBatchId?: string | null; note?: string },
) {
  const row = await getDigitalRequest(ctx, id);
  if (!digitalTransitions[row.status].includes("completed"))
    throw new HttpError(422, "لا يمكن إكمال الطلب في الحالة الحالية");
  const hasResult = Boolean(input.resultUrl || input.resultFormId || input.resultCertificateBatchId);
  if (!hasResult)
    throw new HttpError(422, "إنهاء الطلب يتطلب تسجيل رابط أو مخرج مرتبط");
  if (input.resultFormId) {
    const form = await db.query.digitalForms.findFirst({ where: eq(s.digitalForms.id, input.resultFormId) });
    if (!form) throw new HttpError(404, "النموذج المرتبط غير متاح");
  }
  if (input.resultCertificateBatchId) {
    const batch = await db.query.certificateBatches.findFirst({
      where: eq(s.certificateBatches.id, input.resultCertificateBatchId),
    });
    if (!batch) throw new HttpError(404, "دفعة الشهادات المرتبطة غير متاحة");
  }
  return writeShared(ctx, { academicTermId: row.academicTermId, committeeId: null }, "digital.request.manage", async (tx) => {
    const [updated] = await tx
      .update(s.digitalRequests)
      .set({
        status: "completed",
        resultUrl: input.resultUrl ?? null,
        resultFormId: input.resultFormId ?? null,
        resultCertificateBatchId: input.resultCertificateBatchId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(s.digitalRequests.id, id))
      .returning();
    await record(tx, ctx, {
      action: "digital.complete",
      entityType: "digital_request",
      entityId: id,
      committeeId: row.committeeId,
      metadata: { resultUrl: input.resultUrl, resultFormId: input.resultFormId, resultCertificateBatchId: input.resultCertificateBatchId },
    });
    await notify(tx, row.requestedById, "اكتملت الخدمة الرقمية", row.title);
    return updated;
  });
}

export async function advanceDigital(ctx: Identity, id: string, target: s.DigitalRequestStatus, note = "") {
  const row = await getDigitalRequest(ctx, id);
  if (!digitalTransitions[row.status].includes(target))
    throw new HttpError(422, "لا يمكن الانتقال إلى هذه الحالة");
  if (target === "completed")
    throw new HttpError(422, "استخدم إنهاء الطلب مع تسجيل المخرج");
  return writeShared(ctx, { academicTermId: row.academicTermId, committeeId: null }, "digital.request.manage", async (tx) => {
    const patch: Record<string, unknown> = { status: target, updatedAt: new Date() };
    if (target === "received" && !row.assigneeId) patch.assigneeId = ctx.user.id;
    const [updated] = await tx.update(s.digitalRequests).set(patch as any).where(eq(s.digitalRequests.id, id)).returning();
    await record(tx, ctx, {
      action: "digital.advance",
      entityType: "digital_request",
      entityId: id,
      committeeId: row.committeeId,
      metadata: { from: row.status, to: target, note },
    });
    if (target === "waiting_input") await notify(tx, row.requestedById, "الخدمة الرقمية تنتظر مدخلات", row.title);
    return updated;
  });
}

export async function assignDigital(ctx: Identity, id: string, assigneeId: string) {
  const row = await getDigitalRequest(ctx, id);
  if (!assigneeId) throw new HttpError(422, "المكلَّف مطلوب");
  return writeShared(ctx, { academicTermId: row.academicTermId, committeeId: null }, "digital.request.manage", async (tx) => {
    const [updated] = await tx
      .update(s.digitalRequests)
      .set({ assigneeId, updatedAt: new Date() })
      .where(eq(s.digitalRequests.id, id))
      .returning();
    await notify(tx, assigneeId, "إسناد مهمة رقمية", row.title);
    await record(tx, ctx, { action: "digital.assign", entityType: "digital_request", entityId: id, committeeId: row.committeeId, metadata: { assigneeId } });
    return updated;
  });
}

// --- Forms registry ------------------------------------------------------
export type CreateFormInput = {
  title: string;
  purpose?: string;
  committeeId?: string | null;
  provider?: string;
  url?: string | null;
  eventId?: string | null;
  formType?: "registration" | "survey" | "vote" | "feedback";
  opensOn?: Date | null;
  closesOn?: Date | null;
  status?: "planned" | "active" | "closed" | "archived";
  /** Only set when someone supplies a measured number; never inferred. */
  responseCount?: number | null;
  notes?: string;
};

export async function createForm(ctx: Identity, input: CreateFormInput) {
  const title = input.title.trim();
  if (!title) throw new HttpError(422, "عنوان النموذج مطلوب");
  if (input.url && !/^https?:\/\//i.test(input.url.trim()))
    throw new HttpError(422, "الرابط يجب أن يبدأ بـ http أو https");
  if (input.responseCount !== undefined && input.responseCount !== null && Number(input.responseCount) < 0)
    throw new HttpError(422, "عدد الاستجابات لا يمكن أن يكون سالبًا");
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null }, "digital.forms.manage", async (tx) => {
    const [created] = await tx
      .insert(s.digitalForms)
      .values({
        id: digitalId(),
        title,
        purpose: input.purpose?.trim() ?? "",
        ownerUserId: ctx.user.id,
        committeeId: input.committeeId ?? null,
        provider: input.provider?.trim() ?? "",
        url: input.url?.trim() || null,
        eventId: input.eventId ?? null,
        formType: input.formType ?? "registration",
        opensOn: input.opensOn ?? null,
        closesOn: input.closesOn ?? null,
        status: input.status ?? "active",
        responseCount:
          input.responseCount === undefined || input.responseCount === null
            ? null
            : Math.round(Number(input.responseCount)),
        notes: input.notes?.trim() ?? "",
      })
      .returning();
    await record(tx, ctx, {
      action: "digital.form.create",
      entityType: "digital_form",
      entityId: created.id,
      committeeId: created.committeeId,
      metadata: { formType: created.formType, url: created.url },
    });
    return created;
  });
}

export async function listForms(ctx: Identity, input: { status?: string; eventId?: string; formType?: string } = {}) {
  if (!hasLiveGrant(ctx, "digital.view")) return [];
  const rows = await db.select().from(s.digitalForms).orderBy(sql`${s.digitalForms.createdAt} desc`);
  return rows.filter((r) => {
    if (input.status && r.status !== input.status) return false;
    if (input.eventId && r.eventId !== input.eventId) return false;
    if (input.formType && r.formType !== input.formType) return false;
    return true;
  });
}

/** Response counts are updated only from a recorded measurement. */
export async function recordFormResponses(ctx: Identity, formId: string, count: number) {
  const form = await db.query.digitalForms.findFirst({ where: eq(s.digitalForms.id, formId) });
  if (!form) throw new HttpError(404, "النموذج غير متاح");
  const n = Math.round(Number(count));
  if (!Number.isFinite(n) || n < 0) throw new HttpError(422, "عدد الاستجابات غير صالح");
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null }, "digital.forms.manage", async (tx) => {
    const [updated] = await tx
      .update(s.digitalForms)
      .set({ responseCount: n, updatedAt: new Date() })
      .where(eq(s.digitalForms.id, formId))
      .returning();
    await record(tx, ctx, { action: "digital.form.record_responses", entityType: "digital_form", entityId: formId, committeeId: form.committeeId, metadata: { responseCount: n } });
    return updated;
  });
}

// --- Certificate batches -------------------------------------------------
export type CreateBatchInput = {
  title: string;
  templateRef?: string;
  eventId?: string | null;
  issuedOn: Date;
  participantSource?: string;
  notes?: string;
};

export async function createBatch(ctx: Identity, input: CreateBatchInput) {
  const title = input.title.trim();
  if (!title) throw new HttpError(422, "عنوان الدفعة مطلوب");
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null }, "digital.certificates.manage", async (tx) => {
    const [created] = await tx
      .insert(s.certificateBatches)
      .values({
        id: digitalId(),
        title,
        templateRef: input.templateRef?.trim() ?? "",
        issuerId: ctx.user.id,
        eventId: input.eventId ?? null,
        issuedOn: input.issuedOn,
        participantSource: input.participantSource?.trim() ?? "",
        notes: input.notes?.trim() ?? "",
      })
      .returning();
    await record(tx, ctx, { action: "digital.batch.create", entityType: "certificate_batch", entityId: created.id, metadata: { eventId: created.eventId } });
    return created;
  });
}

export async function listBatches(ctx: Identity, eventId?: string) {
  if (!hasLiveGrant(ctx, "digital.view")) return [];
  const rows = await db.select().from(s.certificateBatches).orderBy(sql`${s.certificateBatches.createdAt} desc`);
  return eventId ? rows.filter((r) => r.eventId === eventId) : rows;
}

/**
 * Sent and failed counts advance only from recorded delivery figures. A batch
 * never reports successful delivery that was not actually recorded.
 */
export async function recordDelivery(
  ctx: Identity,
  batchId: string,
  input: { generated?: number; sent?: number; failures?: number; status?: s.CertificateBatchStatus },
) {
  const batch = await db.query.certificateBatches.findFirst({ where: eq(s.certificateBatches.id, batchId) });
  if (!batch) throw new HttpError(404, "دفعة الشهادات غير متاحة");
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.generated !== undefined) {
    if (Number(input.generated) < 0) throw new HttpError(422, "عدد الصادر غير صالح");
    patch.generatedCount = Math.round(Number(input.generated));
  }
  if (input.sent !== undefined) {
    if (Number(input.sent) < 0) throw new HttpError(422, "عدد المُرسل غير صالح");
    patch.sentCount = Math.round(Number(input.sent));
  }
  if (input.failures !== undefined) {
    if (Number(input.failures) < 0) throw new HttpError(422, "عدد الإخفاقات غير صالح");
    patch.failureCount = Math.round(Number(input.failures));
  }
  if (input.status) patch.status = input.status;
  return writeShared(ctx, { academicTermId: await currentTermId(), committeeId: null }, "digital.certificates.manage", async (tx) => {
    const [updated] = await tx.update(s.certificateBatches).set(patch as any).where(eq(s.certificateBatches.id, batchId)).returning();
    await record(tx, ctx, { action: "digital.batch.record_delivery", entityType: "certificate_batch", entityId: batchId, metadata: patch });
    return updated;
  });
}

export async function digitalSummary(ctx: Identity) {
  const [requests, forms, batches] = await Promise.all([
    listDigitalRequests(ctx).catch(() => []),
    listForms(ctx),
    listBatches(ctx),
  ]);
  const now = new Date();
  return {
    // Every request including completed ones, so a demo review can see the
    // finished work next to the open queue.
    all: requests,
    open: requests.filter((r) => openDigitalStatuses.includes(r.status)),
    waitingInput: requests.filter((r) => r.status === "waiting_input"),
    overdue: requests.filter((r) => r.deadline && r.deadline < now && openDigitalStatuses.includes(r.status)),
    activeForms: forms.filter((f) => f.status === "active"),
    batches,
    pendingBatches: batches.filter((b) => b.status === "draft" || b.status === "generating"),
    byStatus: requests.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
  };
}