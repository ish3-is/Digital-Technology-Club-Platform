"use client";
import { useEffect, useState } from "react";
import { createAuthClient } from "better-auth/react";
import { ArrowLeft, Eye, EyeOff, LoaderCircle } from "lucide-react";
export const authClient = createAuthClient();
export function AuthForm({
  mode = "login",
  name = "",
}: {
  mode?: "login" | "forgot" | "reset" | "setup";
  name?: string;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (mode === "login") {
        const r = await authClient.signIn.email({
          email: String(f.get("email")),
          password: String(f.get("password")),
        });
        if (r.error)
          throw new Error(
            r.error.status === 429
              ? "محاولات كثيرة. انتظر دقيقة ثم حاول مجددًا."
              : "تعذر الدخول. تحقق من البريد وكلمة المرور أو تواصل مع الإدارة.",
          );
        window.location.assign("/");
      }
      if (mode === "forgot") {
        const r = await authClient.requestPasswordReset({
          email: String(f.get("email")),
          redirectTo: "/reset-password",
        });
        if (r.error)
          throw new Error(
            r.error.status === 503
              ? "خدمة الاستعادة غير مهيأة بعد. تواصل مع إدارة النادي."
              : "تعذر إرسال الطلب. حاول لاحقًا.",
          );
        setMessage("إذا كان البريد مرتبطًا بحساب، ستصلك رسالة استعادة.");
      }
      if (mode === "reset") {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token)
          throw new Error("رابط الاستعادة غير صالح. اطلب رابطًا جديدًا.");
        const r = await authClient.resetPassword({
          newPassword: String(f.get("password")),
          token,
        });
        if (r.error)
          throw new Error("الرابط منتهي أو غير صالح. اطلب رابطًا جديدًا.");
        setMessage("تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن.");
      }
      if (mode === "setup") {
        const r = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: f.get("name") }),
        });
        if (!r.ok) throw new Error("تحقق من الاسم وحاول مجددًا.");
        window.location.assign("/");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form method="post" onSubmit={submit} className="auth-form">
      {mode === "setup" ? (
        <label>
          الاسم الذي سيظهر لزملائك
          <input
            name="name"
            autoComplete="name"
            defaultValue={name}
            minLength={2}
            maxLength={80}
            required
          />
        </label>
      ) : (
        mode !== "reset" && (
          <label>
            البريد الإلكتروني
            <input
              name="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              placeholder="name@kku.edu.sa"
              required
            />
          </label>
        )
      )}
      {(mode === "login" || mode === "reset") && (
        <label>
          {mode === "reset" ? "كلمة المرور الجديدة" : "كلمة المرور"}
          <span className="password-field">
            <input
              name="password"
              type={show ? "text" : "password"}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "reset" ? 12 : 1}
              required
              dir="ltr"
            />
            <button
              type="button"
              className="icon-button"
              aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
          {mode === "reset" && <small>استخدم ١٢ حرفًا على الأقل.</small>}
        </label>
      )}
      {mode === "login" && (
        <a className="forgot" href="/forgot-password">
          نسيت كلمة المرور؟
        </a>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      <button className="button primary" disabled={busy || !ready}>
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <>
            {mode === "login"
              ? "الدخول إلى المقر"
              : mode === "forgot"
                ? "إرسال رابط الاستعادة"
                : mode === "reset"
                  ? "حفظ كلمة المرور"
                  : "لنبدأ رحلتك"}
            <ArrowLeft size={18} />
          </>
        )}
      </button>
      <noscript>يرجى تفعيل جافاسكربت لتسجيل الدخول بأمان.</noscript>
    </form>
  );
}
