export {};
/** Asserts the Phase 7.5 surfaces render real content, not empty shells. */
const base = process.env.SMOKE_BASE ?? "http://localhost:3000";
async function session(email: string, password: string) {
  const r = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password }),
  });
  return r.headers.get("set-cookie")?.split(";")[0];
}
const get = async (p: string, cookie: string) => {
  const r = await fetch(`${base}${p}`, { headers: { cookie } });
  return { status: r.status, body: await r.text() };
};

const leader = (await session("demo-leader@club.local", "DemoClub2026!")) ?? "";
const sup = (await session("demo-supervisor@club.local", "DemoClub2026!")) ?? "";
const member = (await session("demo-org-m1@club.local", "DemoClub2026!")) ?? "";

const checks: [string, string, string, string[]][] = [
  ["/supervisor", sup, "ملخص المشرف", ["ملخص المشرف", "الحالة العامة", "جاهزية الفعاليات القادمة", "تقارير تحتاج إجراءك", "روابط"]],
  ["/supervisor", sup, "مشرف: Incredance", ["المالية", "قائمة الإعلام", "الموارد", "الرؤى التشغيلية"]],
  ["/intelligence/executive", leader, "تنفيذي: قمع", ["قمع التأهيل", "طلب الانضمام", "إكمال 30 يومًا", "الاتجاهات التشغيلية"]],
  ["/intelligence/operations", leader, "تشغيل: اتجاه", ["حجم الطلبات عبر الزمن"]],
  ["/intelligence/reports/executive_periodic", leader, "إيداع", ["حفظ كتقرير رسمي"]],
  ["/intelligence/reports/executive_periodic", member, "عضو: لا إيداع", []],
];

let failed = 0;
for (const [path, cookie, label, words] of checks) {
  const { status, body } = await get(path, cookie);
  const missing = words.filter((w) => !body.includes(w));
  const crashed = /TypeError|Cannot read propert|NaN|\[object Object\]/.test(body);
  // The member must NOT see the filing action.
  const leak = path.includes("reports/") && cookie === member && body.includes("حفظ كتقرير رسمي");
  if (status !== 200 || missing.length || crashed || leak) {
    failed++;
    console.log(`FAIL ${label} (${status}${crashed ? " +crash" : ""}${leak ? " +filing leak" : ""}) مفقود: ${missing.join(" | ") || "—"}`);
  } else {
    console.log(`OK ${label}: ${words.length ? words.length + " عناصر" : "لا إيداع للعضو"}`);
  }
}
console.log(failed ? `فشل ${failed}` : "كل أسطح 7.5 تعرض بيانات مشتقة");
process.exit(failed ? 1 : 0);
