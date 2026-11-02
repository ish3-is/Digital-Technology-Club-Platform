import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { HttpError } from "@/lib/services";
import { isMailConfigured, sendTextEmail } from "@/lib/mail";
import {
  accountCommitteeOptions,
  normalizeArabicName,
  rosterNameMatches,
  type AccountCommitteeKey,
} from "./official-roster";

export type AccountRequestInput = {
  fullName: string;
  email: string;
  groupKey: AccountCommitteeKey;
};

function requestFingerprint(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || headers.get("cf-connecting-ip") || "local";
  return createHash("sha256").update(address).digest("hex").slice(0, 32);
}

export async function enforceAccountRequestRateLimit(headers: Headers) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const key = `account-request:${requestFingerprint(headers)}`;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(s.rateLimit)
      .where(eq(s.rateLimit.key, key))
      .for("update");
    if (!row) {
      await tx.insert(s.rateLimit).values({
        id: crypto.randomUUID(),
        key,
        count: 1,
        lastRequest: now,
      });
      return;
    }
    if (now - row.lastRequest >= windowMs) {
      await tx
        .update(s.rateLimit)
        .set({ count: 1, lastRequest: now })
        .where(eq(s.rateLimit.id, row.id));
      return;
    }
    if (row.count >= 5)
      throw new HttpError(429, "محاولات كثيرة. انتظر عشر دقائق ثم حاول مجددًا.");
    await tx
      .update(s.rateLimit)
      .set({ count: row.count + 1, lastRequest: now })
      .where(eq(s.rateLimit.id, row.id));
  });
}

async function notifyAdministrators(input: {
  fullName: string;
  email: string;
  committeeName: string;
  position: string;
}) {
  if (!isMailConfigured()) return;
  const admins = await db
    .selectDistinct({ email: s.user.email })
    .from(s.user)
    .innerJoin(s.assignments, eq(s.assignments.userId, s.user.id))
    .where(
      and(
        eq(s.assignments.roleId, "system_admin"),
        eq(s.assignments.active, true),
        eq(s.user.active, true),
      ),
    );
  await Promise.allSettled(
    admins.map((admin) =>
      sendTextEmail({
        to: admin.email,
        subject: "طلب حساب جديد في المقر الرقمي",
        text: [
          "وصل طلب حساب مطابق لسجل أعضاء النادي:",
          `الاسم: ${input.fullName}`,
          `البريد: ${input.email}`,
          `الجهة: ${input.committeeName}`,
          `الصفة في السجل: ${input.position}`,
          "راجع هوية مقدم الطلب قبل إنشاء الحساب ومنحه الصلاحيات.",
        ].join("\n"),
      }),
    ),
  );
}

export async function submitAccountRequest(input: AccountRequestInput) {
  const option = accountCommitteeOptions.find(
    (candidate) => candidate.id === input.groupKey,
  );
  if (!option) throw new HttpError(422, "اختر لجنة صحيحة");

  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeArabicName(fullName);
  const email = input.email.trim().toLocaleLowerCase("en");
  const roster = await db
    .select({
      id: s.officialClubRoster.id,
      fullName: s.officialClubRoster.fullName,
      aliases: s.officialClubRoster.aliases,
      position: s.officialClubRoster.position,
      claimedUserId: s.officialClubRoster.claimedUserId,
    })
    .from(s.officialClubRoster)
    .where(
      and(
        eq(s.officialClubRoster.groupKey, input.groupKey),
        eq(s.officialClubRoster.active, true),
      ),
    );
  const member = roster.find((entry) => rosterNameMatches(entry, fullName));
  if (!member)
    throw new HttpError(
      422,
      "اسمك غير موجود ضمن هذه اللجنة. تأكد من كتابة الاسم كما هو في سجل الأعضاء واختيار لجنتك الصحيحة.",
    );
  if (member.claimedUserId)
    throw new HttpError(
      409,
      "هذا العضو مرتبط بحساب بالفعل. استخدم تسجيل الدخول أو استعادة كلمة المرور.",
    );

  const [existingAccount] = await db
    .select({ id: s.user.id })
    .from(s.user)
    .where(sql`lower(${s.user.email}) = ${email}`);
  if (existingAccount)
    throw new HttpError(
      409,
      "هذا البريد مرتبط بحساب بالفعل. استخدم تسجيل الدخول أو استعادة كلمة المرور.",
    );
  const [pending] = await db
    .select({ id: s.accountAccessRequests.id })
    .from(s.accountAccessRequests)
    .where(
      and(
        eq(s.accountAccessRequests.email, email),
        eq(s.accountAccessRequests.status, "pending"),
      ),
    );
  if (pending)
    return {
      accepted: true,
      message: "طلبك مسجل بالفعل وينتظر مراجعة الإدارة.",
    };

  try {
    await db.insert(s.accountAccessRequests).values({
      rosterId: member.id,
      fullName,
      normalizedName,
      email,
      groupKey: input.groupKey,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      return {
        accepted: true,
        message: "طلبك مسجل بالفعل وينتظر مراجعة الإدارة.",
      };
    throw error;
  }

  await notifyAdministrators({
    fullName: member.fullName,
    email,
    committeeName: option.name,
    position: member.position,
  });
  return {
    accepted: true,
    message:
      "تمت مطابقة اسمك وتسجيل الطلب. ستراجع الإدارة هويتك ثم ترسل لك بيانات الدخول.",
  };
}
