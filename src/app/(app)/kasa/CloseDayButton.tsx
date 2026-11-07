"use client";

import { useState } from "react";
import { Banner } from "@/components/Banner";
import { BTN_PRIMARY } from "@/components/button-styles";
import { closeCashDay } from "./actions";

export function CloseDayButton({ cashDayId }: { cashDayId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleClose() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("cash_day_id", cashDayId);
    const result = await closeCashDay(fd);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <Banner variant="error">{error}</Banner>}
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-600">Zamknięcia dnia nie da się cofnąć bez admina — na pewno?</span>
          <button type="button" onClick={handleClose} disabled={busy} className={BTN_PRIMARY}>
            {busy ? "Zamykanie…" : "Tak, zamknij dzień"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-sm font-semibold text-zinc-500 hover:underline">
            Anuluj
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`self-start ${BTN_PRIMARY}`}>
          Zamknij dzień
        </button>
      )}
    </div>
  );
}
