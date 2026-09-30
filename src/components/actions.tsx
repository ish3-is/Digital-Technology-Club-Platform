"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "./auth-form";
export function ReadButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="button secondary small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch(`/api/notifications/${id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (!r.ok) throw Error();
            router.refresh();
          } catch {
            setError("تعذر تحديث التنبيه");
          } finally {
            setBusy(false);
          }
        }}
      >
        تم الاطلاع
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
export function CommitteeEditor({
  id,
  description,
}: {
  id: string;
  description: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="edit-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        try {
          const r = await fetch(`/api/committees/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: form.get("description") }),
          });
          setMessage(
            r.ok
              ? "تم حفظ نبذة اللجنة"
              : "تعذر الحفظ. تحقق من صلاحيتك وحاول مجددًا.",
          );
          if (r.ok) router.refresh();
        } catch {
          setMessage("تعذر الاتصال");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        نبذة اللجنة
        <textarea
          name="description"
          defaultValue={description}
          maxLength={2000}
          rows={4}
        />
      </label>
      <button className="button primary" disabled={busy}>
        حفظ النبذة
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function Sessions() {
  const [sessions, setSessions] = useState<
    { token: string; id: string; createdAt: Date; userAgent?: string | null }[]
  >([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    const r = await authClient.listSessions();
    if (r.error) setMessage("تعذر تحميل الجلسات");
    else setSessions(r.data || []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="panel">
      <h2>الجلسات النشطة</h2>
      <p className="muted">
        ألغِ أي جلسة لا تعرفها. إلغاء الجلسة الحالية يعيدك إلى تسجيل الدخول.
      </p>
      {loading ? (
        <p role="status">جارٍ تحميل الجلسات...</p>
      ) : (
        sessions.map((s) => (
          <div className="list-row" key={s.id}>
            <div>
              <strong>جلسة متصفح</strong>
              <small>
                {new Date(s.createdAt).toLocaleString("ar-SA", {
                  timeZone: "Asia/Riyadh",
                })}
              </small>
            </div>
            <button
              className="button secondary small"
              onClick={async () => {
                const r = await authClient.revokeSession({ token: s.token });
                if (r.error) setMessage("تعذر إلغاء الجلسة");
                else {
                  setMessage("تم إلغاء الجلسة");
                  const current = await authClient.getSession();
                  if (!current.data) window.location.assign("/login");
                  else await load();
                }
              }}
            >
              إلغاء الجلسة
            </button>
          </div>
        ))
      )}
      <p role="status">{message}</p>
    </section>
  );
}
