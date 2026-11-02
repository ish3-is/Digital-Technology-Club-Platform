import { z } from "zod";
import { HttpError } from "@/lib/services";
import {
  accountCommitteeOptions,
  type AccountCommitteeKey,
} from "@/lib/account-requests/official-roster";
import {
  enforceAccountRequestRateLimit,
  submitAccountRequest,
} from "@/lib/account-requests/service";

export const runtime = "nodejs";

const input = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.email().max(200),
    groupKey: z.enum(
      accountCommitteeOptions.map((option) => option.id) as [
        AccountCommitteeKey,
        ...AccountCommitteeKey[],
      ],
    ),
  })
  .strict();

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return response({
    committees: accountCommitteeOptions.map(({ id, name }) => ({ id, name })),
  });
}

export async function POST(request: Request) {
  try {
    const expectedOrigin = new URL(
      process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    ).origin;
    if (request.headers.get("origin") !== expectedOrigin)
      throw new HttpError(403, "مصدر الطلب غير مسموح");
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new HttpError(422, "تحقق من الحقول المدخلة");
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > 16_384) throw new HttpError(413, "حجم الطلب أكبر من الحد");
    await enforceAccountRequestRateLimit(request.headers);
    const parsed = input.parse(await request.json());
    return response(await submitAccountRequest(parsed), 201);
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 422
          : 500;
    if (status === 500) console.error("account request failed", error);
    return response(
      {
        error:
          error instanceof HttpError
            ? error.message
            : status === 422
              ? "تحقق من الاسم والبريد واللجنة"
              : "تعذر تسجيل الطلب الآن. حاول لاحقًا.",
      },
      status,
    );
  }
}
