"use client";

import { useState } from "react";
import { Banner } from "@/components/Banner";
import { BTN_PRIMARY } from "@/components/button-styles";
import { closeCashDay } from "./actions";

type Employee = { id: string; name: string };

export function CloseDayButton({ cashDayId, employeesOnShift }: { cashDayId: string; employeesOnShift: Employee[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [employeeId, setEmployeeId] = useState("");

  async function handleClose() {
    if (!employeeId) {
      setError("Wybierz, kto zamyka dzień.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("cash_day_id", cashDayId);
    fd.set("employee_id", employeeId);
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-600">Kto zamyka dzień?</span>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">— wybierz —</option>
            {employeesOnShift.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
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
