import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase";

const COOKIE_NAME = "gc_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dni

function sign(employeeId: string): string {
  const secret = process.env.SESSION_SECRET!;
  const hmac = createHmac("sha256", secret).update(employeeId).digest("hex");
  return `${employeeId}.${hmac}`;
}

function verify(token: string): string | null {
  const secret = process.env.SESSION_SECRET!;
  const [employeeId, hmac] = token.split(".");
  if (!employeeId || !hmac) return null;
  const expected = createHmac("sha256", secret).update(employeeId).digest("hex");
  const a = Buffer.from(hmac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return employeeId;
}

export async function createSession(employeeId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(employeeId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSessionEmployeeId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verify(token);
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type EmployeeRole = "recepcja" | "sprzatanie" | "admin" | "trener_personalny";

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  recepcja: "Recepcja",
  sprzatanie: "Sprzątanie",
  admin: "Administrator",
  trener_personalny: "Trener Personalny",
};

export type PtBillingCycle = "weekly" | "monthly";

export type SessionEmployee = {
  id: string;
  name: string;
  roles: EmployeeRole[];
  colorHex: string;
  // Rozliczenie godzinowe (wpisywanie godzin, wynagrodzenia) dotyczy tego,
  // kto ma ustawioną stawkę — nie roli "Recepcja" samej w sobie. Dzięki
  // temu ktoś może mieć rolę Recepcja (bo faktycznie tam pracuje i ma tam
  // swoje miejsce w grafiku), ale bez stawki jest na stałej pensji: nie
  // wpisuje godzin i nie ma tu wypłaty. Patrz tracksHours poniżej.
  hourlyRate: number;
  // Zgoda na wpisywanie godzin bez zaplanowanej zmiany w grafiku (praca
  // zdalna, nieplanowana z góry) — bez tłumaczenia notatką, patrz
  // requiresDiscrepancyNote w lib/time-entry-window.ts. Ustawiane w
  // Pracownicy, per osoba (np. Sasza) — domyślnie wyłączone.
  allowRemoteWork: boolean;
  // Cykl rozliczeń treningów personalnych tego trenera (tydzień/miesiąc) —
  // ma sens tylko dla kogoś z rolą trener_personalny, patrz
  // treningi-personalne/rozliczenia.
  ptBillingCycle: PtBillingCycle | null;
};

export async function getSessionEmployee(): Promise<SessionEmployee | null> {
  const employeeId = await getSessionEmployeeId();
  if (!employeeId) return null;

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("employee")
    .select("id, name, color_hex, active, hourly_rate, allow_remote_work, pt_billing_cycle, employee_role(role)")
    .eq("id", employeeId)
    .single();

  if (!data || !data.active) return null;
  return {
    id: data.id,
    name: data.name,
    roles: (data.employee_role ?? []).map((r: { role: string }) => r.role as EmployeeRole),
    colorHex: data.color_hex,
    hourlyRate: data.hourly_rate ?? 0,
    allowRemoteWork: data.allow_remote_work ?? false,
    ptBillingCycle: data.pt_billing_cycle ?? null,
  };
}

// Ktoś, kto ma WYŁĄCZNIE rolę trenera personalnego (żadnej innej) — po
// zalogowaniu widzi tylko grafik treningów personalnych, bez reszty
// aplikacji (patrz (app)/layout.tsx i app/page.tsx).
export function isPersonalTrainerOnly(employee: SessionEmployee): boolean {
  return employee.roles.length === 1 && employee.roles[0] === "trener_personalny";
}

// Podgląd grafiku treningów personalnych (bez pełnej edycji) dotyczy
// recepcji i admina — to oni realnie rozliczają się z trenerami.
export function canPreviewPersonalTraining(employee: SessionEmployee): boolean {
  return employee.roles.includes("recepcja") || employee.roles.includes("admin");
}

// Zajęcia dla dzieci (zgłoszenia, płatności) — dzień-do-dnia obsługuje
// recepcja, tak jak w dawnym systemie ("Panel administracyjny dla
// recepcji"); limity miejsc (Ustawienia) zmienia tylko admin — patrz
// requireAdmin w app/(app)/zajecia-dzieci/actions.ts.
export function canManageKidsClasses(employee: SessionEmployee): boolean {
  return employee.roles.includes("recepcja") || employee.roles.includes("admin");
}

// Czy pracownik rozlicza się godzinowo — patrz komentarz przy hourlyRate.
export function tracksHours(employee: SessionEmployee): boolean {
  return employee.hourlyRate > 0;
}

export async function requireEmployee(): Promise<SessionEmployee> {
  const employee = await getSessionEmployee();
  if (!employee) {
    throw new Error("Musisz być zalogowany.");
  }
  return employee;
}

export async function requireAdmin(): Promise<SessionEmployee> {
  const employee = await requireEmployee();
  if (!employee.roles.includes("admin")) {
    throw new Error("Brak uprawnień — ta akcja jest dostępna tylko dla administratora.");
  }
  return employee;
}
