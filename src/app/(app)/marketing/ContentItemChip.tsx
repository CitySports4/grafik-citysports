"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Banner } from "@/components/Banner";
import { ColorDot } from "@/components/ColorDot";
import { BTN_PRIMARY, BTN_GHOST_DANGER } from "@/components/button-styles";
import {
  PLATFORM_LABELS,
  PLATFORM_ICONS,
  CONTENT_STATUS_LABELS,
  CONTENT_PURPOSE_LABELS,
  CONTENT_PURPOSE_ICONS,
  isApprovalPending,
  type ContentPlatform,
  type ContentStatus,
  type ContentPurpose,
} from "@/lib/marketing";
import { updateContent, deleteContent, reviewContent } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

type ContentItem = {
  id: string;
  title: string;
  platform: ContentPlatform;
  scheduled_date: string;
  status: ContentStatus;
  purpose: ContentPurpose;
  needs_review: boolean;
  approved: boolean;
  review_note: string;
  notes: string;
  assignee_employee_id: string | null;
};
type Assignee = { id: string; name: string; color_hex: string };

const STATUS_PILL: Record<ContentStatus, string> = {
  pomysl: "bg-zinc-100 text-zinc-600",
  w_przygotowaniu: "bg-amber-100 text-amber-700",
  gotowe: "bg-sky-100 text-sky-700",
  opublikowane: "bg-emerald-100 text-emerald-700",
};

// Chip w siatce kalendarza otwiera pełną edycję jako PŁYWAJĄCE OKNO (Modal),
// zamiast rozwijać się w miejscu — kolumna dnia w siatce jest za wąska, żeby
// pomieścić cały formularz czytelnie (patrz zgłoszenie usera: pola i tekst
// ścieśnione w komórce 1/7 szerokości).
export function ContentItemChip({
  item,
  assignees,
  hasLinkedTask,
  isAdmin,
  today,
}: {
  item: ContentItem;
  assignees: Assignee[];
  hasLinkedTask: boolean;
  isAdmin: boolean;
  // Dzisiejsza data (z serwera, nie z zegara przeglądarki) — potrzebna do
  // isApprovalPending, żeby pokazać dokładnie to samo, co i tak wymusza
  // serwer przy próbie publikacji.
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewNoteDraft, setReviewNoteDraft] = useState(item.review_note);
  const assignee = item.assignee_employee_id ? assignees.find((a) => a.id === item.assignee_employee_id) : null;
  const published = item.status === "opublikowane";
  const pendingApproval = isApprovalPending(item, today);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateContent(new FormData(e.currentTarget));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Usunąć "${item.title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("id", item.id);
      await deleteContent(fd);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
      setBusy(false);
    }
  }

  async function handleReview(approved: boolean) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("id", item.id);
      fd.set("approved", String(approved));
      fd.set("review_note", reviewNoteDraft);
      await reviewContent(fd);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium ${STATUS_PILL[item.status]} ${published ? "line-through opacity-70" : ""}`}
      >
        {PLATFORM_ICONS[item.platform]} {CONTENT_PURPOSE_ICONS[item.purpose]} {item.title}
        {hasLinkedTask && <span title="Ma powiązane zadanie w Zadaniach"> 📋</span>}
        {pendingApproval && <span title="Czeka na akceptację"> ⏳</span>}
      </button>

      {open && (
        <Modal title="Edytuj treść" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_PILL[item.status]}`}>{CONTENT_STATUS_LABELS[item.status]}</p>
              <p className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">{CONTENT_PURPOSE_LABELS[item.purpose]}</p>
            </div>
            {assignee && (
              <span className="flex items-center gap-1.5 text-sm text-zinc-600">
                <ColorDot color={assignee.color_hex} />
                {assignee.name}
              </span>
            )}
            {hasLinkedTask && <p className="text-xs text-zinc-500">📋 Ma powiązane zadanie w zakładce Zadania.</p>}

            {/* Akceptacja — tylko dla treści oznaczonych needs_review. Nie
                blokuje bezterminowo: patrz isApprovalPending, blokada sama
                znika w dniu publikacji, więc komunikat mówi o tym wprost
                zamiast tylko "czeka". */}
            {item.needs_review && (
              <div className={`rounded-xl border p-2.5 text-xs ${item.approved ? "border-emerald-200 bg-emerald-50" : pendingApproval ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-zinc-50"}`}>
                <p className="font-semibold text-zinc-800">
                  {item.approved ? "✅ Zaakceptowane przez admina" : pendingApproval ? `⏳ Czeka na akceptację — automatycznie dopuszczona ${item.scheduled_date}, jeśli nikt wcześniej nie zareaguje.` : "Nie zaakceptowane, ale termin publikacji już minął/jest dziś — można publikować."}
                </p>
                {item.review_note && <p className="mt-1 whitespace-pre-wrap text-zinc-600">💬 {item.review_note}</p>}
                {isAdmin && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <textarea
                      value={reviewNoteDraft}
                      onChange={(e) => setReviewNoteDraft(e.target.value)}
                      rows={2}
                      placeholder="Uwaga do autora (opcjonalnie)"
                      className={`${INPUT} !py-1.5 text-xs`}
                    />
                    <div className="flex gap-1.5">
                      <button type="button" disabled={busy} onClick={() => handleReview(true)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                        ✅ Zaakceptuj
                      </button>
                      <button type="button" disabled={busy} onClick={() => handleReview(false)} className="rounded-lg bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-300 disabled:opacity-50">
                        Zostaw uwagę
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && <Banner variant="error">{error}</Banner>}

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={item.id} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-900">Tytuł</label>
                <input name="title" defaultValue={item.title} required className={INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-900">Platforma</label>
                  <select name="platform" defaultValue={item.platform} className={INPUT}>
                    {(Object.entries(PLATFORM_LABELS) as [ContentPlatform, string][]).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-900">Status</label>
                  <select name="status" defaultValue={item.status} className={INPUT}>
                    {(Object.entries(CONTENT_STATUS_LABELS) as [ContentStatus, string][]).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-900">Cel materiału</label>
                  <select name="purpose" defaultValue={item.purpose} className={INPUT}>
                    {(Object.entries(CONTENT_PURPOSE_LABELS) as [ContentPurpose, string][]).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-900">Data publikacji</label>
                  <input type="date" name="scheduled_date" defaultValue={item.scheduled_date} required className={INPUT} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" name="needs_review" defaultChecked={item.needs_review} className="h-4 w-4" />
                Treść pisana — wymaga akceptacji Krzysztofa przed publikacją
              </label>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-900">Przypisane do</label>
                <select name="assignee_employee_id" defaultValue={item.assignee_employee_id ?? ""} className={INPUT}>
                  <option value="">— nieprzypisane —</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-900">Notatki</label>
                <textarea name="notes" defaultValue={item.notes} rows={3} className={INPUT} />
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={busy} className={BTN_PRIMARY}>
                  {busy ? "Zapisywanie…" : "Zapisz"}
                </button>
                <button type="button" onClick={handleDelete} disabled={busy} className={BTN_GHOST_DANGER}>
                  Usuń
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
