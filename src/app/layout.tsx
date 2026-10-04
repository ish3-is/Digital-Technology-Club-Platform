import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/noto-sans-arabic";
import "./globals.css";
export const metadata: Metadata = {
  title: "المقر الرقمي | نادي التقنية الرقمية",
  description: "المقر الرقمي لنادي التقنية الرقمية — جامعة الملك خالد",
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The proxy sets a fresh nonce per request; the theme script is inline, so it
  // must carry the same nonce the policy was issued with.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // The attribute is omitted entirely when no nonce is present, so the server
  // and client render the same markup.
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('club-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}`,
          }}
        />
      </head>
      <body>
        <a className="skip" href="#main">
          تجاوز إلى المحتوى
        </a>
        {children}
      </body>
    </html>
  );
}
