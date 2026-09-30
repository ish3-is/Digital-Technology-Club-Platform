"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="loading-page">
      <h1>تعذر تجهيز المساحة</h1>
      <p>حدث خطأ مؤقت. حاول مجددًا، أو تواصل مع مسؤول النظام إذا استمر.</p>
      <button className="button primary" onClick={reset}>
        إعادة المحاولة
      </button>
    </main>
  );
}
