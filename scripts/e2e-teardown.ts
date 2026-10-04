import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";

/**
 * Removes the isolated PGlite directory created for the current run only.
 *
 * The directory name is handed over by playwright.config.ts through
 * .data/.e2e-current-dir, so this never scans for names to guess at and never
 * races a live server: by the time teardown runs, the web server has exited.
 *
 * Safety rules enforced here:
 *  - the recorded name must be a plain directory name (no path separators),
 *  - it must sit directly under .data,
 *  - it must start with the prefix this project generates,
 *  - anything else is skipped rather than deleted.
 *
 * Cleanup is best-effort: a failure is reported and swallowed so it can never
 * turn a passing test run into a failing one.
 */
const PREFIX = "e2e-playwright-";
const DATA_DIR = ".data";
const HANDOFF = `${DATA_DIR}/.e2e-current-dir`;

export default async function globalTeardown() {
  try {
    const recorded = (await readFile(HANDOFF, "utf8")).trim();
        if (!recorded) return;

        // The config records the path it hands to PGLITE_DIR. Strip the known .data
        // prefix and require what remains to be a bare directory name, so a
        // tampered value can never reach outside .data.
        const name = recorded.startsWith(`${DATA_DIR}/`)
          ? recorded.slice(DATA_DIR.length + 1)
          : recorded;
        if (name !== basename(name) || name === "" || name === "." ) {
          console.warn(`تخطّى التنظيف: اسم غير صالح ${recorded}`);
          return;
        }
        if (!name.startsWith(PREFIX)) {
          console.warn(`تخطّى التنظيف: اسم لا يطابق النطاق ${name}`);
          return;
        }

    const target = resolve(DATA_DIR, name);
        // Reject anything that escaped the .data directory.
        if (!target.startsWith(resolve(DATA_DIR) + sep)) {
          console.warn(`تخطّى التنظيف: مسار خارج النطاق ${target}`);
          return;
        }

    await rm(target, { recursive: true, force: true });
    await rm(HANDOFF, { force: true });
    console.log(`تم حذف قاعدة بيانات الاختبار المؤقتة: ${target}`);
  } catch (e) {
    // Best-effort only: never fail the run over cleanup.
    console.warn(`تعذر تنظيف قاعدة بيانات الاختبار المؤقتة: ${(e as Error).message}`);
  } finally {
    await mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  }
}