import type { OperationsShape } from "@/lib/intelligence/types";
import { intelligenceFrame, intelShell } from "../frame";
import { OperationsView } from "@/components/intelligence-views";
import { operationsIntelligence, intelligenceRangeOptions } from "@/lib/intelligence/queries";
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const range = q.range ?? "term";
  const { ctx, activeTermCount, data, error } = await intelligenceFrame(
    (c, r) => operationsIntelligence(c, r),
    range,
  );
  return intelShell(
    ctx,
    activeTermCount,
    <OperationsView
      data={data as unknown as OperationsShape | null}
      range={range}
      rangeOptions={intelligenceRangeOptions}
      error={error}
    />,
  );
}
