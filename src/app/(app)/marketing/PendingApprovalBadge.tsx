import Link from "next/link";
import { Banner } from "@/components/Banner";
import { getPendingApprovalCount } from "./actions";

// Licznik dla Krzysztofa (propozycja Marketing -> Grafik, 18.11.2026, krok
// 3) — ile treści naprawdę czeka na jego pierwsze spojrzenie, patrz
// getPendingApprovalCount. Tylko dla admina (on jest osobą akceptującą,
// patrz reviewContent) — reszcie zespołu to niczego nie mówi.
export async function PendingApprovalBadge({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return null;
  const { count, nearestDate } = await getPendingApprovalCount();
  if (count === 0) return null;

  const nearestLabel = nearestDate
    ? new Date(nearestDate + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long" })
    : null;

  return (
    <Banner variant="info">
      📝 {count} {count === 1 ? "treść czeka" : "treści czeka"} na Twoją akceptację
      {nearestLabel && ` — najbliższa publikacja ${nearestLabel}`}.{" "}
      <Link href="/marketing?tab=kalendarz" className="font-semibold underline">
        Zobacz w kalendarzu
      </Link>
    </Banner>
  );
}
