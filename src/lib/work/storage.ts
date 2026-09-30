import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import * as s from "../../db/schema";
import { HttpError, type Identity } from "../services";
import { getWork, type Connection } from "./access";
import { mutate, emit } from "./engine";
// Local relational provider is transaction-safe and private. A future object-store
// adapter can implement these operations without changing authorization at the boundary.
export interface StorageProvider {
  put(tx: Connection, key: string, bytes: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
}
export const storage: StorageProvider = {
  async put(tx, key, content) {
    await tx.insert(s.fileContents).values({ fileId: key, content });
  },
  async read(key) {
    const [row] = await db
      .select()
      .from(s.fileContents)
      .where(eq(s.fileContents.fileId, key));
    if (!row) throw new HttpError(404, "الملف غير متاح");
    return Buffer.from(row.content);
  },
};
export function validateFile(name: string, mime: string, bytes: Buffer) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new HttpError(422, "حجم الملف يجب أن يكون بين بايت واحد و٥ ميغابايت");
  const extension = name.toLowerCase().split(".").pop();
  const png =
    mime === "image/png" &&
    extension === "png" &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    mime === "image/jpeg" &&
    ["jpg", "jpeg"].includes(extension || "") &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  let text = false;
  if (mime === "text/plain" && extension === "txt") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      text = !bytes.includes(0);
    } catch {}
  }
  if (!png && !jpeg && !text)
    throw new HttpError(422, "المسموح: صور PNG وJPEG وملفات نصية UTF-8 فقط");
  return name.replace(/[\x00-\x1f\\/]/g, "_").slice(0, 150);
}
export async function upload(
  ctx: Identity,
  workId: string,
  name: string,
  mime: string,
  bytes: Buffer,
) {
  await getWork(ctx, workId);
  const safeName = validateFile(name, mime, bytes);
  return mutate(ctx, workId, async (tx, w) => {
    if (["completed", "cancelled", "rejected", "revoked"].includes(w.status))
      throw new HttpError(409, "إضافة المرفقات مغلقة لهذا العنصر");
    const existing = await tx
      .select({ id: s.attachments.id })
      .from(s.attachments)
      .where(eq(s.attachments.workId, w.id));
    if (existing.length >= 20)
      throw new HttpError(422, "الحد الأقصى ٢٠ مرفقًا للعنصر");
    const fileId = crypto.randomUUID(),
      attachmentId = crypto.randomUUID();
    await tx.insert(s.files).values({
      id: fileId,
      name: safeName,
      mime,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      uploadedBy: ctx.user.id,
    });
    await storage.put(tx, fileId, bytes);
    await tx
      .insert(s.attachments)
      .values({ id: attachmentId, workId: w.id, fileId });
    await emit(tx, ctx, w, "attachment.added", "أضاف مرفقًا محميًا", null, {
      fileId,
      name: safeName,
    });
    return { id: attachmentId };
  });
}
export async function download(ctx: Identity, attachmentId: string) {
  const [row] = await db
    .select({ workId: s.attachments.workId, file: s.files })
    .from(s.attachments)
    .innerJoin(s.files, eq(s.files.id, s.attachments.fileId))
    .where(eq(s.attachments.id, attachmentId));
  if (!row) throw new HttpError(404, "الملف غير متاح");
  await getWork(ctx, row.workId);
  return { ...row.file, content: await storage.read(row.file.id) };
}
