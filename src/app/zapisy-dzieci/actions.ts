"use server";

import { createServerSupabaseClient } from "@/lib/supabase";
import { dbErrorMessage } from "@/lib/db-error";
import { normalizePhone } from "@/lib/phone";
import { toDateKey } from "@/lib/schedule-month";
import {
  checkAgeEligibility,
  computeCommittedOccupancy,
  groupLabel,
  type KidsClassGroup,
  type KidsClassStatus,
} from "@/lib/kids-classes";

// Specjalne rozwiązanie dla grupy, w której w TYM miesiącu zabrakło już
// terminów próbnych (patrz thisMonthExhausted w zapisy-dzieci/page.tsx) —
// zamiast cichego przełożenia na kolejny miesiąc w TEJ SAMEJ grupie
// (zwykła ścieżka, wciąż dostępna i niewymagająca żadnego z poniższych),
// rodzic może świadomie wybrać jedną z dwóch alternatyw.
export type GroupResolutionOverride =
  | { mode: "trial_elsewhere"; elsewhereGroupId: string; elsewhereDate: string }
  | { mode: "skip_trial" };

export type SignupInput = {
  childName: string;
  birthDate: string;
  parentName: string;
  phone: string;
  whatsappContact: boolean;
  groupIds: string[];
  trialDates: Record<string, string>;
  resolutionOverrides: Record<string, GroupResolutionOverride>;
  hasExperience: boolean;
  rodoConsent: boolean;
  termsConsent: boolean;
};

export type SignupResult =
  | { ok: true; groupResults: { label: string; waitlisted: boolean }[] }
  | { ok: false; error: string };

function nextMonthFirstDay(todayKey: string): string {
  const d = new Date(todayKey + "T00:00:00");
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return toDateKey(next);
}

type EnrollmentInsertRow = {
  group_id: string;
  status: "nowe" | "oczekuje";
  trial_date: string | null;
  effective_from?: string;
};

