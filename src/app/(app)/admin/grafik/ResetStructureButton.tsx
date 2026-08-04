"use client";

import { useState } from "react";
import { resetMonthStructure } from "./actions";

export function ResetStructureButton({
  scheduleMonthId,
  year,
  month,
}: {
  scheduleMonthId: string;
  year: number;
  month: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (
      !window.confirm(
        "Zresetować dni i zmiany tego miesiąca do aktualnego szablonu? Usunie to WSZYSTKIE przypisania i wydarzenia w tym miesiącu — nie można tego cofnąć."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetMonthStructure(scheduleMonthId, year, month);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        className="self-start rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-red-600 disabled:opacity-50"
      >
        {busy ? "Resetowanie…" : "Zresetuj dni do aktualnego szablonu zmian"}
      </button>
      {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
    </div>
  );
}
