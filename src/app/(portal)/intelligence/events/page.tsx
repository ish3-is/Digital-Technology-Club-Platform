import type { EventsShape } from "@/lib/intelligence/types";
import { intelligenceFrame, intelShell } from "../frame";
import { EventsView } from "@/components/intelligence-views";
import { eventsIntelligence, intelligenceRangeOptions } from "@/lib/intelligence/queries";
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const range = q.range ?? "term";
  const { ctx, activeTermCount, data, error } = await intelligenceFrame(
    (c, r) => eventsIntelligence(c, r),
    range,
  );
  return intelShell(
    ctx,
    activeTermCount,
    <EventsView
      data={data as unknown as EventsShape | null}
      range={range}
      rangeOptions={intelligenceRangeOptions}
      error={error}
      selected={q.event}
    />,
  );
}
