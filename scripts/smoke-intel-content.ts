export {};
/** Asserts the intelligence pages render real derived values, not empty shells. */
const base = process.env.SMOKE_BASE ?? "http://localhost:3000";
const PW = process.env.SMOKE_PASSWORD!;
const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: PW }),
});
const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
if (!cookie) {
  console.log("SMOKE_FAILED: sign-in");
  process.exit(1);
}
const get = async (p: string) => {
  const r = await fetch(`${base}${p}`, { headers: { cookie } });
  return { status: r.status, body: await r.text() };
};

const checks: [string, string, string[]][] = [
  ["/intelligence/executive", "التنفيذية", ["نبض النادي", "التنفيذ", "الأشخاص والمشاركة", "الرؤى التشغيلية", "إشارات السعة"]],
  ["/intelligence/events", "الفعاليات", ["جاهزية الفعاليات", "دورة UI/UX"]],
  ["/intelligence/committees", "اللجان", ["اللجنة الرقمية", "اللجنة الإعلامية"]],
  ["/intelligence/operations", "العمليات", ["المالية", "الإعلام", "الموارد"]],
  ["/intelligence/reports", "التقارير", ["التقرير التنفيذي الدوري", "التقرير المالي التشغيلي"]],
  ["/intelligence/reports/executive_periodic?print=1", "طباعة", ["إسناد المؤشرات", "وقت التوليد", "الفترة"]],
];
let failed = 0;
for (const [path, label, words] of checks) {
  const { status, body } = await get(path);
  const missing = words.filter((w) => !body.includes(w));
  const crashed = /TypeError|Cannot read propert|NaN/.test(body);
  if (status !== 200 || missing.length || crashed) {
    failed++;
    console.log(`FAIL ${label} (${status}${crashed ? " +crash/NaN" : ""}) مفقود: ${missing.join(" | ") || "—"}`);
  } else {
    console.log(`OK ${label}: ${words.length} عناصر ظاهرة`);
  }
}
// The CSV export must be produced under the same scope.
const csv = await fetch(`${base}/api/intelligence/report/executive_periodic?range=term&format=csv`, {
  headers: { cookie },
});
const bytes = new Uint8Array(await csv.arrayBuffer());
const text = new TextDecoder("utf-8").decode(bytes);
// A BOM keeps the Arabic readable when the file opens in a spreadsheet.
const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
const okCsv = csv.status === 200 && text.includes("الإسناد") && hasBom;
console.log(okCsv ? "OK تصدير CSV (مع BOM ومصدر الإسناد)" : `FAIL تصدير CSV (${csv.status})`);
if (!okCsv) failed++;
console.log(failed ? `فشل ${failed}` : "كل صفحات الاستخبارات تعرض بيانات مشتقة");
process.exit(failed ? 1 : 0);
