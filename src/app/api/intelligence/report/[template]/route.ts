import { identity, HttpError } from "@/lib/services";
import { generateReport, reportToCsv, reportTemplates } from "@/lib/intelligence/queries";
export const runtime = "nodejs";

/**
 * CSV export for an intelligence report.
 *
 * The export is generated from the same scoped `Report` object as the HTML
 * view, under the same actor, so it can never contain a row the viewer could
 * not already read on screen.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ template: string }> },
) {
  const ctx = await identity(req.headers).catch(() => {
    throw new HttpError(401, "غير مسجّل الدخول");
  });
  const { template } = await params;
  const key = template as never;
  if (!reportTemplates.some((t) => t.key === key))
    throw new HttpError(404, "قالب التقرير غير موجود");
  const url = new URL(req.url);
  try {
    const report = await generateReport(ctx, {
      template: key,
      range: url.searchParams.get("range") ?? "term",
      committeeId: url.searchParams.get("committee") ?? undefined,
      eventId: url.searchParams.get("event") ?? undefined,
    });
    const csv = reportToCsv(report);
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        // A BOM keeps the Arabic readable when the file opens in Excel.
        "content-disposition": `attachment; filename="${template}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 403;
    return Response.json(
      { error: e instanceof Error ? e.message : "تعذر إنشاء التقرير" },
      { status },
    );
  }
}
