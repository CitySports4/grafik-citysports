"use client";

import { useState, type ReactNode } from "react";

// Sekcja rozwijana w karcie publikacji (treść wpisu kalendarza marketingu,
// patrz ContentItemChip) — wypełniona sekcja startuje otwarta, pusta
// zwinięta, żeby od razu było widać, czego jeszcze brakuje, bez klikania w
// każdą po kolei. Stan tylko lokalny (useState), liczony RAZ przy
// zamontowaniu z wartości zapisanych w bazie — nie przelicza się na bieżąco
// podczas pisania w polach (toby wymagało podniesienia stanu z każdego
// CopyField), "domyślne otwarcie" dotyczy tylko stanu startowego.
export function AccordionSection({
  title,
  filledCount,
  totalCount,
  defaultOpen,
  children,
}: {
  title: string;
  filledCount: number;
  totalCount: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-zinc-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="text-sm font-semibold text-zinc-900">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-zinc-500">
          {filledCount}/{totalCount} wypełnione
          <span className={`inline-block transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>
      {open && <div className="flex flex-col gap-3 border-t border-zinc-200 p-3.5">{children}</div>}
    </div>
  );
}
