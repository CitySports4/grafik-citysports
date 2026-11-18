"use client";

import { useState } from "react";
import { BTN_SECONDARY_SM } from "@/components/button-styles";

const TEXTAREA =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

// Pole gotowej treści z przyciskiem "Kopiuj" — ten sam wzorzec co szablon
// importu (patrz ImportFromFile.tsx), tylko jako edytowalne pole formularza,
// nie readOnly. Zapisuje się jak zwykłe pole tekstowe (name), kopiowanie to
// tylko wygoda przy wklejaniu w Facebooku/Instagramie, nie osobny stan.
export function CopyField({ name, label, defaultValue, rows = 2 }: { name: string; label: string; defaultValue: string; rows?: number }) {
  const [value, setValue] = useState(defaultValue);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API może nie działać — treść jest i tak w polu, da się
      // zaznaczyć ręcznie.
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-semibold text-zinc-900">{label}</label>
        <button type="button" onClick={handleCopy} className={BTN_SECONDARY_SM}>
          {copied ? "✓ Skopiowano" : "Kopiuj"}
        </button>
      </div>
      <textarea name={name} value={value} onChange={(e) => setValue(e.target.value)} rows={rows} className={TEXTAREA} />
    </div>
  );
}
