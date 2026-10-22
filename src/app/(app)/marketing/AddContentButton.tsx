"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Banner } from "@/components/Banner";
import { BTN_PRIMARY } from "@/components/button-styles";
import { PLATFORM_LABELS, type ContentPlatform } from "@/lib/marketing";
import { createContent } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

type Assignee = { id: string; name: string; color_hex: string };

export function AddContentButton({ date, dateLabel, assignees }: { date: string; dateLabel: string; assignees: Assignee[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createContent(new FormData(e.currentTarget));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-auto text-left text-[11px] font-semibold text-brand-orange">
        + Dodaj
      </button>

      {open && (
        <Modal title={`Nowa treść — ${dateLabel}`} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            {error && <Banner variant="error">{error}</Banner>}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input type="hidden" name="scheduled_date" value={date} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-900">Tytuł</label>
                <input name="title" required autoFocus className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-900">Platforma</label>
                <select name="platform" defaultValue="instagram" className={INPUT}>
                  {(Object.entries(PLATFORM_LABELS) as [ContentPlatform, string][]).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-900">Przypisane do</label>
                <select name="assignee_employee_id" defaultValue="" className={INPUT}>
                  <option value="">— nieprzypisane —</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <button type="submit" disabled={busy} className={BTN_PRIMARY}>
                  {busy ? "Dodawanie…" : "Dodaj"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
