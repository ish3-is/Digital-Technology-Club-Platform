import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  const path = new URL(request.url).pathname;
  const supported = [
    "sign-in/email",
    "sign-out",
    "request-password-reset",
    "reset-password",
    "revoke-session",
    "revoke-sessions",
    "revoke-other-sessions",
  ];
  if (!supported.some((p) => path === `/api/auth/${p}`))
    return Response.json(
      { message: "هذا الإجراء غير متاح عبر هذه المساحة" },
      { status: 403 },
    );
  if (path.endsWith("/request-password-reset") && !process.env.SMTP_URL)
    return Response.json(
      { message: "خدمة استعادة كلمة المرور غير مهيأة. تواصل مع إدارة النادي." },
      { status: 503 },
    );
  return handlers.POST(request);
}
