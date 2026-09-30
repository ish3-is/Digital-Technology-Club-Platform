import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db } from "../db";
import * as schema from "../db/schema";
if (
  !process.env.BETTER_AUTH_SECRET ||
  process.env.BETTER_AUTH_SECRET.length < 32
)
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.CLUB_PROVISION !== "1",
    minPasswordLength: 12,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      if (!process.env.SMTP_URL || !process.env.MAIL_FROM)
        throw new Error("خدمة البريد غير مهيأة");
      await nodemailer.createTransport(process.env.SMTP_URL).sendMail({
        from: process.env.MAIL_FROM,
        to: user.email,
        subject: "استعادة الدخول إلى المقر الرقمي",
        text: `لاستعادة كلمة المرور افتح الرابط التالي خلال ساعة:\n${url}\nإذا لم تطلب ذلك فتجاهل الرسالة.`,
      });
    },
  },
  user: {
    additionalFields: {
      active: { type: "boolean", defaultValue: true, input: false },
      onboarded: { type: "boolean", defaultValue: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (s) => {
          const [u] = await db
            .select()
            .from(schema.user)
            .where(eq(schema.user.id, s.userId));
          if (!u?.active)
            throw new APIError("UNAUTHORIZED", {
              message: "تعذر تسجيل الدخول",
            });
          return { data: s };
        },
        after: async (s) => {
          await db.insert(schema.auditLogs).values({
            id: crypto.randomUUID(),
            actorId: s.userId,
            action: "session.created",
            entityType: "session",
            entityId: s.id,
            sessionId: s.id,
          });
        },
      },
      delete: {
        after: async (s) => {
          await db.insert(schema.auditLogs).values({
            id: crypto.randomUUID(),
            actorId: s.userId,
            action: "session.revoked",
            entityType: "session",
            entityId: s.id,
          });
        },
      },
    },
  },
});
