import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { identity } from "@/lib/services";
import { Shell } from "@/components/shell";
import { permits } from "@/lib/policy";

/**
 * Shared loader for every intelligence route.
 *
 * Each route resolves its own data through the intelligence library; this only
 * handles the session, the shell, and the active-term flag. A failure here is
 * passed to the page as an error string so a missing term or an absent
 * permission renders an explanation instead of crashing.
 */
export async function intelligenceFrame<T>(
  load: (ctx: Awaited<ReturnType<typeof identity>>, range: string) => Promise<T>,
  rangeKey = "term",
) {
  const ctx = await identity(await headers());
  const activeTermCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.terms)
    .where(eq(s.terms.status, "active"))
    .then((r) => r[0]?.n ?? 0)
    .catch(() => 0);

  let data: T | null = null;
  let error: string | null = null;
  try {
    data = JSON.parse(JSON.stringify(await load(ctx, rangeKey))) as T;
  } catch (e) {
    const message = e instanceof Error ? e.message : "تعذر تحميل البيانات";
    error = message;
  }

  return { ctx, activeTermCount, data, error };
}

export function intelShell(
  ctx: Awaited<ReturnType<typeof identity>>,
  activeTermCount: number,
  children: React.ReactNode,
) {
  return (
    <Shell
      name={ctx.user.name}
      admin={permits(ctx.grants, "organization.manage")}
      supervisor={permits(ctx.grants, "supervisor.view")}
      term={activeTermCount ? "نشط" : undefined}
    >
      {children}
    </Shell>
  );
}