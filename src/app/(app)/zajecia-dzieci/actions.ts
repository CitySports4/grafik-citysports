"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, requireAdmin, canManageKidsClasses } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { toDateKey } from "@/lib/schedule-month";
import { SEASON_MONTHS, type KidsClassStatus } from "@/lib/kids-classes";

async function requireKidsClassManager() {
  const employee = await requireEmployee();
  if (!canManageKidsClasses(employee)) {
    throw new Error("Brak uprawnień — ta sekcja jest dostępna dla recepcji i administratora.");
  }
  return employee;
}

// Zmienia status zapisu na grupę. Dla przejść związanych z opłatą po
// próbnych dodatkowo ustawia paid_trial_fee. "Rezygnacja" zwalnia
// FIZYCZNE miejsce w grupie na stałe — automatycznie awansuje najdłużej
// czekające dziecko z listy oczekujących TEJ SAMEJ grupy (jeśli jest).
// "Brak opłaty" traktujemy jako tymczasowe (może wrócić) — miejsce nie
// jest oddawane automatycznie.
export async function changeEnrollmentStatus(formData: FormData) {
  await requireKidsClassManager();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as KidsClassStatus;
  if (!id || !status) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  const patch: Record<string, unknown> = { status };
  if (status === "aktywny") patch.paid_trial_fee = true;
  if (status === "brak_oplaty") patch.paid_trial_fee = false;

  const { data: enrollment, error } = await supabase.from("kids_class_enrollment").update(patch).eq("id", id).select("group_id").single();
  if (error) throw new Error(dbErrorMessage(error));

  if (status === "rezygnacja" && enrollment) {
    const { data: nextInLine } = await supabase
      .from("kids_class_enrollment")
      .select("id")
      .eq("group_id", enrollment.group_id)
      .eq("status", "oczekuje")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (nextInLine) {
      await supabase.from("kids_class_enrollment").update({ status: "aktywny", paid_trial_fee: false }).eq("id", nextInLine.id);
    }
  }

  revalidatePath("/zajecia-dzieci");
}

