import Link from "next/link";
import { headers } from "next/headers";
import { identity, HttpError } from "@/lib/services";
import { Shell } from "@/components/shell";
import { GovernanceCenter } from "@/components/governance-center";
import * as queries from "@/lib/governance/queries";
import { permits } from "@/lib/policy";
export const dynamic = "force-dynamic";
type StringDate<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? StringDate<U>[]
    : T extends object
      ? { [K in keyof T]: StringDate<T[K]> }
      : T;
type Lists = StringDate<Awaited<ReturnType<typeof queries.governanceLists>>>;
type Snapshot = StringDate<
  Awaited<ReturnType<typeof queries.governanceSnapshot>>
>;
type Options = StringDate<
  Awaited<ReturnType<typeof queries.governanceOptions>>
>;
type Detail = StringDate<Awaited<ReturnType<typeof queries.governanceDetail>>>;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // `allowSetup` lets an account that has not finished onboarding render this
  // route instead of throwing. The response streams `loading.tsx` first, and a
  // throw after that point makes React swap the streamed skeleton for the error
  // boundary — a mismatch against the markup the server actually sent. Returning
  // a real state keeps server and client in agreement and names the actual reason.
  const ctx = await identity(await headers(), true).catch(() => {
    throw new HttpError(401, "غير مسجّل الدخول");
  });
  const query = await searchParams;
  const tab = query.tab || "overview";
  const selectedId = query.item;
    // An unprovisioned account has no assignments, so governance data cannot
    // exist for it. State that plainly instead of failing generically.
  if (!ctx.user.onboarded)
    return (
      <Shell name={ctx.user.name} admin={false} supervisor={false}>
        <section className="panel">
          <h2>أكمل إعداد حسابك</h2>
          <p>
            مساحة الحوكمة تحتاج حسابًا مُهيّأً ومنتسبًا إلى فصل نشط. أكمل الإعداد من
            ملفك، ثم عد إلى هذه المساحة.
          </p>
          <Link className="button primary" href="/profile">
            فتح ملفي
          </Link>
        </section>
      </Shell>
    );
  const options = JSON.parse(
    JSON.stringify(await queries.governanceOptions(ctx)),
  ) as Options;
  const lists = JSON.parse(
    JSON.stringify(await queries.governanceLists(ctx)),
  ) as Lists;
  const snapshot = JSON.parse(
    JSON.stringify(
      await queries.governanceSnapshot(ctx, {
        academicTermId: query.term,
        committeeId: query.committee,
      }),
    ),
  ) as Snapshot;
  const detail =
    selectedId && [queries.governanceKinds].flat().includes(tab as any)
      ? await queries.governanceDetail(ctx, tab as any, selectedId)
      : null;
  return (
    <Shell
      name={ctx.user.name}
      admin={permits(ctx.grants, "organization.manage")}
      supervisor={permits(ctx.grants, "supervisor.view")}
      term={options.activeTerms[0]?.name}
    >
      <GovernanceCenter
        lists={lists}
        snapshot={snapshot}
        options={options}
        selected={
          detail ? (JSON.parse(JSON.stringify(detail)) as Detail) : null
        }
        tab={tab}
        userId={ctx.user.id}
      />
    </Shell>
  );
}
