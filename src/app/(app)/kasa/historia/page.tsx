import { requireEmployee, canAccessKasa } from "@/lib/session";
import { Card } from "@/components/Card";
import { BackLink } from "@/components/BackLink";

// Moduł w przebudowie na v1 — patrz /kasa/page.tsx.
export default async function KasaHistoriaPage() {
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
      <BackLink href="/kasa" label="Kasa" />
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Historia dni kasowych</h1>
        <p className="text-sm text-zinc-500">Moduł w przebudowie na v1.</p>
      </div>
      <Card className="text-center text-sm text-zinc-500">Historia zamkniętych dni będzie dostępna po zbudowaniu ekranu „Kasa – dziś”.</Card>
    </div>
  );
}
