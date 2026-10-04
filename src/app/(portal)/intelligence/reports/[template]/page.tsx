import { headers } from "next/headers";
import { identity, HttpError } from "@/lib/services";
import { Shell } from "@/components/shell";
import { ReportPrintView } from "@/components/intelligence-views";
import { generateReport, reportTemplates, reportToCsv } from "@/lib/intelligence/queries";
import { permits } from "@/lib/policy";
import { canFile } from "@/lib/intelligence/queries";
import { FileReportButton } from "@/components/file-report";
export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ template: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { template } = await params;
  const q = await searchParams;
  const ctx = await identity(await headers()).catch(() => {
    throw new HttpError(401, "غير مسجّل الدخول");
  });
  const key = template as never;
  if (!reportTemplates.some((t) => t.key === key))
    throw new HttpError(404, "قالب التقرير غير موجود");
  const report = await generateReport(ctx, {
    template: key,
    range: q.range ?? "term",
    committeeId: q.committee,
    eventId: q.event,
  });
  const printable = q.print === "1";
  return (
    <Shell
      name={ctx.user.name}
      admin={permits(ctx.grants, "organization.manage")}
      supervisor={permits(ctx.grants, "supervisor.view")}
    >
      {printable ? (
        <div className="intel-print-page">
          <p className="intel-print-links no-print">
            <a href={`/api/intelligence/report/${template}?range=${q.range ?? "term"}&format=csv`}>
              تصدير CSV
            </a>{" "}
            · <a href={`/intelligence/reports/${template}?range=${q.range ?? "term"}`}>عرض على الشاشة</a>
            {canFile(ctx, key) && (
              <>
                {" "}·{" "}
                <FileReportButton
                  template={template}
                  range={q.range ?? "term"}
                  committeeId={q.committee}
                  eventId={q.event}
                />
              </>
            )}
          </p>
          <ReportPrintView report={JSON.parse(JSON.stringify(report))} />
        </div>
      ) : (
        <>
          {canFile(ctx, key) && (
            <div className="intel-file-bar">
              <FileReportButton
                template={template}
                range={q.range ?? "term"}
                committeeId={q.committee}
                eventId={q.event}
              />
            </div>
          )}
          <ReportPrintView report={JSON.parse(JSON.stringify(report))} />
        </>
      )}
    </Shell>
  );
}
