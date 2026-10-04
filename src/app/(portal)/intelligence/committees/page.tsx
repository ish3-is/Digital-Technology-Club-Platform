import type { CommitteesShape } from "@/lib/intelligence/types";
import { intelligenceFrame, intelShell } from "../frame";
import { CommitteesView } from "@/components/intelligence-views";
import { committeesIntelligence, intelligenceRangeOptions } from "@/lib/intelligence/queries";
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const range = q.range ?? "term";
  const { ctx, activeTermCount, data, error } = await intelligenceFrame(
    (c, r) => committeesIntelligence(c, r),
    range,
  );
  return intelShell(
    ctx,
    activeTermCount,
    <CommitteesView
      data={data as unknown as CommitteesShape | null}
      range={range}
      rangeOptions={intelligenceRangeOptions}
      error={error}
    />,
  );
}
