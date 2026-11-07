"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavDropdown } from "@/components/NavDropdown";

// Drugi wiersz nagłówka — ten sam wzorzec "zakładek" co RecepcjaTabs, żeby
// górne menu wyglądało identycznie w całej appce i w widoku recepcji
// (patrz też NavDropdown, który dzieli ten sam styl aktywnej/nieaktywnej
// zakładki).
export function AppNavTabs({
  navGroups,
  trailingLinks,
}: {
  navGroups: { label: string; links: { href: string; label: string }[] }[];
  trailingLinks: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
      {navGroups.map((group) => (
        <NavDropdown key={group.label} label={group.label} links={group.links} />
      ))}
      {trailingLinks.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              active ? "bg-zinc-50 text-brand-navy" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
