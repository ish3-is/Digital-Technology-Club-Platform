import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-arabic";
import "./globals.css";
export const metadata: Metadata = {
  title: "المقر الرقمي | نادي التقنية الرقمية",
  description: "المقر الرقمي لنادي التقنية الرقمية — جامعة الملك خالد",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script
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
