import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSessionEmployee, isPersonalTrainerOnly, canPreviewPersonalTraining } from "@/lib/session";
import { NavDropdown } from "@/components/NavDropdown";
import { logout } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const employee = await getSessionEmployee();
  if (!employee) {
    redirect("/login");
  }

  // Grupy nawigacji jako prawdziwe rozwijane menu (nie tylko wizualny
  // podział) — Zamiany teraz żyją wewnątrz "Mój grafik", Asystent zdjęty.
  // Godziny pracy wpisuje się teraz bezpośrednio przy swojej zmianie w "Mój
  // grafik" (mniej klikania niż osobna strona) — /godziny zostaje jako
  // działający adres, ale bez własnej pozycji w menu, żeby nie dublować.
  // Zadania to teraz jedna strona (sprzątanie + inne), nie grupa.
  // Ktoś wyłącznie z rolą trenera personalnego nie ma normalnego grafiku
  // zmian ani zadań — po zalogowaniu widzi WYŁĄCZNIE grafik treningów
  // personalnych (patrz app/page.tsx dla przekierowania po loginie).
  const isTrainerOnly = isPersonalTrainerOnly(employee);
  const canSeePersonalTraining = employee.roles.includes("trener_personalny") || canPreviewPersonalTraining(employee);

  const navGroups: { label: string; links: { href: string; label: string }[] }[] = isTrainerOnly
    ? []
    : [
        {
          label: "Grafik",
          links: [
            { href: "/grafik", label: "Mój grafik" },
            { href: "/dyspozycyjnosc", label: "Dyspozycyjność" },
          ],
        },
      ];
  const trailingLinks: { href: string; label: string }[] = [];
  if (!isTrainerOnly) trailingLinks.push({ href: "/zadania", label: "Zadania" });
  if (canSeePersonalTraining) trailingLinks.push({ href: "/treningi-personalne", label: "Treningi personalne" });
  if (employee.roles.includes("admin")) {
    trailingLinks.push({ href: "/admin", label: "Panel admina" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-brand-navy">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={isTrainerOnly ? "/treningi-personalne" : "/grafik"}>
              <Image src="/logo.png" alt="City Sports" width={146} height={32} className="h-8 w-auto" priority />
            </Link>
            <span className="hidden h-6 w-px bg-white/20 sm:block" />
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: employee.colorHex }}
              />
              <span className="font-semibold text-white">{employee.name}</span>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {navGroups.map((group) => (
              <NavDropdown key={group.label} label={group.label} links={group.links} />
            ))}
            {trailingLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-1.5 font-medium text-white/80 hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 font-medium text-white/70 hover:bg-white/10 hover:text-brand-orange"
              >
                Wyloguj
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
