import { CardLink } from "@/components/Card";

const SECTION_LABEL = "mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400";

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className={SECTION_LABEL}>Grafik</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardLink href="/admin/grafik">
            <h2 className="font-semibold text-zinc-900">Układanie grafiku</h2>
            <p className="mt-1 text-sm text-zinc-500">Generowanie i edycja grafiku miesięcznego.</p>
          </CardLink>
          <CardLink href="/admin/zmiany">
            <h2 className="font-semibold text-zinc-900">Konfiguracja zmian</h2>
            <p className="mt-1 text-sm text-zinc-500">Domyślne zmiany per dzień tygodnia i reguły cykliczne.</p>
          </CardLink>
          <CardLink href="/admin/zamiany">
            <h2 className="font-semibold text-zinc-900">Zamiany zmian</h2>
            <p className="mt-1 text-sm text-zinc-500">Akceptacja/odrzucanie próśb o zamianę.</p>
          </CardLink>
          <CardLink href="/admin/dyspozycyjnosc">
            <h2 className="font-semibold text-zinc-900">Dyspozycyjność zespołu</h2>
            <p className="mt-1 text-sm text-zinc-500">Kto i kiedy jest niedostępny — cały zespół na jednym widoku.</p>
          </CardLink>
        </div>
      </div>

      <div>
        <h2 className={SECTION_LABEL}>Pracownicy i płace</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardLink href="/admin/pracownicy">
            <h2 className="font-semibold text-zinc-900">Pracownicy</h2>
            <p className="mt-1 text-sm text-zinc-500">Dodawanie, kolory, minimalne/docelowe godziny.</p>
          </CardLink>
          <CardLink href="/admin/wynagrodzenia">
            <h2 className="font-semibold text-zinc-900">Wynagrodzenia</h2>
            <p className="mt-1 text-sm text-zinc-500">Recepcja: godziny × stawka, zgodność z grafikiem. Instruktorzy: kalkulator z raportu frekwencji.</p>
          </CardLink>
          <CardLink href="/admin/godziny">
            <h2 className="font-semibold text-zinc-900">Godziny pracy</h2>
            <p className="mt-1 text-sm text-zinc-500">Edycja historii godzin dowolnego pracownika, bez limitu 7 dni.</p>
          </CardLink>
        </div>
      </div>

      <div>
        <h2 className={SECTION_LABEL}>Sprzątanie</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardLink href="/admin/sprzatanie">
            <h2 className="font-semibold text-zinc-900">Konfiguracja sprzątania</h2>
            <p className="mt-1 text-sm text-zinc-500">Strefy, zadania, checklisty, kompetencje sprzątania per osoba.</p>
          </CardLink>
        </div>
      </div>
    </div>
  );
}
