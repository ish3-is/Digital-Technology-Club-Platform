import { identity } from "@/lib/services";
import { Shell } from "@/components/shell";
import { IntelligenceHome } from "@/components/intelligence-views";
import { permits } from "@/lib/policy";
import { canReadExecutive } from "@/lib/intelligence/queries";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await identity(await (await import("next/headers")).headers());
  const activeTermCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.terms)
    .where(eq(s.terms.status, "active"))
    .then((r) => r[0]?.n ?? 0)
    .catch(() => 0);
  return (
    <Shell
      name={ctx.user.name}
      admin={permits(ctx.grants, "organization.manage")}
      supervisor={permits(ctx.grants, "supervisor.view")}
      term={activeTermCount ? "نشط" : undefined}
    >
      <IntelligenceHome
        canExecutive={canReadExecutive(ctx)}
        activeTermCount={activeTermCount}
      />
    </Shell>
  );
}
