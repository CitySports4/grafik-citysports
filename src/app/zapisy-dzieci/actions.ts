"use server";

import { createServerSupabaseClient } from "@/lib/supabase";
import { dbErrorMessage } from "@/lib/db-error";
import { normalizePhone } from "@/lib/phone";
import { toDateKey } from "@/lib/schedule-month";
import { checkAgeEligibility, computeGroupOccupancy, hasGroupCapacity, groupLabel, type KidsClassGroup, type Enrollment } from "@/lib/kids-classes";

export type SignupInput = {
  childName: string;
  birthDate: string;
  parentName: string;
  phone: string;
  whatsappContact: boolean;
  groupIds: string[];
  hasExperience: boolean;
  rodoConsent: boolean;
  termsConsent: boolean;
};

export type SignupResult =
  | { ok: true; groupResults: { label: string; waitlisted: boolean }[] }
  | { ok: false; error: string };

// Publiczny formularz zapisu — bez logowania (requireEmployee), tak jak
// dawny formularz w Google Apps Script. Walidacja wieku i limitów miejsc
// PO STRONIE SERWERA (patrz kids-classes.ts) — pola formularza to tylko
// wygoda dla rodzica, nie źródło prawdy. Dziecko może wybrać kilka grup
// naraz — każda dostaje SWÓJ status (nowe/oczekuje) niezależnie od reszty.
export async function submitRegistration(input: SignupInput): Promise<SignupResult> {
  const childName = input.childName.trim();
  const parentName = input.parentName.trim();
  const phone = normalizePhone(input.phone);

  if (!childName || !parentName || !phone || !input.birthDate || input.groupIds.length === 0) {
    return { ok: false, error: "Wypełnij wszystkie wymagane pola i wybierz przynajmniej jedną grupę." };
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
  const [{ data: groupsData }, { data: enrollmentsData }] = await Promise.all([
    supabase.from("kids_class_group").select("id, weekday, start_time, end_time, label, capacity, active, sort_order, monthly_fee").in("id", input.groupIds),
    supabase.from("kids_class_enrollment").select("id, group_id, status, effective_from, effective_until"),
  ]);
  const groups = (groupsData ?? []) as KidsClassGroup[];
  if (groups.length !== input.groupIds.length) {
    return { ok: false, error: "Wybrana grupa już nie istnieje — odśwież stronę i spróbuj ponownie." };
  }
  const occupancy = computeGroupOccupancy((enrollmentsData ?? []) as Enrollment[], today);

  const { data: registration, error: registrationError } = await supabase
    .from("kids_class_registration")
    .insert({
      child_name: childName,
      birth_date: input.birthDate,
      parent_name: parentName,
      phone,
      whatsapp_contact: input.whatsappContact,
      has_experience: input.hasExperience,
      rodo_consent: input.rodoConsent,
      terms_consent: input.termsConsent,
    })
    .select("id")
    .single();
  if (registrationError || !registration) return { ok: false, error: dbErrorMessage(registrationError) };

  const groupResults: { label: string; waitlisted: boolean }[] = [];
  const enrollmentRows = groups.map((g) => {
    const fits = hasGroupCapacity(g, occupancy);
    // Kolejne wybrane grupy w TYM SAMYM zgłoszeniu liczą się do siebie
    // nawzajem — bez tego dwoje rodzeństwa zapisywanych naraz do tej samej
    // prawie pełnej grupy mogłoby oboje "zmieścić się" mimo jednego miejsca.
    occupancy.set(g.id, (occupancy.get(g.id) ?? 0) + (fits ? 1 : 0));
    groupResults.push({ label: groupLabel(g), waitlisted: !fits });
    return { registration_id: registration.id, group_id: g.id, status: fits ? "nowe" : "oczekuje" };
  });

  const { error: enrollmentError } = await supabase.from("kids_class_enrollment").insert(enrollmentRows);
  if (enrollmentError) return { ok: false, error: dbErrorMessage(enrollmentError) };

  return { ok: true, groupResults };
}
