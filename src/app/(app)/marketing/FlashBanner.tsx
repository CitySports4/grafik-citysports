"use client";

import { useEffect, useState } from "react";

export function FlashBanner({ kind, text }: { kind: "ok" | "warn"; text: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  const tone = kind === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800";
  return (
    <p role="status" className={`rounded-xl border px-3 py-2 text-sm font-semibold ${tone}`}>
      {kind === "ok" ? "✓ " : "⏳ "}
      {text}
    </p>
  );
}
