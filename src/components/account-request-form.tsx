"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { publicAccountCommitteeOptions } from "@/lib/account-requests/public-options";

export function AccountRequestForm() {
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setReady(true), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/account-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.get("fullName"),
          email: form.get("email"),
          groupKey: form.get("groupKey"),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "تعذر تسجيل الطلب الآن. حاول لاحقًا.");
      setMessage(result.message || "تم تسجيل الطلب.");
      event.currentTarget.reset();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (message)
    return (
      <div className="account-request-success" role="status">
        <CheckCircle2 size={28} />
        <h2>وصل طلبك</h2>
        <p>{message}</p>
      </div>
    );

  return (
    <form className="auth-form account-request-form" onSubmit={submit}>
      <div className="request-assurance">
        <ShieldCheck size={19} />
        <p>
          سنطابق الاسم واللجنة مع سجل النادي الرسمي. لا يُنشأ الحساب إلا بعد
          مراجعة الإدارة.
        </p>
      </div>
      <label>
        الاسم الكامل في سجل النادي
        <input
          name="fullName"
          autoComplete="name"
          minLength={2}
          maxLength={120}
          placeholder="اكتب اسمك كما ورد في قائمة الأعضاء"
          required
        />
      </label>
      <label>
        البريد الإلكتروني
        <input
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          placeholder="name@example.com"
          maxLength={200}
          required
        />
      </label>
      <label>
        لجنتك
        <select name="groupKey" defaultValue="" required>
          <option value="" disabled>
            اختر اللجنة المسجلة باسمك
          </option>
          {publicAccountCommitteeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy || !ready}>
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <>
            مطابقة العضوية وإرسال الطلب
            <ArrowLeft size={18} />
          </>
        )}
      </button>
      <small className="request-privacy">
        لن نعرض قائمة الأعضاء، ولن يمنح إرسال الطلب أي صلاحية تلقائيًا.
      </small>
    </form>
  );
}
