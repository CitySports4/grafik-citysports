"use client";

import { useState, useTransition } from "react";
import { toggleMonthPayment } from "./actions";

// Ten sam problem i to samo rozwiązanie co AttendanceCell — siatka
// dziecko×miesiąc, zwykły <form> na komórkę oznaczał pełny przejazd do
// serwera na każde kliknięcie.
export function PaymentCell({ registrationId, monthIndex, paid }: { registrationId: string; monthIndex: number; paid: boolean }) {
  const [pending, startTransition] = useTransition();
  const [prevPaid, setPrevPaid] = useState(paid);
  const [optimisticPaid, setOptimisticPaid] = useState(paid);

  // Patrz komentarz w AttendanceCell — synchronizacja z propsem PODCZAS
  // renderu, nie w useEffect.
  if (paid !== prevPaid && !pending) {
    setPrevPaid(paid);
    setOptimisticPaid(paid);
  }

  function handleClick() {
    const next = !optimisticPaid;
    setOptimisticPaid(next);
    const formData = new FormData();
    formData.set("registration_id", registrationId);
    formData.set("month_index", String(monthIndex));
    formData.set("value", String(next));
    startTransition(async () => {
      try {
        await toggleMonthPayment(formData);
      } catch {
        setOptimisticPaid(paid);
      }
    });
  }

  return (
    // Patrz komentarz w AttendanceCell — kolumny siatki są zbyt wąskie dla
    // ujemnego marginesu, więc tylko lekko większy kwadrat (20px → 24px).
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={`mx-auto flex h-6 w-6 items-center justify-center rounded border-2 disabled:opacity-60 ${
        optimisticPaid ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300"
      }`}
    >
      {optimisticPaid ? "✓" : ""}
    </button>
  );
}