// Buduje wiersze zapisów dla wszystkich wybranych grup naraz, z uwzględnieniem
// resolutionOverrides — wspólne dla nowego dziecka i powracającego, dlatego
// osobna funkcja zamiast powielania w obu gałęziach submitRegistration.
// Mutuje `committedOccupancy` na bieżąco (ten sam obiekt współdzielony przez
// cały request), żeby rodzeństwo w jednym zgłoszeniu nie zmieściło się oboje
// na ostatnie miejsce, i żeby "próbne w innej grupie" + "start od kolejnego
// miesiąca w grupie docelowej" liczyły się jako DWA osobne miejsca.
function planEnrollments(
  desiredGroups: KidsClassGroup[],
  elsewhereGroupsById: Map<string, KidsClassGroup>,
  committedOccupancy: Map<string, number>,
  today: string,
  trialDates: Record<string, string>,
  resolutionOverrides: Record<string, GroupResolutionOverride>,
  skipTrialGlobally: boolean
): { rows: EnrollmentInsertRow[]; groupResults: { label: string; waitlisted: boolean }[] } | { error: string } {
  function planOne(g: KidsClassGroup): boolean {
    const current = committedOccupancy.get(g.id) ?? 0;
    const fits = current < g.capacity;
    if (fits) committedOccupancy.set(g.id, current + 1);
    return fits;
  }

  const rows: EnrollmentInsertRow[] = [];
  const groupResults: { label: string; waitlisted: boolean }[] = [];

  for (const g of desiredGroups) {
    const override = resolutionOverrides[g.id];

    if (override?.mode === "trial_elsewhere") {
      const elsewhereGroup = elsewhereGroupsById.get(override.elsewhereGroupId);
      if (!elsewhereGroup) {
        return { error: "Wybrana grupa na próbne już nie istnieje — odśwież stronę i spróbuj ponownie." };
      }
      // Grupa docelowa — start dopiero od kolejnego miesiąca, bez własnego
      // terminu próbnych (próbne wykorzystane w innej grupie, patrz niżej).
      const fitsDesired = planOne(g);
      rows.push({
        group_id: g.id,
        status: fitsDesired ? "nowe" : "oczekuje",
        trial_date: null,
        effective_from: fitsDesired ? nextMonthFirstDay(today) : today,
      });
      groupResults.push({ label: `${groupLabel(g)} (od kolejnego miesiąca)`, waitlisted: !fitsDesired });

      // Osobny, dodatkowy zapis na grupę, w której dziecko faktycznie
      // przyjdzie na próbne — zajmuje miejsce w TEJ grupie już teraz.
      const fitsElsewhere = planOne(elsewhereGroup);
      rows.push({
        group_id: elsewhereGroup.id,
        status: fitsElsewhere ? "nowe" : "oczekuje",
        trial_date: fitsElsewhere ? override.elsewhereDate : null,
      });
      groupResults.push({ label: `${groupLabel(elsewhereGroup)} (próbne)`, waitlisted: !fitsElsewhere });
      continue;
    }

    if (override?.mode === "skip_trial") {
      const fits = planOne(g);
      rows.push({ group_id: g.id, status: fits ? "nowe" : "oczekuje", trial_date: null });
      groupResults.push({ label: groupLabel(g), waitlisted: !fits });
      continue;
    }

    // Brak specjalnego rozwiązania — zwykła ścieżka: termin z trialDates (ten
    // sam miesiąc albo już automatycznie kolejny, patrz upcomingSessionDates),
    // albo globalne pominięcie próbnych dla powracającego dziecka, które już
    // je kiedyś wykorzystało.
    const fits = planOne(g);
    if (fits && !skipTrialGlobally && !trialDates[g.id]) {
      return { error: `Wybierz termin zajęć próbnych dla grupy: ${groupLabel(g)}.` };
    }
    rows.push({
      group_id: g.id,
      status: fits ? "nowe" : "oczekuje",
      trial_date: !skipTrialGlobally && fits ? trialDates[g.id] : null,
    });
    groupResults.push({ label: groupLabel(g), waitlisted: !fits });
  }

  return { rows, groupResults };
}

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

  // Grupy "gdzie indziej" z resolutionOverrides mogą być inne niż wybrane
  // (checkbox) grupy — trzeba dociągnąć ich dane osobno, jeśli jeszcze nie
  // są w input.groupIds.
  const overrideElsewhereIds = Object.values(input.resolutionOverrides ?? {})
    .filter((o): o is Extract<GroupResolutionOverride, { mode: "trial_elsewhere" }> => o.mode === "trial_elsewhere")
    .map((o) => o.elsewhereGroupId);
  const allGroupIds = [...new Set([...input.groupIds, ...overrideElsewhereIds])];

  const supabase = createServerSupabaseClient();
  const [{ data: groupsData }, { data: enrollmentsData }, { data: existingByPhone }] = await Promise.all([
    supabase.from("kids_class_group").select("id, weekday, start_time, end_time, label, capacity, active, sort_order").in("id", allGroupIds),
    supabase.from("kids_class_enrollment").select("id, group_id, status, effective_from, effective_until"),
    supabase.from("kids_class_registration").select("id, child_name").eq("phone", phone),
  ]);
  const allGroups = (groupsData ?? []) as KidsClassGroup[];
  const allGroupsById = new Map(allGroups.map((g) => [g.id, g]));
  const groups = input.groupIds.map((id) => allGroupsById.get(id)).filter((g): g is KidsClassGroup => !!g);
  if (groups.length !== input.groupIds.length || overrideElsewhereIds.some((id) => !allGroupsById.has(id))) {
    return { ok: false, error: "Wybrana grupa już nie istnieje — odśwież stronę i spróbuj ponownie." };
  }
  // Zapisanie się choćby na próbne zajmuje miejsce w grupie od razu, tak
  // samo jak "Aktywny" — patrz computeCommittedOccupancy w kids-classes.ts.
  const committedOccupancy = computeCommittedOccupancy(enrollmentsData ?? [], today);
  const resolutionOverrides = input.resolutionOverrides ?? {};

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
    // Bez filtra statusu — rezygnacja z grupy nie "cofa" wcześniej
    // wykorzystanego wejścia próbnego, musimy widzieć całą historię.
    const { data: existingEnrollments } = await supabase
      .from("kids_class_enrollment")
      .select("group_id, status, used_trial")
      .eq("registration_id", registrationId);
    const alreadyEnrolledGroupIds = new Set(
      (existingEnrollments ?? []).filter((e) => e.status !== "rezygnacja").map((e) => e.group_id)
    );
    const newGroups = groups.filter((g) => !alreadyEnrolledGroupIds.has(g.id));
    if (newGroups.length === 0) {
      return { ok: false, error: "To dziecko jest już zapisane na wybrane grupy — skontaktuj się z recepcją, jeśli chcesz coś zmienić." };
    }
    // Dziecko, które KIEDYKOLWIEK (w dowolnej grupie) wykorzystało
    // bezpłatne wejście próbne, nie dostaje go drugi raz — pomijamy
    // wybór terminu całkowicie, od razu liczy się zwykłe miejsce.
    const hasUsedTrial = (existingEnrollments ?? []).some((e) => e.used_trial);
    const planned = planEnrollments(newGroups, allGroupsById, committedOccupancy, today, input.trialDates, resolutionOverrides, hasUsedTrial);
    if ("error" in planned) return { ok: false, error: planned.error };

    const { error: enrollmentError } = await supabase
      .from("kids_class_enrollment")
      .insert(planned.rows.map((r) => ({ ...r, registration_id: registrationId })));
    if (enrollmentError) return { ok: false, error: dbErrorMessage(enrollmentError) };
    return { ok: true, groupResults: planned.groupResults };
  }

  // Liczone i walidowane PRZED utworzeniem profilu dziecka, żeby błąd
  // walidacji nie zostawiał osieroconego wiersza bez żadnego zapisu na grupę.
  const planned = planEnrollments(groups, allGroupsById, committedOccupancy, today, input.trialDates, resolutionOverrides, false);
  if ("error" in planned) return { ok: false, error: planned.error };

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

  const { error: enrollmentError } = await supabase
    .from("kids_class_enrollment")
    .insert(planned.rows.map((r) => ({ ...r, registration_id: registration.id })));
  if (enrollmentError) return { ok: false, error: dbErrorMessage(enrollmentError) };

  return { ok: true, groupResults: planned.groupResults };
}

