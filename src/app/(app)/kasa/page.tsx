import { requireEmployee, canAccessKasa } from "@/lib/session";
import { Card } from "@/components/Card";

// Moduł Kasa jest w przebudowie na v1 (SPEC_kasa_v1.md, 10.11.2026) — stary
// ekran liczył wpływy ręcznie, nowy liczy je automatycznie z transakcji
// eFitness (patrz lib/kasa-import.ts, lib/kasa.ts). Import z Excela już
// działa (patrz /admin/kasa), ekran "Kasa – dziś" z liczeniami i
// zamknięciem dnia jeszcze nie.
export default async function KasaPage() {
  const employee = await requireEmployee();
  if (!canAccessKasa(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do Kasy.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">💰 Kasa</h1>
        <p className="text-sm text-zinc-500">Moduł w przebudowie na v1.</p>
      </div>
      <Card className="text-center text-sm text-zinc-500">
        Ekran „Kasa – dziś” (liczenia, zamknięcie dnia, KW/KP) jest w budowie. Import danych z eFitness już działa w panelu admina.
      </Card>
    </div>
  );
}
