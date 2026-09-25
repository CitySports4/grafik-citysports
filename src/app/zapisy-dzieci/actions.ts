"use server";

import { createServerSupabaseClient } from "@/lib/supabase";
import { dbErrorMessage } from "@/lib/db-error";
import { normalizePhone } from "@/lib/phone";
import { toDateKey } from "@/lib/schedule-month";
import { checkAgeEligibility, computeOccupancy, hasCapacity, type KidsClassGroup, type KidsClassStatus } from "@/lib/kids-classes";

export type SignupInput = {
  childName: string;
  birthDate: string;
  parentName: string;
  phone: string;
  email: string;
  whatsappContact: boolean;
  groupChoice: KidsClassGroup;
  hasExperience: boolean;
  rodoConsent: boolean;
  termsConsent: boolean;
};

export type SignupResult = { ok: true; waitlisted: boolean } | { ok: false; error: string };

// Publiczny formularz zapisu — bez logowania (requireEmployee), tak jak
// dawny formularz w Google Apps Script. Walidacja wieku i limitów miejsc
// PO STRONIE SERWERA (patrz kids-classes.ts) — pola formularza to tylko
// wygoda dla rodzica, nie źródło prawdy.
export async function submitRegistration(input: SignupInput): Promise<SignupResult> {
  const childName = input.childName.trim();
  const parentName = input.parentName.trim();
  const phone = normalizePhone(input.phone);

  if (!childName || !parentName || !phone || !input.birthDate || !input.groupChoice) {
    return { ok: false, error: "Wypełnij wszystkie wymagane pola." };
  }
  if (!input.rodoConsent || !input.termsConsent) {
    return { ok: false, error: "Zaznacz zgodę RODO i akceptację Regulaminu, żeby wysłać zgłoszenie." };
  }

  const today = toDateKey(new Date());
  const eligibility = checkAgeEligibility(input.birthDate, today);
  if (!eligibility.ok) {
    return { ok: false, error: eligibility.reason };
  }

  const supabase = createServerSupabaseClient();
  const [{ data: settings }, { data: registrations }] = await Promise.all([
    supabase.from("kids_class_settings").select("limit_poniedzialek, limit_czwartek").eq("id", true).single(),
    supabase.from("kids_class_registration").select("group_choice, status"),
  ]);
  const limits = settings ?? { limit_poniedzialek: 8, limit_czwartek: 8 };
  const occupancy = computeOccupancy((registrations ?? []) as { group_choice: KidsClassGroup; status: KidsClassStatus }[]);
  const fits = hasCapacity(input.groupChoice, occupancy, limits);

  const { error } = await supabase.from("kids_class_registration").insert({
    child_name: childName,
    birth_date: input.birthDate,
    parent_name: parentName,
    phone,
    email: input.email.trim() || null,
    whatsapp_contact: input.whatsappContact,
    group_choice: input.groupChoice,
    has_experience: input.hasExperience,
    rodo_consent: input.rodoConsent,
    terms_consent: input.termsConsent,
    status: fits ? "nowe" : "oczekuje",
  });
  if (error) return { ok: false, error: dbErrorMessage(error) };

  return { ok: true, waitlisted: !fits };
}
