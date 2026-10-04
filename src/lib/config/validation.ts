/**
 * Production configuration validation.
 *
 * Runs at server start (Next.js `instrumentation.register`) so a misconfigured
 * deployment fails immediately and visibly, rather than booting "healthy" and
 * only failing on the first request that touches the database.
 *
 * This module never prints a secret or a connection string — only the variable
 * name and whether it is present.
 */

const REQUIRED_PRODUCTION: { key: string; why: string }[] = [
  {
    key: "DATABASE_URL",
    why: "قاعدة بيانات الإنتاج. بدونها لا يمكن تشغيل التطبيق في وضع الإنتاج.",
  },
  {
    key: "BETTER_AUTH_SECRET",
    why: "مفتاح توقيع الجلسات. بدونه لا يمكن التحقق من هوية المستخدم.",
  },
  {
    key: "BETTER_AUTH_URL",
    why: "العنوان العام للتطبيق. يُستخدم في روابط الاستعادة والتحقق.",
  },
];

const SECRET_KEYS = new Set([
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
  "SMTP_URL",
  "CLUB_INITIAL_PASSWORD",
]);

export type ConfigReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Variable names only — values are never returned. */
  present: string[];
};

/**
 * Validates the environment for the current mode.
 *
 * In development the checks are advisory, because the project is designed to
 * run on PGlite without any setup. In production every required variable must
 * be present and usable.
 */
export function validateConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): ConfigReport {
  const production = env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];
  const present: string[] = [];

  for (const { key, why } of REQUIRED_PRODUCTION) {
    const value = env[key];
    if (value && value.trim()) {
      present.push(key);
      continue;
    }
    if (production) errors.push(`${key}: ${why}`);
    else warnings.push(`${key}: غير مضبوط (مطلوب في الإنتاج فقط)`);
  }

  if (production) {
    const secret = env.BETTER_AUTH_SECRET;
    if (secret && secret.length < 32)
      errors.push("BETTER_AUTH_SECRET: يجب أن يكون ٣٢ حرفًا على الأقل.");

    // A placeholder copied from the example file must never reach production.
    if (secret && /replace-with|changeme|your-secret/i.test(secret))
      errors.push("BETTER_AUTH_SECRET: القيمة ما زالت القيمة التوضيحية.");

    const url = env.BETTER_AUTH_URL;
    if (url && !/^https:\/\//i.test(url))
      errors.push(
        "BETTER_AUTH_URL: يجب أن يبدأ بـ https في الإنتاج لتكون الجلسات والرابط آمنة.",
      );

    // PGlite must not be the production store: it is a single-file database
    // with no concurrency guarantees across instances.
    if (!env.DATABASE_URL && env.PGLITE_DIR)
      errors.push("PGLITE_DIR: لا يُستخدم مع الإنتاج؛ اضبط DATABASE_URL بدلًا منه.");

    // Self-sign-up and demo seeding must be closed in production.
    if (env.CLUB_PROVISION === "1")
      errors.push(
        "CLUB_PROVISION: فتح إنشاء الحسابات في الإنتاج غير مسموح؛ أنشئ الحسابات مرة واحدة ثم أغلقه.",
      );
    if (env.DEMO_ALLOW_PRODUCTION === "1")
      errors.push(
        "DEMO_ALLOW_PRODUCTION: تعبئة بيانات تجريبية في الإنتاج ممنوعة.",
      );
    if (env.CLUB_E2E === "1")
      errors.push("CLUB_E2E: وضع الاختبار لا يعمل في الإنتاج.");

    if (!env.SMTP_URL || !env.MAIL_FROM)
      warnings.push(
        "SMTP_URL/MAIL_FROM: غير مضبوطة — استعادة كلمة المرور ستتعطل، أما بقية التطبيق فسيعمل.",
      );
  }

  return { ok: errors.length === 0, errors, warnings, present };
}

/** Prints the report without exposing any secret value. */
export function reportConfiguration(report: ConfigReport, log = console) {
  if (report.present.length)
    log.log(`[إعداد الإنتاج] متوفر: ${report.present.join("، ")}`);
  for (const warning of report.warnings) log.warn(`[إعداد الإنتاج] تنبيه: ${warning}`);
  for (const error of report.errors) log.error(`[إعداد الإنتاج] خطأ: ${error}`);
  if (!report.ok)
    log.error(
      "[إعداد الإنتاج] الإعداد غير مكتمل. لن يعمل التطبيق في وضع الإنتاج حتى تُحل الأخطاء أعلاه.",
    );
  return report;
}

export const __testing = { SECRET_KEYS };