export default function Loading() {
  return (
    <main
      id="main"
      className="loading-page"
      aria-busy="true"
      aria-label="جارٍ التحميل"
    >
      <div className="skeleton" />
      <div className="skeleton" />
      <p>نجهز مساحتك...</p>
    </main>
  );
}
