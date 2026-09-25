"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/recepcja", label: "Grafik pracy" },
  { href: "/recepcja/zadania", label: "Zadania sprzątania" },
  { href: "/recepcja/treningi", label: "Treningi personalne" },
  { href: "/recepcja/zajecia-dzieci", label: "Zajęcia dla dzieci" },
];

export function RecepcjaTabs() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-5xl gap-1 px-4">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
              active ? "bg-zinc-50 text-brand-navy" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
