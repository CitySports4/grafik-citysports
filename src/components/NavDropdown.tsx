"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Grupa nawigacji rozwijana kliknięciem (nie hover, żeby działało też na
// dotyku) — z zamykaniem po kliknięciu poza nią lub wyborze pozycji. Styl
// przycisku to ta sama "zakładka", co w RecepcjaTabs — jedno i drugie menu
// ma teraz wyglądać identycznie, patrz AppNavTabs.
//
// Panel rozwijany renderowany PORTALEM do <body>, pozycjonowany na sztywno
// (position: fixed) względem przycisku, zamiast zwykłego "absolute" wewnątrz
// paska zakładek. Pasek zakładek ma overflow-x-auto (żeby przewijał się sam,
// a nie wypychał całą stronę w bok na wąskim ekranie) — a to w CSS wymusza
// też overflow-y: auto na tym samym elemencie, więc zwykły "absolute" panel
// byłby obcięty do wysokości paska i dostawałby własny, mylący suwak. Portal
// wychodzi poza ten kontener, więc problem znika.
export function NavDropdown({ label, links }: { label: string; links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const active = links.some((l) => pathname.startsWith(l.href));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("click", onClick);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
          active ? "bg-zinc-50 text-brand-navy" : "text-white/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        {label}
        <span className={`text-[9px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 min-w-[190px] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
          >
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
          </div>,
          document.body
        )}
    </>
  );
}
