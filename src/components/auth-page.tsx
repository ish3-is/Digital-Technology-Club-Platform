import { Brand } from "./brand";
import { AuthForm } from "./auth-form";
import { ShieldCheck, ArrowUpLeft } from "lucide-react";
export function AuthPage({
  mode = "login",
  name,
}: {
  mode?: "login" | "forgot" | "reset" | "setup";
  name?: string;
}) {
  const titles = {
    login: "أهلًا بعودتك إلى المقر",
    forgot: "نرجعك إلى المقر",
    reset: "بداية آمنة جديدة",
    setup: "أهلًا بك في فريق النادي",
  };
  return (
    <main id="main" className="auth-layout">
      <section className="auth-content">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow">المقر الرقمي للنادي</span>
          <h1>{titles[mode]}</h1>
          <p>
            {mode === "login"
              ? "مساحتك للعمل مع الفريق، وصناعة أثر يستحق."
              : mode === "setup"
                ? "خطوة بسيطة قبل البداية. تأكد من اسمك ليتعرف عليك فريقك."
                : "استعد الوصول إلى حسابك بأمان."}
          </p>
          <AuthForm mode={mode} name={name} />
          {mode !== "login" && (
            <a className="back-link" href="/login">
              العودة إلى تسجيل الدخول
            </a>
          )}
          {mode === "login" && (
            <div className="auth-help">
              <ShieldCheck size={19} />
              <p>
                حسابك يُنشأ من خلال إدارة النادي.
                <br />
                <span>للانضمام أو تفعيل الحساب، تواصل مع مسؤول النادي.</span>
              </p>
            </div>
          )}
        </div>
        <footer>
          جامعة الملك خالد <span>•</span> نادي التقنية الرقمية
        </footer>
      </section>
      <aside className="auth-story">
        <div className="story-top">
          <span className="pill">من الفكرة إلى الأثر</span>
          <ArrowUpLeft />
        </div>
        <div className="story-center">
          <div className="orbit-art" aria-hidden="true">
            <div />
            <div />
            <div />
            <span>
              نلتقي.
              <br />
              نبني.
              <br />
              <b>نترك أثرًا.</b>
            </span>
          </div>
          <h2>
            مكان واحد.
            <br />
            لأثر نصنعه معًا.
          </h2>
          <p>
            أشخاص يجمعهم الشغف، وأفكار تتحول إلى عمل.
            <br />
            هنا تبدأ حكاية إنجازنا القادم.
          </p>
        </div>
        <div className="story-bottom">
          <Brand primary />
          <span>
            المقر الرقمي
            <br />
            لنادي التقنية الرقمية
          </span>
        </div>
      </aside>
    </main>
  );
}
