"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Dopełnienie do autoRefreshKasaFromDataLake(): synchronizacja z Data Lake
// leci w tle (after(), żeby nie blokować przejścia między dniami), więc
// pierwszy render po otwarciu ekranu może pokazać dane z przed chwili.
// Renderowany tylko gdy CashDayScreen wie, że synchronizacja faktycznie
// wystartowała (throttling nie zablokował) — czeka chwilę, na tyle długo,
// żeby fetch + upsert zwykle zdążyły się skończyć, i odświeża RSC bez
// klikania. Jeśli synchronizacja akurat trwała dłużej, kolejne przejście na
// inny dzień i tak ją dogoni.
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.refresh(), 1500);
    return () => clearTimeout(timer);
  }, [router]);
  return null;
}
