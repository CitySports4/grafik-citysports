"use client";

import { useState, useTransition } from "react";
import { toggleAttendance } from "./actions";

// Zwykły <form action={...}> na każdą komórkę oznaczał pełny przejazd do
// serwera (i ponowne odpytanie WSZYSTKICH danych strony — grup, zapisów,
// płatności) na KAŻDE kliknięcie — przy siatce dziecko×data (np. 9
// dzieci × 4 daty) to było wyraźnie odczuwalne. Tu zmieniamy wygląd OD
// RAZU (optymistycznie), a zapis do bazy leci w tle przez startTransition.
export function AttendanceCell({ enrollmentId, sessionDate, present }: { enrollmentId: string; sessionDate: string; present: boolean | null }) {
  const [pending, startTransition] = useTransition();
  const [prevPresent, setPrevPresent] = useState(present);
  const [optimisticPresent, setOptimisticPresent] = useState(present);

  // Odświeżony `present` z serwera (np. po zakończeniu zapisu) synchronizujemy
  // PODCZAS renderu, nie w useEffect — tak zaleca React dla stanu wyliczanego
  // z propsów (unika dodatkowego, kaskadowego re-renderu).
  if (present !== prevPresent && !pending) {
    setPrevPresent(present);
    setOptimisticPresent(present);
  }

  function handleClick() {
    const next = optimisticPresent !== true;
    setOptimisticPresent(next);
    const formData = new FormData();
    formData.set("enrollment_id", enrollmentId);
    formData.set("session_date", sessionDate);
    formData.set("present", String(next));
    startTransition(async () => {
      try {
        await toggleAttendance(formData);
      } catch {
        setOptimisticPresent(present);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={optimisticPresent === null ? "nieoznaczone" : optimisticPresent ? "obecny" : "nieobecny"}
      className={`mx-auto flex h-5 w-5 items-center justify-center rounded border-2 disabled:opacity-60 ${
        optimisticPresent === true
          ? "border-emerald-600 bg-emerald-600 text-white"
          : optimisticPresent === false
            ? "border-red-400 bg-red-50 text-red-500"
            : "border-zinc-300"
      }`}
    >
      {optimisticPresent === true ? "✓" : optimisticPresent === false ? "✕" : ""}
    </button>
  );
}
