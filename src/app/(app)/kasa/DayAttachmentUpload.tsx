"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Banner } from "@/components/Banner";
import { BTN_PRIMARY, BTN_SECONDARY_SM } from "@/components/button-styles";
import { ATTACHMENT_KIND_LABELS, type AttachmentKind } from "@/lib/kasa";
import { addDayAttachment } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";

export function DayAttachmentUpload({ cashDayId }: { cashDayId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await addDayAttachment(new FormData(e.currentTarget));
    setBusy(false);
    if (result.ok) {
      setOpen(false);
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BTN_SECONDARY_SM}>
        + Załącznik
      </button>

      {open && (
        <Modal title="Nowy załącznik dnia" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            {error && <Banner variant="error">{error}</Banner>}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input type="hidden" name="cash_day_id" value={cashDayId} />
              <div className="flex flex-col gap-1.5">
                <label className={LABEL}>Rodzaj</label>
                <select name="kind" defaultValue="raport_okresowy" className={INPUT}>
                  {(Object.entries(ATTACHMENT_KIND_LABELS) as [AttachmentKind, string][]).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={LABEL}>Plik</label>
                <input type="file" name="file" accept="image/*,application/pdf" capture="environment" required className={`${INPUT} py-1.5`} />
              </div>
              <div>
                <button type="submit" disabled={busy} className={BTN_PRIMARY}>
                  {busy ? "Zapisywanie…" : "Dodaj załącznik"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
