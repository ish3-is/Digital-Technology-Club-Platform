export {};
/**
 * Confirms the demo Operations records reach the rendered pages rather than
 * stopping at the database. Signs in over HTTP and checks that the demo titles
 * appear in the server-rendered HTML. Read-only.
 */
const base = process.env.SMOKE_BASE ?? "http://localhost:3000";
const email = process.env.SMOKE_EMAIL!;
const password = process.env.SMOKE_PASSWORD!;

const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email, password }),
});
const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
if (!cookie) {
  console.log("FAILED: sign-in");
  process.exit(1);
}

/** [label, path, texts that must all be present] */
const checks: [string, string, string[]][] = [
  [
    "المالية",
    "/operations/finance",
    [
      "الميزانية التشغيلية التجريبية",
      "ميزانية دورة UI/UX التجريبية",
      "ضيافة دورة UI/UX",
      "مستلزمات فعالية البرمجة التنافسية",
      "طباعة مواد معسكر الروبوتات",
      "١٬١٥٠",
      "٣٬٨٥٠",
    ],
  ],
  [
    "الإعلام",
    "/operations/media",
    [
      "تصميم بوستر دورة UI/UX",
      "تغطية إعلامية لدورة البرمجة للجميع",
      "تصوير وتوثيق معسكر الروبوتات",
    ],
  ],
  [
    "الرقمية",
    "/operations/digital",
    [
      "إنشاء نموذج تسجيل لدورة UI/UX",
      "إعداد استبيان تقييم دورة البيانات",
      "إصدار شهادات إلكترونية لفعالية البرمجة التنافسية",
      "نموذج تسجيل دورة UI/UX (تجريبي)",
    ],
  ],
  [
    "الموارد",
    "/operations/resources",
    [
      "كاميرا تصوير (تجريبية)",
      "حامل ثلاثي",
      "ميكروفون لاسلكي",
      "DEMO-CAM-001",
    ],
  ],
  ["الرئيسية", "/operations", ["عمليات", "ما يحتاج انتباهك اليوم"]],
];

let failed = 0;
for (const [label, path, texts] of checks) {
  const res = await fetch(`${base}${path}`, { headers: { cookie } });
  const body = await res.text();
  const missing = texts.filter((t) => !body.includes(t));
  if (res.status !== 200 || missing.length) {
    failed++;
    console.log(`FAIL ${label} (${res.status}) — مفقود: ${missing.join(" | ") || "لا شيء"}`);
  } else {
    console.log(`OK ${label}: ${texts.length} عناصر تجريبية ظاهرة`);
  }
}
console.log(failed ? `فشل ${failed}` : "كل بيانات العرض التجريبية ظاهرة في الواجهة");
process.exit(failed ? 1 : 0);