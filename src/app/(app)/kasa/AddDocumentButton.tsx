"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Banner } from "@/components/Banner";
import { BTN_PRIMARY, BTN_SECONDARY_SM } from "@/components/button-styles";
import type { CashDocumentType } from "@/lib/kasa";
import { addCashDocument } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";

export function AddDocumentButton({ cashDayId, type, categories }: { cashDayId: string; type: CashDocumentType; categories: string[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await addCashDocument(new FormData(e.currentTarget));
    setBusy(false);
    if (result.ok) {
      setOpen(false);
    } else {
      setError(result.error);
    }
  }

  const title = type === "KW" ? "Nowy KW — rozchód" : "Nowy KP — przychód";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BTN_SECONDARY_SM}>
        + {type}
      </button>

      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            {error && <Banner variant="error">{error}</Banner>}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input type="hidden" name="cash_day_id" value={cashDayId} />
              <input type="hidden" name="type" value={type} />
              <div className="flex flex-col gap-1.5">
                <label className={LABEL}>{type === "KW" ? "Komu płacimy" : "Od kogo"}</label>
                <input name="counterparty" required autoFocus placeholder="np. Castorama" className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={LABEL}>Kwota (PLN)</label>
                <input type="number" step="0.01" min="0.01" name="amount" required className={INPUT} />
              </div>
              {type === "KW" && (
                <div className="flex flex-col gap-1.5">
                  <label className={LABEL}>Kategoria</label>
                  <select name="category" defaultValue="" className={INPUT}>
                    <option value="">— wybierz —</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className={LABEL}>Numer dokumentu źródłowego (paragon/faktura)</label>
                <input name="source_doc_number" placeholder="np. FV 123/2026" className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={LABEL}>Opis</label>
                <textarea name="description" rows={2} className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={LABEL}>Zdjęcie / skan dokumentu</label>
                <input type="file" name="file" accept="image/*,application/pdf" capture="environment" required className={`${INPUT} py-1.5`} />
              </div>
              <div>
                <button type="submit" disabled={busy} className={BTN_PRIMARY}>
                  {busy ? "Zapisywanie…" : `Dodaj ${type}`}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
