import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError, type Identity } from "@/lib/services";
import { getWork } from "@/lib/work/access";
import {
  currentTermId,
  notify,
  peopleId,
  record,
  requiredText,
  text,
  visibleMemberIds,
  write,
  writeSelf,
} from "./helpers";
import { grantContribution } from "./contribution.service";

export async function listHours(
  ctx: Identity,
  filters: { memberId?: string; status?: s.VolunteerHourStatus } = {},
) {
  const visible = await visibleMemberIds(ctx);
  if (!visible.all && !visible.ids.length) return [];
  const own = filters.memberId ?? (ctx.grants.some((g) => g.permission === "volunteer_hours.view" && g.scope === "club") ? undefined : ctx.user.id);
  const rows = await db
    .select({
      id: s.volunteerHourEntries.id,
      memberId: s.volunteerHourEntries.memberId,
      name: s.user.name,
      sourceType: s.volunteerHourEntries.sourceType,
      sourceId: s.volunteerHourEntries.sourceId,
      activityTitle: s.volunteerHourEntries.activityTitle,
      date: s.volunteerHourEntries.date,
      hours: s.volunteerHourEntries.hours,
      notes: s.volunteerHourEntries.notes,
      status: s.volunteerHourEntries.status,
      submittedBy: s.volunteerHourEntries.submittedBy,
      approverId: s.volunteerHourEntries.approverId,
      decisionNotes: s.volunteerHourEntries.decisionNotes,
      decidedAt: s.volunteerHourEntries.decidedAt,
      createdAt: s.volunteerHourEntries.createdAt,
    })
    .from(s.volunteerHourEntries)
    .innerJoin(s.user, eq(s.user.id, s.volunteerHourEntries.memberId))
    .where(
      and(
        visible.all ? undefined : sql`${s.volunteerHourEntries.memberId} IN (${sql.join(visible.ids.map((id) => sql`${id}`), sql`, `)})`,
        own ? eq(s.volunteerHourEntries.memberId, own) : undefined,
        filters.status ? eq(s.volunteerHourEntries.status, filters.status) : undefined,
      ),
    )
    .orderBy(desc(s.volunteerHourEntries.date));
  return rows;
}

export async function submitHours(
  ctx: Identity,
  input: {
    memberId: string;
    sourceType: "event" | "meeting" | "workshop" | "committee_work" | "external";
    sourceId?: string | null;
    activityTitle: string;
    date: Date;
    hours: number;
    notes?: string;
    evidenceId?: string | null;
    academicTermId?: string;
  },
) {
  const academicTermId = input.academicTermId ?? (await currentTermId());
  const title = requiredText(input.activityTitle, 3, 200, "عنوان النشاط");
  if (!Number.isInteger(input.hours) || input.hours <= 0 || input.hours > 24)
    throw new HttpError(422, "الساعات عدد صحيح بين ١ و٢٤");
  if (input.date > new Date()) throw new HttpError(422, "لا تُسجَّل ساعات مستقبلية");
  // A linked work source must be a real record the member can actually read.
  if (input.sourceId) {
    if (input.sourceType === "event" || input.sourceType === "meeting" || input.sourceType === "workshop")
      await getWork(ctx, input.sourceId);
  }
  const self = input.memberId === ctx.user.id;
  return writeSelf(ctx, { academicTermId, committeeId: null }, async (tx) => {
    if (input.evidenceId) {
      const [evidence] = await tx
        .select({ id: s.evidence.id })
        .from(s.evidence)
        .where(eq(s.evidence.id, input.evidenceId));
      if (!evidence) throw new HttpError(422, "الدليل المرفق غير متاح");
    }
    const [row] = await tx
      .insert(s.volunteerHourEntries)
      .values({
        id: peopleId(),
        memberId: input.memberId,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        activityTitle: title,
        date: input.date,
        hours: input.hours,
        notes: text(input.notes ?? "", 2000, "الملاحظات"),
        evidenceId: input.evidenceId ?? null,
        submittedBy: ctx.user.id,
      })
      .returning();
    await record(tx, ctx, {
      action: "volunteer.submitted",
      entityType: "volunteer_hours",
      entityId: row.id,
      memberId: input.memberId,
      metadata: { hours: input.hours, sourceType: input.sourceType },
    });
    return row;
  });
}

/**
 * Approval is deliberately separate from submission and cannot be done by the
 * person whose hours they are, nor by whoever submitted them.
 */
export async function decideHours(
  ctx: Identity,
  id: string,
  decision: "approved" | "rejected",
  reason: string,
) {
  const academicTermId = await currentTermId();
  const clean = requiredText(reason, 3, 1000, "ملاحظة القرار");
  return write(ctx, { academicTermId, committeeId: null }, "volunteer_hours.approve", async (tx) => {
    const [before] = await tx
      .select()
      .from(s.volunteerHourEntries)
      .where(eq(s.volunteerHourEntries.id, id))
      .for("update");
    if (!before) throw new HttpError(404, "السجل غير متاح");
    if (before.status !== "pending")
      throw new HttpError(409, "اتُّخذ قرار على هذا السجل بالفعل");
    if (before.memberId === ctx.user.id)
      throw new HttpError(403, "لا يمكن اعتماد ساعاك أنت؛ الاعتماد يحتاج شخصًا مستقلًا");
    if (before.submittedBy === ctx.user.id)
      throw new HttpError(403, "لا يمكن اعتماد سجل قدّمته بنفسك");
    const [row] = await tx
      .update(s.volunteerHourEntries)
      .set({
        status: decision,
        approverId: ctx.user.id,
        decisionNotes: clean,
        decidedAt: new Date(),
      })
      .where(eq(s.volunteerHourEntries.id, id))
      .returning();
    await record(tx, ctx, {
      action: `volunteer.${decision}`,
      entityType: "volunteer_hours",
      entityId: id,
      memberId: before.memberId,
      metadata: { from: "pending", to: decision, hours: before.hours, reason: clean },
    });
    if (decision === "approved") {
      const contribution = await grantContribution(
        tx,
        ctx,
        before.memberId,
        "volunteer_hours",
        id,
        `ساعات تطوعية معتمدة: ${before.hours} ساعة في ${before.activityTitle}`,
        before.hours,
      );
      const { evaluateBadges } = await import("./contribution.service");
      await evaluateBadges(tx, ctx, before.memberId);
      await notify(
        tx,
        before.memberId,
        "اعتماد ساعات تطوعية",
        `اعتُمدت ${before.hours} ساعة في ${before.activityTitle}.`,
      );
      return { row, contribution };
    }
    await notify(
      tx,
      before.memberId,
      "ساعات تطوعية غير معتمدة",
      `لم تُعتمد ساعات ${before.activityTitle}. الملاحظة: ${clean}`,
    );
    return { row, contribution: null };
  });
}
