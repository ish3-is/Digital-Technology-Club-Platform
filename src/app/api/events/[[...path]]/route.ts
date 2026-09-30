import { z } from "zod";
import { identity, HttpError } from "@/lib/services";
import * as engine from "@/lib/events/engine";
import * as query from "@/lib/events/queries";
import { uploadEventFile, downloadEventFile } from "@/lib/events/storage";
export const runtime = "nodejs";
async function bytes(req: Request, max: number) {
  const r = req.body?.getReader();
  let n = 0;
  const parts: Uint8Array[] = [];
  if (r)
    while (true) {
      const x = await r.read();
      if (x.done) break;
      n += x.value.length;
      if (n > max) {
        await r.cancel();
        throw new HttpError(413, "الطلب أكبر من الحد");
      }
      parts.push(x.value);
    }
  return Buffer.concat(parts);
}
async function route(req: Request) {
  try {
    const ctx = await identity(req.headers);
    const url = new URL(req.url),
      path = url.pathname.split("/").slice(3);
    if (req.method === "GET") {
      if (!path[0])
        return Response.json(
          await query.listEvents(
            ctx,
            (url.searchParams.get("q") || "").slice(0, 160),
          ),
        );
      if (path[0] === "options")
        return Response.json(await query.eventOptions(ctx));
      if (path[0] === "files" && path.length === 2) {
        const f = await downloadEventFile(ctx, path[1]);
        return new Response(new Uint8Array(f.content), {
          headers: {
            "Content-Type": f.mime,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
          },
        });
      }
      if (path.length === 1)
        return Response.json(await query.eventDetail(ctx, path[0]));
    } else if (req.method === "POST") {
      if (
        req.headers.get("origin") !==
        new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin
      )
        throw new HttpError(403, "مصدر الطلب غير مسموح");
      if (path[1] === "files" && path.length === 2) {
        const form = await new Response(
          await bytes(req, 5 * 1024 * 1024 + 16384),
          {
            headers: { "Content-Type": req.headers.get("content-type") || "" },
          },
        ).formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new HttpError(422, "اختر ملفًا");
        return Response.json(
          await uploadEventFile(
            ctx,
            path[0],
            file.name,
            file.type,
            Buffer.from(await file.arrayBuffer()),
            String(form.get("category") || ""),
            String(form.get("visibility") || "team"),
          ),
        );
      }
      if (!req.headers.get("content-type")?.includes("application/json"))
        throw new HttpError(422, "صيغة الطلب غير صالحة");
      const data = JSON.parse(
        Buffer.from(await bytes(req, 256000)).toString() || "{}",
      );
      if (!path[0])
        return Response.json(await engine.createEvent(ctx, data), {
          status: 201,
        });
      if (path.length !== 2) throw new HttpError(404, "الإجراء غير موجود");
      const actions: Record<
        string,
        (c: typeof ctx, id: string, d: unknown) => Promise<unknown>
      > = {
        transition: engine.transitionEvent,
        review: engine.reviewEvent,
        requirements: engine.saveRequirement,
        readiness: engine.completeRequirement,
        risks: engine.saveRisk,
        "resolve-risk": engine.resolveRisk,
        team: engine.saveTeam,
        participants: engine.registerParticipants,
        attendance: engine.recordAttendance,
        report: engine.saveReport,
        "submit-report": engine.submitReport,
        edit: engine.updateEvent,
      };
      const action = actions[path[1]];
      if (!action) throw new HttpError(404, "الإجراء غير موجود");
      return Response.json(await action(ctx, path[0], data));
    }
    throw new HttpError(404, "المسار غير موجود");
  } catch (e) {
    const status =
      e instanceof HttpError
        ? e.status
        : e instanceof z.ZodError || e instanceof SyntaxError
          ? 422
          : 500;
    return Response.json(
      {
        message:
          e instanceof HttpError
            ? e.message
            : status === 422
              ? "تحقق من الحقول والتواريخ المدخلة"
              : "تعذر إكمال العملية",
      },
      { status },
    );
  }
}
async function handle(req: Request) {
  const res = await route(req);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
export const GET = handle;
export const POST = handle;
