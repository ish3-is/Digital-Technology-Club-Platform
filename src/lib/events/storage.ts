import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import * as s from "../../db/schema";
import { HttpError, type Identity } from "../services";
import { storage, validateFile } from "../work/storage";
import { emit } from "../work/engine";
import { getEvent, requireEvent } from "./access";
import { mutateEvent } from "./engine";
export async function uploadEventFile(
  ctx: Identity,
  id: string,
  name: string,
  mime: string,
  bytes: Buffer,
  category: string,
  visibility: string,
) {
  const safe = validateFile(name, mime, bytes);
  if (
    !["team", "participants", "budget"].includes(visibility) ||
    category.length < 2 ||
    category.length > 80
  )
    throw new HttpError(422, "تصنيف الملف غير صالح");
  return mutateEvent(ctx, id, async (tx, e) => {
    await requireEvent(ctx, e, "event.manage_files", tx);
    const [report] = await tx
      .select()
      .from(s.eventReports)
      .where(eq(s.eventReports.eventId, e.id));
    if (report && ["pending", "approved"].includes(report.status))
      throw new HttpError(409, "الأدلة مقفلة مع التقرير المقدم أو المعتمد");
    if (visibility === "participants")
      await requireEvent(ctx, e, "event.manage_participants", tx);
    if (visibility === "budget")
      await requireEvent(ctx, e, "event.view_budget", tx);
    if (
      (category === "القوائم" && visibility !== "participants") ||
      (category === "الفواتير" && visibility !== "budget")
    )
      throw new HttpError(
        422,
        "ملفات القوائم والفواتير تحتاج التصنيف المحمي الموافق",
      );
    const existing = await tx
      .select()
      .from(s.eventFiles)
      .where(eq(s.eventFiles.eventId, id));
    if (existing.length >= 100)
      throw new HttpError(422, "الحد ١٠٠ ملف للفعالية");
    const fileId = crypto.randomUUID(),
      attachmentId = crypto.randomUUID();
    await tx.insert(s.files).values({
      id: fileId,
      name: safe,
      mime,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      uploadedBy: ctx.user.id,
      classification: visibility,
    });
    await storage.put(tx, fileId, bytes);
    await tx
      .insert(s.eventFiles)
      .values({ id: attachmentId, eventId: id, fileId, category, visibility });
    await emit(
      tx,
      ctx,
      e,
      "event.file_added",
      "أضاف ملفًا إلى الفعالية",
      null,
      { fileId, category, visibility },
    );
    return { id: attachmentId };
  });
}
export async function downloadEventFile(ctx: Identity, id: string) {
  const [f] = await db
    .select({
      eventId: s.eventFiles.eventId,
      visibility: s.eventFiles.visibility,
      file: s.files,
    })
    .from(s.eventFiles)
    .innerJoin(s.files, eq(s.files.id, s.eventFiles.fileId))
    .where(eq(s.eventFiles.id, id));
  if (!f) throw new HttpError(404, "الملف غير متاح");
  const e = await getEvent(ctx, f.eventId);
  if (f.visibility === "participants")
    await requireEvent(ctx, e, "event.manage_participants");
  if (f.visibility === "budget")
    await requireEvent(ctx, e, "event.view_budget");
  return { ...f.file, content: await storage.read(f.file.id) };
}
