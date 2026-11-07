"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Grupa nawigacji rozwijana kliknięciem (nie hover, żeby działało też na
// dotyku) — z zamykaniem po kliknięciu poza nią lub wyborze pozycji. Styl
// przycisku to ta sama "zakładka", co w RecepcjaTabs — jedno i drugie menu
// ma teraz wyglądać identycznie, patrz AppNavTabs.
export function NavDropdown({ label, links }: { label: string; links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const active = links.some((l) => pathname.startsWith(l.href));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
          active ? "bg-zinc-50 text-brand-navy" : "text-white/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        {label}
        <span className={`text-[9px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[190px] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
