import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { identity } from "@/lib/services";
import { Shell } from "@/components/shell";
import { OperationsCenter } from "@/components/operations-center";
import { operationsHome, operationsInbox } from "@/lib/operations";
import { permits } from "@/lib/policy";

type Json<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;
type Home = Json<Awaited<ReturnType<typeof operationsHome>>>;
type Inbox = Json<Awaited<ReturnType<typeof operationsInbox>>>;

/**
 * The shared renderer for every /operations route. Each query degrades to an
 * empty result on failure, so a zero-data or permission-limited account sees an
 * empty workspace rather than a crash, and creation actions explain themselves
 * when no academic term is active.
 */
export async function renderOperations(area: string) {
  const ctx = await identity(await headers());
  const [home, inbox, activeTermCount] = await Promise.all([
    operationsHome(ctx).catch(() => null),
    operationsInbox(ctx).catch(() => []),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.terms)
      .where(eq(s.terms.status, "active"))
      .then((r) => r[0]?.n ?? 0)
      .catch(() => 0),
  ]);
  const json = <T,>(value: unknown) => JSON.parse(JSON.stringify(value)) as T;
  return (
    <Shell
      name={ctx.user.name}
      admin={permits(ctx.grants, "organization.manage")}
      supervisor={permits(ctx.grants, "supervisor.view")}
    >
      <OperationsCenter
        area={area}
        home={home ? json<Home>(home) : null}
        inbox={json<Inbox>(inbox)}
        activeTermCount={activeTermCount}
        canFinance={permits(ctx.grants, "finance.view")}
        canMedia={permits(ctx.grants, "media.view")}
        canDigital={permits(ctx.grants, "digital.view")}
        canResources={permits(ctx.grants, "resource.view")}
      />
    </Shell>
  );
}