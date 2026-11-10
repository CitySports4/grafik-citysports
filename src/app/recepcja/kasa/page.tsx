import { CashDayScreen } from "@/app/(app)/kasa/CashDayScreen";
import { today } from "@/app/(app)/kasa/data";

// Bramka PIN-em już w /recepcja/layout.tsx. Bez osobistej sesji — liczący
// wybierany z osób na dzisiejszej zmianie (patrz getEmployeesOnShift),
// bez linku do Historii (cofnięcie zamknięcia dnia zostaje tylko dla
// admina po osobistym zalogowaniu w /kasa/historia).
export default async function RecepcjaKasaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today();

  return <CashDayScreen date={date} basePath="/recepcja/kasa" employee={null} />;
}
