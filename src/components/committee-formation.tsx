"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Search, UserRoundPlus, X } from "lucide-react";

type Person = { id: string; name: string };
type Approver = Person & { preferred: boolean };

export function CommitteeFormation({
  people,
  approvers,
  termName,
  committee,
  formation,
}: {
  people: Person[];
  approvers: Approver[];
  termName: string;
  committee?: { id: string; name: string; description: string };
  formation?: {
    memberIds: string[];
    headId: string | null;
    approverIds: string[];
  } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(formation?.memberIds ?? []);
  const [headId, setHeadId] = useState(formation?.headId ?? "");
  const [approverIds, setApproverIds] = useState<string[]>(
    formation?.approverIds.length
      ? formation.approverIds
      : approvers.filter((item) => item.preferred).map((item) => item.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(
    () => people.filter((person) => person.name.includes(query.trim())),
    [people, query],
  );
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={committee ? "button secondary" : "button primary"}>
        <UserRoundPlus size={17} />
        {committee ? "إدارة التشكيل" : "تشكيل لجنة جديدة"}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog formation-dialog" dir="rtl">
          <Dialog.Close className="dialog-close icon-button" aria-label="إغلاق">
            <X size={19} />
          </Dialog.Close>
          <Dialog.Title>{committee ? `تشكيل ${committee.name}` : "تشكيل لجنة جديدة"}</Dialog.Title>
          <Dialog.Description>
            اختر الفريق والمعتمدين للفصل {termName}. سيصل الأعضاء إلى مساحة اللجنة فور الحفظ.
          </Dialog.Description>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(event.currentTarget);
              try {
                const response = await fetch(
                  committee ? `/api/committees/${committee.id}/formation` : "/api/committees",
                  {
                    method: committee ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: form.get("name"),
                      description: form.get("description"),
                      memberIds: selected,
                      headId: headId || null,
                      approverIds,
                    }),
                  },
                );
                const result = await response.json();
                if (!response.ok) throw new Error(result.message ?? "تعذر حفظ التشكيل");
                setOpen(false);
                router.push(`/committees/${result.id}`);
                router.refresh();
              } catch (cause) {
                setError((cause as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-two">
              <label>اسم اللجنة<input name="name" required minLength={2} maxLength={120} defaultValue={committee?.name} /></label>
              <label>رئيس اللجنة
                <select value={headId} onChange={(event) => {
                  const id = event.target.value;
                  setHeadId(id);
                  if (id && !selected.includes(id)) setSelected((current) => [...current, id]);
                }}>
                  <option value="">بدون تعيين حاليًا</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </label>
            </div>
            <label>نبذة اللجنة<textarea name="description" rows={3} maxLength={2000} defaultValue={committee?.description} /></label>
            <fieldset className="formation-approvers">
              <legend>اعتماد أعمال اللجنة</legend>
              <p>عند رفع العمل للمراجعة، لا يظهر إلا المعتمدون المحددون هنا.</p>
              {approvers.map((approver) => (
                <label key={approver.id}>
                  <input type="checkbox" checked={approverIds.includes(approver.id)} onChange={() => setApproverIds((current) => current.includes(approver.id) ? current.filter((id) => id !== approver.id) : [...current, approver.id])} />
                  <span><Check size={15} />{approver.name}{approver.preferred && <small>المعتمد المقترح</small>}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="formation-members">
              <legend>أعضاء اللجنة <span>{selected.length} محدد</span></legend>
              <label className="formation-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم العضو" /></label>
              <div className="formation-member-list">
                {filtered.map((person) => (
                  <label key={person.id}>
                    <input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} />
                    <span>{person.name.slice(0, 1)}</span>
                    <strong>{person.name}</strong>
                  </label>
                ))}
              </div>
            </fieldset>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <Dialog.Close className="button secondary" type="button">إلغاء</Dialog.Close>
              <button className="button primary" disabled={busy || !selected.length || !approverIds.length}>
                {busy ? "جارٍ الحفظ..." : committee ? "حفظ التشكيل" : "إنشاء اللجنة"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