export async function toggleUsedTrial(formData: FormData) {
  await requireKidsClassManager();
  const id = String(formData.get("id") ?? "");
  const value = formData.get("value") === "true";
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("kids_class_enrollment").update({ used_trial: value }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zajecia-dzieci");
}

// Zaplanowana zmiana grupy "od nowego miesiąca" (domyślnie 1. dzień
// kolejnego miesiąca, ale admin może wybrać inną datę) — stary zapis
// zajmuje miejsce w SWOJEJ grupie aż do dnia przed tą datą, nowy zapis
// (inna grupa) zaczyna dokładnie w tym dniu. Patrz isEnrollmentEffective.
export async function scheduleGroupChange(formData: FormData) {
  await requireKidsClassManager();
  const enrollmentId = String(formData.get("enrollment_id") ?? "");
  const newGroupId = String(formData.get("new_group_id") ?? "");
  const effectiveFrom = String(formData.get("effective_from") ?? "");
  if (!enrollmentId || !newGroupId || !effectiveFrom) throw new Error("Uzupełnij nową grupę i datę.");

  const supabase = createServerSupabaseClient();
  const { data: current } = await supabase
    .from("kids_class_enrollment")
    .select("registration_id, group_id, status")
    .eq("id", enrollmentId)
    .single();
  if (!current) throw new Error("Nie znaleziono zapisu.");
  if (current.group_id === newGroupId) throw new Error("To już jest ta sama grupa.");

  const dayBefore = toDateKey(new Date(new Date(effectiveFrom + "T00:00:00").getTime() - 86400000));

  const { error: closeError } = await supabase
    .from("kids_class_enrollment")
    .update({ effective_until: dayBefore })
    .eq("id", enrollmentId);
  if (closeError) throw new Error(dbErrorMessage(closeError));

  const { error: insertError } = await supabase.from("kids_class_enrollment").insert({
    registration_id: current.registration_id,
    group_id: newGroupId,
    status: current.status === "oczekuje" ? "oczekuje" : "aktywny",
    effective_from: effectiveFrom,
  });
  if (insertError) throw new Error(dbErrorMessage(insertError));

  revalidatePath("/zajecia-dzieci");
}

// Zapisuje jedną zmianę checkboxa płatności za dany miesiąc — jeśli
// dziecko nie ma jeszcze wiersza w kids_class_payment, tworzy go (wszystkie
// miesiące false poza tym jednym).
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

// Ręczna kwota łączna per dziecko — np. zniżka za zapis na 2+ grupy naraz
// (2×/tydz.), zamiast sztywnej sumy cen pojedynczych grup. Puste pole
// czyści nadpisanie i wraca do automatycznej sumy (patrz monthly_fee_override
// w migracji 0047).
export async function setFeeOverride(formData: FormData) {
  await requireKidsClassManager();
  const registrationId = String(formData.get("registration_id") ?? "");
  const raw = String(formData.get("monthly_fee_override") ?? "").trim();
  if (!registrationId) throw new Error("Brak danych.");
  const value = raw === "" ? null : Number(raw);
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new Error("Podaj poprawną, nieujemną kwotę albo zostaw pole puste.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("kids_class_registration").update({ monthly_fee_override: value }).eq("id", registrationId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zajecia-dzieci");
}

export async function toggleAttendance(formData: FormData) {
  await requireKidsClassManager();
  const enrollmentId = String(formData.get("enrollment_id") ?? "");
  const sessionDate = String(formData.get("session_date") ?? "");
  const present = formData.get("present") === "true";
  if (!enrollmentId || !sessionDate) throw new Error("Nieprawidłowe dane.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("kids_class_attendance")
    .upsert({ enrollment_id: enrollmentId, session_date: sessionDate, present }, { onConflict: "enrollment_id,session_date" });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zajecia-dzieci");
}

// Zarządzanie grupami (dzień/godzina/pojemność) — tylko admin, tak jak
// wcześniej zmiana limitów miejsc była zastrzeżona dla admina.
export async function addGroup(formData: FormData) {
  await requireAdmin();
  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const label = String(formData.get("label") ?? "").trim() || null;
  const capacity = Number(formData.get("capacity"));
  const monthlyFee = Number(formData.get("monthly_fee") ?? 0);
  if (
    !Number.isInteger(weekday) ||
    weekday < 0 ||
    weekday > 6 ||
    !startTime ||
    !endTime ||
    !Number.isInteger(capacity) ||
    capacity <= 0 ||
    !Number.isFinite(monthlyFee) ||
    monthlyFee < 0
  ) {
    throw new Error("Uzupełnij dzień, godziny, dodatnią pojemność i nieujemną cenę.");
  }

  const supabase = createServerSupabaseClient();
  const { count } = await supabase.from("kids_class_group").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("kids_class_group").insert({
    weekday,
    start_time: startTime,
    end_time: endTime,
    label,
    capacity,
    monthly_fee: monthlyFee,
    sort_order: count ?? 0,
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zajecia-dzieci");
}

export async function updateGroup(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const label = String(formData.get("label") ?? "").trim() || null;
  const capacity = Number(formData.get("capacity"));
  const monthlyFee = Number(formData.get("monthly_fee") ?? 0);
  if (
    !id ||
    !Number.isInteger(weekday) ||
    weekday < 0 ||
    weekday > 6 ||
    !startTime ||
    !endTime ||
    !Number.isInteger(capacity) ||
    capacity <= 0 ||
    !Number.isFinite(monthlyFee) ||
    monthlyFee < 0
  ) {
    throw new Error("Uzupełnij dzień, godziny, dodatnią pojemność i nieujemną cenę.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("kids_class_group")
    .update({ weekday, start_time: startTime, end_time: endTime, label, capacity, monthly_fee: monthlyFee })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zajecia-dzieci");
}

export async function toggleGroupActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "true") === "true";
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("kids_class_group").update({ active: !active }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zajecia-dzieci");
}
