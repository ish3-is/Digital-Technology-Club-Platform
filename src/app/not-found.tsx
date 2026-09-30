import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="loading-page">
      <h1>هذه المساحة غير متاحة</h1>
      <p>قد يكون الرابط غير صحيح، أو لا تملك صلاحية الوصول.</p>
      <Link href="/" className="button primary">
        العودة إلى المقر
      </Link>
    </main>
  );
}
