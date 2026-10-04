import type { ExecutiveShape } from "@/lib/intelligence/types";
import { intelligenceFrame, intelShell } from "../frame";
import { ExecutiveView } from "@/components/intelligence-views";
import { executiveIntelligenceFull, intelligenceRangeOptions } from "@/lib/intelligence/queries";
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const range = q.range ?? "term";
  const { ctx, activeTermCount, data, error } = await intelligenceFrame(
    (c, r) => executiveIntelligenceFull(c, r),
    range,
  );
  return intelShell(
    ctx,
    activeTermCount,
    <ExecutiveView
      data={data as unknown as ExecutiveShape | null}
      range={range}
      rangeOptions={intelligenceRangeOptions}
      error={error}
    />,
  );
}
