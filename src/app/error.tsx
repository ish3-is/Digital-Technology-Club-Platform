"use client";
import { useEffect, useState } from "react";
import { LoadingSkeleton, PlaceholderShell } from "@/components/placeholder";

export default function ErrorPage({ reset }: { reset: () => void }) {
  // The server streams `loading.tsx` while the route resolves and has no way to
  // know the route will then throw, so the browser is left holding that
  // skeleton. Rendering the same skeleton first and swapping it after mount
  // keeps the initial client render identical to the server's response.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <PlaceholderShell busy={!hydrated}>
      {hydrated ? (
        <>
          <h1>تعذر تجهيز المساحة</h1>
          <p>
            حدث خطأ مؤقت. حاول مجددًا، أو تواصل مع مسؤول النظام إذا استمر.
          </p>
          <button className="button primary" onClick={reset}>
            إعادة المحاولة
          </button>
        </>
      ) : (
        <LoadingSkeleton />
      )}
    </PlaceholderShell>
  );
}
