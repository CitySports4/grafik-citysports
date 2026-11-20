"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { loadMonthReport } from "@/lib/kasa-month";

// Zamknięcie miesiąca: wszystkie dni kasowe muszą być zamknięte. Nadaje
// kolejny numer RK (ciągły: max dotąd + 1, pierwszy = 1) i zapisuje saldo
// otwarcia (pierwszy dzień) oraz zamknięcia (ostatni policzony dzień).
export async function closeCashMonth(formData: FormData) {
  await requireAdmin();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!year || !month) throw new Error("Brak miesiąca.");

  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase.from("cash_months").select("id, status").eq("year", year).eq("month", month).maybeSingle();
  if (existing?.status === "closed") throw new Error("Ten miesiąc jest już zamknięty.");

  const report = await loadMonthReport(year, month);
  if (report.days.length === 0) throw new Error("Brak dni kasowych w tym miesiącu.");
  const openDays = report.days.filter((d) => d.status !== "closed");
  if (openDays.length > 0) throw new Error(`Nie wszystkie dni są zamknięte (otwarte: ${openDays.length}).`);

  const { data: lastRk } = await supabase.from("cash_months").select("rk_number").not("rk_number", "is", null).order("rk_number", { ascending: false }).limit(1).maybeSingle();
  const rkNumber = (lastRk?.rk_number ?? 0) + 1;
  const lastCounted = [...report.days].reverse().find((d) => d.countedClose !== null) ?? null;

  const row = {
    year,
    month,
    rk_number: rkNumber,
    opening_balance: report.days[0].openingBalance,
    closing_balance: lastCounted?.countedClose ?? null,
    status: "closed" as const,
    closed_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("cash_months").upsert(row, { onConflict: "year,month" });
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/kasa/miesiac");
}
