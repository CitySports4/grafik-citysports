import { today } from "@/app/(app)/kasa/data";
import { CashDayScreen } from "@/app/(app)/kasa/CashDayScreen";

// Bramka PIN-em już w /recepcja/layout.tsx. Bez linku do Historii — cofnięcie
// zamknięcia dnia zostaje tylko dla admina po osobistym zalogowaniu (patrz
// reopenCashDay w app/(app)/kasa/actions.ts, requireAdmin), nie dla
// wspólnego stanowiska kioskowego bez żadnej tożsamości.
export default async function RecepcjaKasaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today();

  return <CashDayScreen date={date} basePath="/recepcja/kasa" />;
}
