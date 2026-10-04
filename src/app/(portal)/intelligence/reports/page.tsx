import type { ReportsShape } from "@/lib/intelligence/types";
import { intelligenceFrame, intelShell } from "../frame";
import { ReportsView } from "@/components/intelligence-views";
import { intelligenceReports, intelligenceRangeOptions } from "@/lib/intelligence/queries";
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const range = q.range ?? "term";
  const { ctx, activeTermCount, data, error } = await intelligenceFrame(
    (c) => intelligenceReports(c),
    range,
  );
  return intelShell(
    ctx,
    activeTermCount,
    <ReportsView
      data={data as unknown as ReportsShape | null}
      range={range}
      rangeOptions={intelligenceRangeOptions}
      error={error}
    />,
  );
}
