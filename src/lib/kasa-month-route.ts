import { getSessionEmployee } from "@/lib/session";
import { createServerSupabaseClient } from "@/lib/supabase";

// Wspólne dla tras RK/paczka: parsowanie "YYYY-MM", sprawdzenie roli admin i
// pobranie numeru RK z cash_months (jeśli miesiąc już zamknięty).
export function parseYm(ym: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export async function requireAdminForRoute(): Promise<boolean> {
  const employee = await getSessionEmployee();
  return !!employee && employee.roles.includes("admin");
}

export async function loadRkNumber(year: number, month: number): Promise<number | null> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("cash_months").select("rk_number").eq("year", year).eq("month", month).maybeSingle();
  return (data?.rk_number as number | null) ?? null;
}

// Czcionka wgrana do public/fonts (Geist, OFL) — pobierana z tego samego hosta.
export async function loadFontBytes(requestUrl: string): Promise<Uint8Array> {
  const res = await fetch(new URL("/fonts/Geist-Regular.ttf", requestUrl));
  if (!res.ok) throw new Error("Nie udało się wczytać czcionki RK.");
  return new Uint8Array(await res.arrayBuffer());
}
