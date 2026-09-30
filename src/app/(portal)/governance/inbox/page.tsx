import { headers } from "next/headers";
import { identity, HttpError } from "@/lib/services";
import { Shell } from "@/components/shell";
import { GovernanceCenter } from "@/components/governance-center";
import * as queries from "@/lib/governance/queries";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await identity(await headers()).catch(() => {
    throw new HttpError(401, "غير مسجّل الدخول");
  });
  const query = await searchParams;
  const inbox = await queries.governanceInbox(ctx);
  return (
    <Shell name={ctx.user.name} admin={false} supervisor={false}>
      <div className="governance-center">
        <div className="page-heading">
          <span className="eyebrow">المرحلة الرابعة · صندوق الوارد المؤسسي</span>
          <h1>صندوق الوارد</h1>
          <p>إجراءات مشتقة من الحوكمة؛ كل عنصر له سبب ومصدر، وليس إشعارًا عامًّا.</p>
        </div>
        <nav className="gov-tabs" aria-label="مساحات الحوكمة">
          <a href="/governance" aria-current="page">النبض والقيادة</a>
          <a href="/governance/inbox" aria-current="page">صندوق الوارد</a>
        </nav>
        <section className="panel gov-section">
          <h2>الإجراءات المؤسسية ({inbox.length})</h2>
          {inbox.length ? (
            <div className="gov-card-grid">
              {inbox.map((a) => (
                <article key={a.id} className="gov-row">
                  <div>
                    <a href={a.href}>{a.title}</a>
                    <p>{a.reason}</p>
                    <span className="subtle-chip">{a.severity === "high" ? "أولوية" : "متابعة"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>لا توجد إجراءات في صندوقك</h3>
              <p>عندما تُفتح مراجعات وتعتمادات، تظهر هنا.</p>
            </div>
          )}
        </section>
        <section className="panel gov-section">
          <h2>كيف يُملأ الصندوق؟</h2>
          <p>
            يُشتق كل إجراء من حالة مؤسسية حقيقية: تقرير موقع للمراجعة، أو تقرير
            ينتظر اعتمادًا بعد اكتمال توصيات المراجعين، أو تقرير طلب تعديل
            على المنشئ. لا يظهر إلا ضمن النطاق الذي تملك فيه الصلاحية
            المناسبة، ويُرفع عندما يُحلَّ.
          </p>
        </section>
      </div>
    </Shell>
  );
}
