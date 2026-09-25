"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, requireAdmin, canManageKidsClasses } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { SEASON_MONTHS, type KidsClassStatus } from "@/lib/kids-classes";

async function requireKidsClassManager() {
  const employee = await requireEmployee();
  if (!canManageKidsClasses(employee)) {
    throw new Error("Brak uprawnień — ta sekcja jest dostępna dla recepcji i administratora.");
  }
  return employee;
}

// Zmienia status zgłoszenia. Dla przejść związanych z opłatą po próbnych
// dodatkowo ustawia paid_trial_fee — spójnie z dawnym panelZmienStatus.
export async function changeRegistrationStatus(formData: FormData) {
  await requireKidsClassManager();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as KidsClassStatus;
  if (!id || !status) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  const patch: Record<string, unknown> = { status };
  if (status === "aktywny") patch.paid_trial_fee = true;
  if (status === "brak_oplaty") patch.paid_trial_fee = false;

  const { error } = await supabase.from("kids_class_registration").update(patch).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zajecia-dzieci");
}

export async function toggleUsedTrial(formData: FormData) {
  await requireKidsClassManager();
  const id = String(formData.get("id") ?? "");
  const value = formData.get("value") === "true";
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("kids_class_registration").update({ used_trial: value }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zajecia-dzieci");
}

// Zapisuje jedną zmianę checkboxa płatności za dany miesiąc — jeśli
// dziecko nie ma jeszcze wiersza w kids_class_payment, tworzy go (wszystkie
// miesiące false poza tym jednym), tak jak dawny panelZapiszPlatnosc.
export async function toggleMonthPayment(formData: FormData) {
  await requireKidsClassManager();
  const registrationId = String(formData.get("registration_id") ?? "");
  const monthIndex = Number(formData.get("month_index"));
  const value = formData.get("value") === "true";
  if (!registrationId || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= SEASON_MONTHS.length) {
    throw new Error("Nieprawidłowe dane.");
  }

  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("kids_class_payment")
    .select("months")
    .eq("registration_id", registrationId)
    .maybeSingle();

  const months: boolean[] = existing?.months ?? new Array(SEASON_MONTHS.length).fill(false);
  months[monthIndex] = value;

  const { error } = await supabase
    .from("kids_class_payment")
    .upsert({ registration_id: registrationId, months }, { onConflict: "registration_id" });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zajecia-dzieci");
}

// Limity miejsc — tylko admin, tak jak w dawnym systemie zmiana Ustawień
// była osobną, "ważniejszą" operacją niż codzienna obsługa zgłoszeń.
export async function setKidsClassLimits(formData: FormData) {
  await requireAdmin();
  const limitPoniedzialek = Number(formData.get("limit_poniedzialek"));
  const limitCzwartek = Number(formData.get("limit_czwartek"));
  if (!Number.isInteger(limitPoniedzialek) || limitPoniedzialek <= 0 || !Number.isInteger(limitCzwartek) || limitCzwartek <= 0) {
    throw new Error("Podaj poprawne, dodatnie liczby.");
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("kids_class_settings")
    .update({ limit_poniedzialek: limitPoniedzialek, limit_czwartek: limitCzwartek })
    .eq("id", true);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zajecia-dzieci");
}
