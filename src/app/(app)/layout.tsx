import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSessionEmployee, isPersonalTrainerOnly, canPreviewPersonalTraining, canAccessMarketing, canAccessKasa } from "@/lib/session";
import { MainContainer } from "@/components/MainContainer";
import { AppNavTabs } from "./AppNavTabs";
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
  // /zadania to jedna strona, wyłącznie sprzątanie — etykieta w menu to
  // "Sprzątanie" (adres zostaje /zadania, żeby nie zrywać istniejących
  // linków). Marketing ma swoje własne, zupełnie osobne zadania pod
  // /marketing (inna tabela, inna rola), niepowiązane z tymi tutaj.
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

  // "Zajęcia" grupuje Treningi personalne + Zajęcia dla dzieci pod jedno
  // rozwijane menu zamiast dwóch osobnych pozycji — dla admina (który widzi
  // oba) to różnica między czterema a trzema pozycjami w górnym pasku. Dla
  // kogoś, kto widzi tylko jedną z nich (np. sam trener personalny), zbędny
  // byłby rozwijany dropdown z jedną pozycją, więc wtedy zostaje zwykłym
  // linkiem. Zajęcia dla dzieci — bieżącą obsługę recepcja robi przez kiosk
  // PIN (/recepcja/zajecia-dzieci), nie stąd; tu zostaje tylko dla admina
  // (konfiguracja grup/cennika).
  const zajeciaLinks: { href: string; label: string }[] = [];
  if (canSeePersonalTraining) zajeciaLinks.push({ href: "/treningi-personalne", label: "Treningi personalne" });
  if (employee.roles.includes("admin")) zajeciaLinks.push({ href: "/zajecia-dzieci", label: "Zajęcia dla dzieci" });
  if (zajeciaLinks.length > 1) navGroups.push({ label: "Zajęcia", links: zajeciaLinks });

  const trailingLinks: { href: string; label: string }[] = [];
  if (!isTrainerOnly) trailingLinks.push({ href: "/zadania", label: "Sprzątanie" });
  if (zajeciaLinks.length === 1) trailingLinks.push(zajeciaLinks[0]);
  if (canAccessMarketing(employee)) trailingLinks.push({ href: "/marketing", label: "Marketing" });
  // Nazwa linku celowo inna niż URL ("Wydarzenia", nie "Projekty") — appka ma
  // już "⚙️ Projekty" wewnątrz Marketingu (projekty marketingowe); dwa różne
  // linki nazwane tak samo byłyby mylące (patrz Sprint D, D2).
  if (canAccessMarketing(employee)) trailingLinks.push({ href: "/projekty", label: "Wydarzenia" });
  if (canAccessKasa(employee)) trailingLinks.push({ href: "/kasa", label: "Kasa" });
  if (employee.roles.includes("admin")) trailingLinks.push({ href: "/admin", label: "Panel admina" });

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
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-brand-orange"
            >
              Wyloguj
            </button>
          </form>
        </div>
        <AppNavTabs navGroups={navGroups} trailingLinks={trailingLinks} />
      </header>
      <MainContainer>{children}</MainContainer>
    </div>
  );
}
