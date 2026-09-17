"use client";

import { useState, useTransition } from "react";

// Prosty przełącznik opłacone/nieopłacone dla recepcji/admina — bez
// wpisywania kwoty (liczona zawsze jako stawka × liczba osób, patrz
// sessionAmount). Zmienia się od razu po kliknięciu, bez osobnego "Zapisz".
export function SettleToggle({
  sessionId,
  initialSettled,
  toggleAction,
}: {
  sessionId: string;
  initialSettled: boolean;
  toggleAction: (formData: FormData) => Promise<void>;
}) {
  const [settled, setSettled] = useState(initialSettled);
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.5 text-xs font-semibold">
      <input
        type="checkbox"
        checked={settled}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setSettled(next);
          startTransition(async () => {
            const fd = new FormData();
            fd.set("id", sessionId);
            if (next) fd.set("is_settled", "on");
            try {
              await toggleAction(fd);
            } catch {
              setSettled(!next);
            }
          });
        }}
        className="h-3.5 w-3.5"
      />
      <span className={settled ? "text-emerald-700" : "text-zinc-500"}>{settled ? "✓ rozliczone" : "nierozliczone"}</span>
    </label>
  );
}
