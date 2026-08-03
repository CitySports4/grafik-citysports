"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

// Pokazuje krótki, widoczny komunikat potwierdzający tuż po zapisaniu
// formularza — bez tego zwykłe `<form action={...}>` po prostu odświeża
// dane w tle i użytkownik nie wie, czy coś się w ogóle zapisało.
export function SubmitButton({
  children,
  savedText = "Zapisano",
  pendingText,
  className,
  disabled,
}: {
  children: React.ReactNode;
  savedText?: string;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const [showSaved, setShowSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    const finished = wasPending.current && !pending;
    wasPending.current = pending;
    if (finished) {
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 2500);
      return () => clearTimeout(t);
    }
  }, [pending]);

  return (
    <span className="inline-flex items-center gap-2">
      <button type="submit" disabled={pending || disabled} className={className}>
        {pending ? (pendingText ?? "Zapisywanie…") : children}
      </button>
      {showSaved && (
        <span className="animate-pulse text-sm font-semibold text-emerald-600">
          ✓ {savedText}
        </span>
      )}
    </span>
  );
}
