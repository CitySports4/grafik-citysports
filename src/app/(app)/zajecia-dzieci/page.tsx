import { requireAdmin } from "@/lib/session";
import { KidsClassesContent } from "./KidsClassesContent";

// Pełna konfiguracja (grupy, cennik) — tylko admin. Bieżąca obsługa
// (zgłoszenia, płatności, frekwencja, lista oczekujących) dla recepcji
// żyje pod /recepcja/zajecia-dzieci (kiosk z PIN-em), nie tutaj.
export default async function KidsClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; frekwencja_grupa?: string; frekwencja_miesiac?: string }>;
}) {
  await requireAdmin();
  return <KidsClassesContent searchParams={searchParams} basePath="/zajecia-dzieci" canEditGroups />;
}
