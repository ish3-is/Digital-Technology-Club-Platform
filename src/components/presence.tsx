"use client";

import { useEffect, useState } from "react";
import { Radio, UsersRound } from "lucide-react";

type OnlineMember = {
  id: string;
  name: string;
  lastSeenAt: string;
};

async function heartbeat() {
  await fetch("/api/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    keepalive: true,
  });
}

export function PresenceTracker() {
  useEffect(() => {
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}

export function OnlineMembersPanel() {
  const [members, setMembers] = useState<OnlineMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await heartbeat();
        const response = await fetch("/api/presence", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as OnlineMember[];
        if (active) {
          setMembers(data);
          setError("");
        }
      } catch {
        if (active) setError("تعذر تحديث الحضور الآن");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="panel online-panel" aria-labelledby="online-heading">
      <div className="online-heading">
        <span className="online-icon" aria-hidden="true">
          <Radio size={19} />
        </span>
        <div>
          <h2 id="online-heading">المتصلون الآن</h2>
          <p aria-live="polite">
            {loading ? "جارٍ التحقق..." : `${members.length} متصل`}
          </p>
        </div>
      </div>
      {members.length ? (
        <ul className="online-members" aria-label="أسماء المتصلين الآن">
          {members.map((member) => (
            <li key={member.id}>
              <span className="presence-dot" />
              <span className="online-avatar">{member.name.slice(0, 1)}</span>
              <strong>{member.name}</strong>
            </li>
          ))}
        </ul>
      ) : !loading ? (
        <div className="online-empty">
          <UsersRound size={21} />
          <p>سيظهر الأعضاء هنا عند فتحهم للمنصة.</p>
        </div>
      ) : null}
      {error && <p className="muted" role="status">{error}</p>}
      <small>يُحدّث تلقائيًا، ويختفي الاسم بعد دقيقتين من آخر نشاط.</small>
    </section>
  );
}
