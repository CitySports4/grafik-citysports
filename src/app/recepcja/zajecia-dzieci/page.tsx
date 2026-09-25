import { KidsClassesContent } from "@/app/(app)/zajecia-dzieci/KidsClassesContent";

// Bramka PIN-em już w /recepcja/layout.tsx — tu nic dodatkowego. Recepcja
// ma tu pełną obsługę bieżącą (zgłoszenia, płatności, frekwencja, lista
// oczekujących, zmiana grupy dziecku), ale nie konfigurację grup/cennika —
// to zostaje tylko dla admina w pełnej appce (/zajecia-dzieci).
export default async function RecepcjaZajeciaDzieciPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; frekwencja_grupa?: string; frekwencja_miesiac?: string }>;
}) {
  return <KidsClassesContent searchParams={searchParams} basePath="/recepcja/zajecia-dzieci" canEditGroups={false} />;
}
