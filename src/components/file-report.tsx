"use client";
import { useState } from "react";

/**
 * "حفظ كتقرير رسمي" — files the generated report into the existing Reports
 * system.
 *
 * The action states plainly that filing does not approve, and a duplicate
 * filing is confirmed explicitly rather than created silently.
 */
export function FileReportButton({
  template,
  range,
  committeeId,
  eventId,
}: {
  template: string;
  range: string;
  committeeId?: string;
  eventId?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [href, setHref] = useState<string | null>(null);

  async function file(acknowledgeDuplicate: boolean) {
    setState("busy");
    setMessage("");
    const res = await fetch("/api/intelligence/filing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template, range, committeeId, eventId, acknowledgeDuplicate }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setState("done");
      setHref(body.href ?? "/governance?tab=reports");
      setMessage(`أُودع التقرير بحالة «${body.status}». لم يُعتمد تلقائيًا، والمراجعة تمر بالمسار المعتاد.`);
      return;
    }
    // A duplicate needs an explicit decision rather than a second silent filing.
    if (res.status === 409) {
      setState("idle");
      setMessage(`${body.error} — هل تريد إيداع نسخة أخرى رغم ذلك؟`);
      return;
    }
    setState("error");
    setMessage(body.error ?? "تعذر إيداع التقرير");
  }

  return (
    <div className="intel-file">
      <button
        type="button"
        className="button primary"
        disabled={state === "busy"}
        onClick={() => file(false)}
      >
        {state === "busy" ? "جارٍ الإيداع…" : "حفظ كتقرير رسمي"}
      </button>
      {message && (
        <div className="intel-file-note">
          <p className="intel-hint">{message}</p>
          {state === "idle" && message.includes("نسخة أخرى") && (
            <button type="button" className="button secondary" onClick={() => file(true)}>
              نعم، أودع نسخة أخرى
            </button>
          )}
          {state === "done" && href && (
            <a className="intel-hint" href={href}>
              فتح التقرير في الحوكمة
            </a>
          )}
        </div>
      )}
    </div>
  );
}