export type ReturningChildMatch = {
  id: string;
  childName: string;
  birthDate: string;
  parentName: string;
  groups: { label: string; status: KidsClassStatus }[];
  hasUsedTrial: boolean;
};

// "Dziecko już chodziło, chcę wrócić" — rodzic podaje swój numer zamiast
// wypełniać wszystko od nowa. Pokazujemy tylko to, co trzeba do rozpoznania
// właściwego dziecka (imię + historia grup/statusów) — bez numeru telefonu
// w wyniku, bo rodzic sam go przed chwilą wpisał. Dopasowanie jest DOKŁADNE
// po numerze — nic nie widać bez znajomości właściwego numeru.
export async function findChildrenByPhone(rawPhone: string): Promise<ReturningChildMatch[]> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return [];

  const supabase = createServerSupabaseClient();
  const { data: registrations } = await supabase
    .from("kids_class_registration")
    .select("id, child_name, birth_date, parent_name")
    .eq("phone", phone);
  if (!registrations || registrations.length === 0) return [];

  const registrationIds = registrations.map((r) => r.id);
  const [{ data: enrollments }, { data: groupsData }] = await Promise.all([
    supabase.from("kids_class_enrollment").select("registration_id, group_id, status, used_trial").in("registration_id", registrationIds),
    supabase.from("kids_class_group").select("id, weekday, start_time, end_time, label, capacity, active, sort_order"),
  ]);
  const groupById = new Map(((groupsData ?? []) as KidsClassGroup[]).map((g) => [g.id, g]));

  return registrations.map((r) => {
    const own = (enrollments ?? []).filter((e) => e.registration_id === r.id);
    return {
      id: r.id,
      childName: r.child_name,
      birthDate: r.birth_date,
      parentName: r.parent_name,
      groups: own.map((e) => {
        const g = groupById.get(e.group_id);
        return { label: g ? groupLabel(g) : "?", status: e.status as KidsClassStatus };
      }),
      // Czy to dziecko KIEDYKOLWIEK (w dowolnej grupie) wykorzystało
      // bezpłatne wejście próbne — jeśli tak, formularz (SignupForm) od
      // razu pomija wybór terminu, nie ma sensu go pokazywać. Autorytatywnie
      // sprawdzane jeszcze raz w submitRegistration, to tu tylko dla UX.
      hasUsedTrial: own.some((e) => e.used_trial),
    };
  });
}
