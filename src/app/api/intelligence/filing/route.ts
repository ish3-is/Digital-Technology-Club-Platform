import { identity, HttpError } from "@/lib/services";
import { canFile, fileIntelligenceReport, reportTemplates } from "@/lib/intelligence/queries";
export const runtime = "nodejs";

/**
 * Files a generated intelligence report into the existing Reports system.
 *
 * The report lands as a draft: submission, review and approval stay with the
 * existing workflow and their own separate permissions, so filing never
 * approves. A repeated filing for the same period is refused unless the caller
 * explicitly acknowledges it, which keeps one period to one official report.
 */
export async function POST(req: Request) {
  const ctx = await identity(req.headers).catch(() => {
    throw new HttpError(401, "غير مسجّل الدخول");
  });
  const data = (await req.json().catch(() => ({}))) as {
    template?: string;
    range?: string;
    committeeId?: string;
    eventId?: string;
    acknowledgeDuplicate?: boolean;
  };
  const template = data.template as never;
  if (!reportTemplates.some((t) => t.key === template))
    return Response.json({ error: "قالب التقرير غير موجود" }, { status: 404 });
  if (!canFile(ctx, template))
    return Response.json({ error: "لا تملك صلاحية إيداع هذا التقرير رسميًا" }, { status: 403 });
  try {
    const filed = await fileIntelligenceReport(ctx, {
      template,
      range: data.range,
      committeeId: data.committeeId,
      eventId: data.eventId,
      acknowledgeDuplicate: data.acknowledgeDuplicate === true,
    });
    return Response.json(
      {
        ok: true,
        reportId: filed.reportId,
        status: filed.status,
        typeId: filed.typeId,
        title: filed.title,
        provenanceMetrics: filed.snapshot.provenance.length,
        href: `/governance?tab=reports&item=${filed.reportId}`,
      },
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "تعذر إيداع التقرير";
    // A refusal from the report or filing layer is a permission or state
    // problem, not a server fault, so it must not surface as a 500.
    // A permission or state refusal is a 403/409, never a server fault. The
    // messages come from the service layer as plain Errors, so they are matched
    // rather than relying on the error type.
    const status =
      e instanceof HttpError
        ? e.status
        : /صلاحية|غير مسموح|غير متاح|غير معروف|مرفوض/.test(message)
          ? 403
          : /الفصل|الفترة|حالة|سبق إيداع/.test(message)
            ? 409
            : 500;
    return Response.json({ error: message }, { status });
  }
}
