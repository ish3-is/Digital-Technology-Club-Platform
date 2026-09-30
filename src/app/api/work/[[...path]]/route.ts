import { z } from "zod";
import { identity, HttpError } from "@/lib/services";
import * as engine from "@/lib/work/engine";
import * as queries from "@/lib/work/queries";
import { upload, download } from "@/lib/work/storage";
import { kinds } from "@/lib/work/model";
export const runtime = "nodejs";
async function body(req: Request, max: number) {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "الطلب أكبر من الحد المسموح");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function route(req: Request) {
  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").slice(3);
    const ctx = await identity(req.headers);
    if (req.method === "GET") {
      if (!path[0])
        return Response.json(
          await queries.listWork(
            ctx,
            url.searchParams.has("kind")
              ? z.enum(kinds).parse(url.searchParams.get("kind"))
              : undefined,
          ),
        );
      if (path[0] === "options")
        return Response.json(await queries.workOptions(ctx));
      if (path[0] === "inbox") return Response.json(await queries.inbox(ctx));
      if (path[0] === "search")
        return Response.json(
          await queries.search(
            ctx,
            (url.searchParams.get("q") || "").slice(0, 160),
          ),
        );
      if (path[0] === "files" && path.length === 2) {
        const file = await download(ctx, path[1]);
        return new Response(new Uint8Array(file.content), {
          headers: {
            "Content-Type": file.mime,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
          },
        });
      }
      if (path.length === 1)
        return Response.json(await queries.detail(ctx, path[0]));
    } else if (req.method === "POST") {
      if (
        req.headers.get("origin") !==
        new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin
      )
        throw new HttpError(403, "مصدر الطلب غير مسموح");
      if (path[1] === "attachments" && path.length === 2) {
        const bytes = await body(req, 5 * 1024 * 1024 + 16384);
        const form = await new Response(bytes, {
          headers: { "Content-Type": req.headers.get("content-type") || "" },
        }).formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new HttpError(422, "اختر ملفًا");
        return Response.json(
          await upload(
            ctx,
            path[0],
            file.name,
            file.type,
            Buffer.from(await file.arrayBuffer()),
          ),
        );
      }
      if (!req.headers.get("content-type")?.includes("application/json"))
        throw new HttpError(422, "صيغة الطلب غير صالحة");
      const input = JSON.parse(
        Buffer.from(await body(req, 32768)).toString() || "{}",
      );
      if (!path[0])
        return Response.json(await engine.createWork(ctx, input), {
          status: 201,
        });
      const id = path[0];
      if (path.length !== 2) throw new HttpError(404, "الإجراء غير موجود");
      let result: unknown;
      if (path[1] === "transition") {
        const data = z
          .object({ to: z.string(), version: z.number().int().positive() })
          .strict()
          .parse(input);
        result = await engine.transition(ctx, id, data.to, data.version);
      } else if (path[1] === "review") {
        const data = z
          .object({
            decision: z.enum(["approved", "rejected", "changes_requested"]),
            comment: z.string().max(2000).default(""),
            version: z.number().int().positive(),
            overrideReason: z.string().trim().min(5).max(1000).optional(),
          })
          .strict()
          .parse(input);
        result = await engine.review(
          ctx,
          id,
          data.decision,
          data.comment,
          data.version,
          data.overrideReason,
        );
      } else if (path[1] === "dependencies") {
        const data = z
          .object({ blockerId: z.string(), remove: z.boolean().default(false) })
          .strict()
          .parse(input);
        result = await engine.dependency(ctx, id, data.blockerId, data.remove);
      } else if (path[1] === "assign") {
        const data = z
          .object({
            userId: z.string(),
            role: z.enum([
              "responsible",
              "participant",
              "reviewer",
              "attendee",
            ]),
          })
          .strict()
          .parse(input);
        result = await engine.assign(ctx, id, data.userId, data.role);
      } else if (path[1] === "comments") {
        const data = z
          .object({
            body: z.string().trim().min(1).max(4000),
            mentions: z.array(z.string()).max(20).default([]),
          })
          .strict()
          .parse(input);
        result = await engine.addComment(ctx, id, data.body, data.mentions);
      } else if (path[1] === "acknowledge")
        result = await engine.acknowledge(ctx, id);
      else if (path[1] === "respond") {
        const data = z
          .object({ response: z.enum(["accepted", "declined"]) })
          .strict()
          .parse(input);
        result = await engine.respondInvitation(ctx, id, data.response);
      } else if (path[1] === "edit") {
        const data = z
          .object({
            title: z.string().trim().min(2).max(160).optional(),
            description: z.string().max(6000).optional(),
            progress: z.number().int().min(0).max(99).optional(),
            notes: z.string().max(10000).optional(),
            version: z.number().int().positive(),
          })
          .strict()
          .parse(input);
        result = await engine.updateDetails(ctx, id, data);
      } else throw new HttpError(404, "الإجراء غير موجود");
      return Response.json(result);
    }
    throw new HttpError(404, "العنصر غير متاح");
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 422
          : 500;
    return Response.json(
      {
        message:
          error instanceof HttpError
            ? error.message
            : status === 422
              ? "تحقق من الحقول والتواريخ المدخلة"
              : "تعذر إكمال العملية. حاول مجددًا.",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
async function handle(req: Request) {
  const response = await route(req);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = handle;
export const POST = handle;
