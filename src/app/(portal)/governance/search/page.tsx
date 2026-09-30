import { headers } from "next/headers";
import { Shell } from "@/components/shell";
import { GovernanceCenter } from "@/components/governance-center";
import * as queries from "@/lib/governance/queries";
export const dynamic = "force-dynamic";
type StringDate<T> = T extends Date ? string : T extends Array<infer U> ? StringDate<U>[] : T extends object ? { [K in keyof T]: StringDate<T[K]> } : T;
type Lists = StringDate<Awaited<ReturnType<typeof queries.governanceLists>>>;
type Snapshot = StringDate<Awaited<ReturnType<typeof queries.governanceSnapshot>>>;
type Options = StringDate<Awaited<ReturnType<typeof queries.governanceOptions>>>;
type Detail = StringDate<Awaited<ReturnType<typeof queries.governanceDetail>>>;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await queries.identityFromHeaders(await headers()).catch(() => {
    throw new Error("غير مسجّل الدخول");
  });
  const query = await searchParams;
  const tab = query.tab || "overview";
  const selectedId = query.item;
  const q = (query.q ?? "").trim().slice(0, 160);
  const options = JSON.parse(JSON.stringify(await queries.governanceOptions(ctx))) as Options;
  const lists = JSON.parse(JSON.stringify(await queries.governanceLists(ctx))) as Lists;
  const snapshot = JSON.parse(JSON.stringify(await queries.governanceSnapshot(ctx, {
    academicTermId: query.term,
    committeeId: query.committee,
  }))) as Snapshot;
  const detail = selectedId && (["goals", "initiatives", "kpis", "evidence", "reports"] as any).includes(tab)
    ? await queries.governanceDetail(ctx, tab as any, selectedId)
    : null;
  const results = q.length >= 2 ? await queries.governanceSearch(ctx, q) : [];
  return (
    <Shell name={ctx.user.name} admin={false} supervisor={false}>
      <GovernanceCenter
        lists={lists}
        snapshot={snapshot}
        options={options}
        selected={detail ? JSON.parse(JSON.stringify(detail)) as Detail : null}
        tab={tab}
        userId={ctx.user.id}
        heading={q.length >= 2 ? `نتائج البحث عن “${q}”` : "الحوكمة والأدلة"}
      />
      {q.length >= 2 && (
        <section className="panel gov-section">
          <div className="section-title">
            <h2>RESULTS لـ "{q}"</h2>
            <span className="subtle-chip">{results.length} نتيجة</span>
          </div>
          {results.length ? (
            <div className="gov-card-grid">
              {results.map((r) => (
                <a key={r.id} className="panel gov-card" href={r.href}>
                  <span className="eyebrow">{r.kind}</span>
                  <h3>{r.title}</h3>
                  <span className="subtle-chip">{r.kind}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="muted">لا توجد وردة تطابق البحث.</p>
          )}
        </section>
      )}
    </Shell>
  );
}
