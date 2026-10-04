import { LoadingSkeleton, PlaceholderShell } from "@/components/placeholder";

export default function Loading() {
  // The shell and skeleton are shared with `error.tsx`: when a route streams
  // this placeholder and then throws, React swaps in the error boundary, and
  // the two must agree on their first render or hydration fails.
  return (
    <PlaceholderShell busy>
      <LoadingSkeleton />
    </PlaceholderShell>
  );
}
