import {
  identity,
  foundation,
  committee,
  updateCommittee,
  updateProfile,
  readNotification,
  HttpError,
} from "@/lib/services";
import { permits } from "@/lib/policy";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { z } from "zod";
async function route(req: Request) {
  try {
    const path = new URL(req.url).pathname.split("/").slice(2);
    const write = req.method !== "GET";
    if (
      write &&
      req.headers.get("origin") !==
        new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin
    )
      throw new HttpError(403, "مصدر الطلب غير مسموح");
    if (
      write &&
      (!req.headers.get("content-type")?.includes("application/json") ||
        Number(req.headers.get("content-length") || 0) > 8192)
    )
      throw new HttpError(422, "صيغة الطلب غير صالحة");
    const ctx = await identity(req.headers, path[0] === "profile");
    if (!write && path[0] === "foundation")
      return Response.json(await foundation(ctx));
    if (!write && path[0] === "committees" && path[1])
      return Response.json(await committee(ctx, path[1]));
    if (!write && path[0] === "admin") {
      if (!permits(ctx.grants, "organization.manage"))
        throw new HttpError(403, "ليست لديك صلاحية");
      return Response.json({
        audit: permits(ctx.grants, "audit.read")
          ? await db
              .select({
                id: auditLogs.id,
                action: auditLogs.action,
                createdAt: auditLogs.createdAt,
              })
              .from(auditLogs)
              .orderBy(desc(auditLogs.createdAt))
              .limit(30)
          : [],
      });
    }
    if (write) {
      const raw = await req.text();
      if (raw.length > 8192) throw new HttpError(422, "حجم الطلب كبير");
      const body = JSON.parse(raw || "{}");
      if (req.method === "POST" && path[0] === "profile")
        return Response.json(
          await updateProfile(
            ctx,
            z.object({ name: z.string().trim().min(2).max(80) }).parse(body)
              .name,
          ),
        );
      if (req.method === "PATCH" && path[0] === "committees" && path[1])
        return Response.json(
          await updateCommittee(
            ctx,
            path[1],
            z.object({ description: z.string().trim().max(2000) }).parse(body)
              .description,
          ),
        );
      if (req.method === "POST" && path[0] === "notifications" && path[1])
        return Response.json(await readNotification(ctx, path[1]));
    }
    throw new HttpError(404, "الصفحة غير موجودة");
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
              ? "تحقق من البيانات المدخلة"
              : "تعذر إكمال الطلب. حاول لاحقًا.",
      },
      { status },
    );
  }
}
export const GET = route;
export const POST = route;
export const PATCH = route;
