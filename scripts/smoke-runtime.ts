export {};
/**
 * Runtime smoke check for the portal routes.
 *
 * Renders each route for a real signed-in session against the database .env
 * points at, and reports the HTTP status plus whether any TypeError reached the
 * output. It only reads: nothing is written.
 *
 * Usage:
 *   SMOKE_EMAIL=... SMOKE_PASSWORD=... npm run smoke:runtime
 */
const paths = [
  // Phase 7: intelligence
  "/intelligence",
  "/intelligence/executive",
  "/intelligence/committees",
  "/intelligence/events",
  "/intelligence/operations",
  "/intelligence/reports",
  // Phase 7.5: supervisor brief
  "/supervisor",
  // Phase 6: operations
  "/operations",
  "/operations/finance",
  "/operations/media",
  "/operations/digital",
  "/operations/resources",
  "/events",
  "/work",
  "/people",
  "/governance",
];

const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
const base = process.env.SMOKE_BASE ?? "http://localhost:3000";

if (!email || !password) {
  console.log("SMOKE_SKIPPED: SMOKE_EMAIL / SMOKE_PASSWORD غير مضبوطة");
  process.exit(0);
}

// Sign in over HTTP so the session cookie is captured exactly as the browser
// would receive it.
const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email, password }),
});
const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
if (!signIn.ok || !cookie) {
  console.log(`SMOKE_FAILED: تعذر تسجيل الدخول (${signIn.status})`);
  process.exit(1);
}

// The dev server owns the PGlite file, so this script must not open the
// database itself — two processes on one PGlite directory corrupts it. The
// session is validated over HTTP instead.
const me = await fetch(`${base}/api/operations/home`, { headers: { cookie } });
if (!me.ok) {
  console.log(`SMOKE_FAILED: جلسة غير صالحة (${me.status})`);
  process.exit(1);
}
const home = (await me.json()) as {
  finance: { available: boolean };
  media: { available: boolean };
  digital: { available: boolean };
  resources: { available: boolean };
};
const yes = (v: boolean) => (v ? "متاحة" : "غير متاحة");
console.log(
  `قراءة مساحة العمليات عبر HTTP: مالية ${yes(home.finance.available)} · إعلام ${yes(home.media.available)} · رقمية ${yes(home.digital.available)} · موارد ${yes(home.resources.available)}`,
);

let failed = 0;
for (const path of paths) {
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { cookie },
    });
    const body = await res.text();
    const crashed = /TypeError|Cannot read propert/.test(body);
    if (res.status !== 200 || crashed) {
      failed++;
      console.log(`FAIL ${res.status}${crashed ? " +TypeError" : ""} ${path}`);
    } else {
      console.log(`OK 200 ${path}`);
    }
  } catch (e) {
    failed++;
    console.log(`FAIL ${path}: ${(e as Error).message}`);
  }
}
console.log(failed ? `فشل ${failed} مسار` : "كل المسارات سليمة");
process.exit(failed ? 1 : 0);