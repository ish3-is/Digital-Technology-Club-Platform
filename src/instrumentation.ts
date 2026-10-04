/**
 * Next.js instrumentation hook.
 *
 * Runs once when the server starts. In production the configuration is
 * validated here, so a deployment with a missing `DATABASE_URL` fails at boot
 * with a readable message instead of appearing healthy and failing later on
 * the first request that touches the database.
 */
export async function register() {
  // The build worker imports the module graph without serving traffic; a
  // configuration check there would fail every build in CI.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { reportConfiguration, validateConfiguration } = await import(
    "@/lib/config/validation"
  );
  const report = validateConfiguration();

  // In production a bad configuration is fatal: better to refuse to start.
  if (!report.ok && process.env.NODE_ENV === "production") {
    reportConfiguration(report);
    throw new Error(
      "Production configuration is incomplete. See the errors above.",
    );
  }
  reportConfiguration(report);
}