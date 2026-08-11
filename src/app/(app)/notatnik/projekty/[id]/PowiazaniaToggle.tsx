"use client";

import { useState } from "react";

export function PowiazaniaToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-zinc-500 hover:text-zinc-800">
        {open ? "Ukryj powiązania ▲" : "Pokaż powiązania ▾"}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
