import { NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";
import { syncKasaFromDataLake } from "@/app/(app)/admin/kasa/actions";

// Backstop niezależny od otwartych zakładek (patrz autoRefreshKasaFromDataLake
// w admin/kasa/actions.ts) — ta ścieżka celowo NIE chowa błędu: odkryliśmy
// 14.11.2026, że brak DATALAKE_* w środowisku produkcyjnym mógł stać
// niezauważony tygodniami, bo autoRefreshKasaFromDataLake połyka błędy z
// definicji (zepsuta synchronizacja w tle nie może wywalić ekranu Kasy).
// Nieudane zadanie crona jest widoczne w logach Vercel — to pierwszy
// rzeczywisty sygnał, gdyby to się powtórzyło.
export async function GET(request: Request) {
  try {
    assertCronSecret(request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await syncKasaFromDataLake();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Synchronizacja nieudana" }, { status: 500 });
  }
}
