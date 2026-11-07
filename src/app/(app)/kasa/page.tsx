import { requireEmployee, canAccessKasa } from "@/lib/session";
import { today } from "./data";
import { CashDayScreen } from "./CashDayScreen";

export default async function KasaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const employee = await requireEmployee();
  if (!canAccessKasa(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do Kasy.</p>
      </div>
    );
  }

  const params = await searchParams;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today();

  return <CashDayScreen date={date} basePath="/kasa" historiaHref="/kasa/historia" />;
}
