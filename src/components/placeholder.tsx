/**
 * The shared loading / failure placeholder.
 *
 * `loading.tsx` is what the server streams while a route resolves. When a route
 * then throws, React replaces that subtree with `error.tsx`. Both must render
 * the same markup on their first pass, otherwise the browser holds one tree
 * while React expects another and hydration fails.
 *
 * Keeping the markup in one place makes that equality structural rather than a
 * coincidence between two files.
 */
export function LoadingSkeleton({
  message = "نجهز مساحتك...",
}: {
  message?: string;
}) {
  return (
    <>
      <div className="skeleton" />
      <div className="skeleton" />
      <p>{message}</p>
    </>
  );
}

/** The container both boundaries share, so only the children can differ. */
export function PlaceholderShell({
  busy,
  children,
}: {
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main"
      className="loading-page"
      aria-busy={busy ? "true" : undefined}
      aria-label={busy ? "جارٍ التحميل" : undefined}
    >
      {children}
    </main>
  );
}