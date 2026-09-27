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
  trialDates: Record<string, string>;
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
  const [{ data: groupsData }, { data: enrollmentsData }, { data: existingByPhone }] = await Promise.all([
    supabase.from("kids_class_group").select("id, weekday, start_time, end_time, label, capacity, active, sort_order").in("id", input.groupIds),
    supabase.from("kids_class_enrollment").select("id, group_id, status, effective_from, effective_until"),
    supabase.from("kids_class_registration").select("id, child_name").eq("phone", phone),
  ]);
  const groups = (groupsData ?? []) as KidsClassGroup[];
  if (groups.length !== input.groupIds.length) {
    return { ok: false, error: "Wybrana grupa już nie istnieje — odśwież stronę i spróbuj ponownie." };
  }
  const occupancy = computeGroupOccupancy((enrollmentsData ?? []) as Enrollment[], today);

  // Ten sam telefon może mieć kilkoro dzieci (rodzeństwo) — duplikat to
  // dokładnie to samo imię i nazwisko NA TYM SAMYM telefonie, nie sam
  // telefon. Dopasowanie: reużywamy istniejący profil dziecka zamiast
  // tworzyć drugi (np. podwójne kliknięcie "Zapisz", albo dopisanie kolejnej
  // grupy do już zapisanego dziecka) — nowe zapisy dostaje tylko na grupy,
  // których jeszcze nie ma (aktywne/oczekujące).
  const existingChild = (existingByPhone ?? []).find((r) => r.child_name.trim().toLowerCase() === childName.toLowerCase());

  let registrationId: string;
  if (existingChild) {
    registrationId = existingChild.id;
    const { data: existingEnrollments } = await supabase
      .from("kids_class_enrollment")
      .select("group_id, status")
      .eq("registration_id", registrationId)
      .neq("status", "rezygnacja");
    const alreadyEnrolledGroupIds = new Set((existingEnrollments ?? []).map((e) => e.group_id));
    const newGroups = groups.filter((g) => !alreadyEnrolledGroupIds.has(g.id));
    if (newGroups.length === 0) {
      return { ok: false, error: "To dziecko jest już zapisane na wybrane grupy — skontaktuj się z recepcją, jeśli chcesz coś zmienić." };
    }
    // Termin próbnych ma sens tylko dla grup z wolnym miejscem — grupa
    // pełna trafia na listę oczekujących, bez terminu (patrz SignupForm).
    const plan = newGroups.map((g) => {
      const fits = hasGroupCapacity(g, occupancy);
      occupancy.set(g.id, (occupancy.get(g.id) ?? 0) + (fits ? 1 : 0));
      return { group: g, fits };
    });
    const missingTrialDate = plan.find((p) => p.fits && !input.trialDates[p.group.id]);
    if (missingTrialDate) {
      return { ok: false, error: `Wybierz termin zajęć próbnych dla grupy: ${groupLabel(missingTrialDate.group)}.` };
    }

    const groupResults = plan.map((p) => ({ label: groupLabel(p.group), waitlisted: !p.fits }));
    const enrollmentRows = plan.map((p) => ({
      registration_id: registrationId,
      group_id: p.group.id,
      status: p.fits ? "nowe" : "oczekuje",
      trial_date: p.fits ? input.trialDates[p.group.id] : null,
    }));
    const { error: enrollmentError } = await supabase.from("kids_class_enrollment").insert(enrollmentRows);
    if (enrollmentError) return { ok: false, error: dbErrorMessage(enrollmentError) };
    return { ok: true, groupResults };
  }

  // Kolejne wybrane grupy w TYM SAMYM zgłoszeniu liczą się do siebie
  // nawzajem — bez tego dwoje rodzeństwa zapisywanych naraz do tej samej
  // prawie pełnej grupy mogłoby oboje "zmieścić się" mimo jednego miejsca.
  // Termin próbnych ma sens tylko dla grup z wolnym miejscem. Liczone i
  // walidowane PRZED utworzeniem profilu dziecka, żeby błąd walidacji nie
  // zostawiał osieroconego wiersza bez żadnego zapisu na grupę.
  const plan = groups.map((g) => {
    const fits = hasGroupCapacity(g, occupancy);
    occupancy.set(g.id, (occupancy.get(g.id) ?? 0) + (fits ? 1 : 0));
    return { group: g, fits };
  });
  const missingTrialDate = plan.find((p) => p.fits && !input.trialDates[p.group.id]);
  if (missingTrialDate) {
    return { ok: false, error: `Wybierz termin zajęć próbnych dla grupy: ${groupLabel(missingTrialDate.group)}.` };
  }

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

  const groupResults = plan.map((p) => ({ label: groupLabel(p.group), waitlisted: !p.fits }));
  const enrollmentRows = plan.map((p) => ({
    registration_id: registration.id,
    group_id: p.group.id,
    status: p.fits ? "nowe" : "oczekuje",
    trial_date: p.fits ? input.trialDates[p.group.id] : null,
  }));

  const { error: enrollmentError } = await supabase.from("kids_class_enrollment").insert(enrollmentRows);
  if (enrollmentError) return { ok: false, error: dbErrorMessage(enrollmentError) };

  return { ok: true, groupResults };
}
