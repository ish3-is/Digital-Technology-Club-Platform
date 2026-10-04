import { headers } from "next/headers";
import { identity, HttpError } from "@/lib/services";
import { Shell } from "@/components/shell";
import { PeopleCenter } from "@/components/people-center";
import * as queries from "@/lib/people/queries";
import { peopleOptions, emptyPeopleOptions } from "@/lib/people/members.service";
import { permits } from "@/lib/policy";
export const dynamic = "force-dynamic";
type StringDate<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? StringDate<U>[]
    : T extends object
      ? { [K in keyof T]: StringDate<T[K]> }
      : T;
type Lists = StringDate<Awaited<ReturnType<typeof queries.peopleLists>>>;
type Options = StringDate<Awaited<ReturnType<typeof peopleOptions>>>;
type Detail = StringDate<Awaited<ReturnType<typeof queries.memberDetail>>>;
type Inbox = StringDate<Awaited<ReturnType<typeof queries.peopleInbox>>>;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await identity(await headers()).catch(() => {
    throw new HttpError(401, "غير مسجّل الدخول");
  });
  const query = await searchParams;
  const tab = query.tab || "overview";
  const memberId = query.member;
  const json = <T,>(value: unknown) => JSON.parse(JSON.stringify(value)) as T;
  const [options, inbox, detail] = await Promise.all([
    peopleOptions(ctx).catch(() => emptyPeopleOptions()),
    queries.peopleInbox(ctx).catch(() => []),
    memberId
      ? queries.memberDetail(ctx, memberId).catch(() => null)
      : Promise.resolve(null),
  ]);
  // An empty People area is a valid state, not a failure: never hand the
  // interface a null here. A real read error comes back as an empty structure
  // plus a reason we can show, instead of a crash on `lists.members`.
  const { lists, error } = await queries.peopleListsSafe(ctx, {
    academicTermId: options.academicTermId ?? undefined,
    committeeId: query.committee,
    query: query.q,
  });
  return (
    <Shell
      name={ctx.user.name}
      admin={permits(ctx.grants, "organization.manage")}
      supervisor={permits(ctx.grants, "supervisor.view")}
      term={options.activeTermCount ? "نشط" : undefined}
    >
      <PeopleCenter
        lists={json<Lists>(lists)}
        options={json<Options>(options)}
        detail={detail ? json<Detail>(detail) : null}
        inbox={json<Inbox>(inbox)}
        tab={tab}
        memberId={memberId}
        userId={ctx.user.id}
        loadError={error}
      />
    </Shell>
  );
}
