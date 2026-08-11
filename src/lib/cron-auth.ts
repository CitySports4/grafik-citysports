import type { createServerSupabaseClient } from "./supabase";

// Zabezpieczenie endpointów wywoływanych przez Vercel Cron — Vercel wysyła
// nagłówek Authorization: Bearer <CRON_SECRET> automatycznie przy zadaniach
// zdefiniowanych w vercel.json. Bez poprawnego sekretu nikt z zewnątrz nie
// może wyzwolić tych automatyzacji ręcznie.
export function assertCronSecret(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("Brak CRON_SECRET w konfiguracji serwera.");
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    throw new Error("Nieautoryzowane.");
  }
}

// Autor notatek tworzonych automatycznie przez AI — pierwszy aktywny admin.
export async function getAiNoteAuthorId(supabase: ReturnType<typeof createServerSupabaseClient>): Promise<string> {
  const { data } = await supabase.from("employee").select("id").eq("role", "admin").eq("active", true).order("name").limit(1).maybeSingle();
  if (!data) throw new Error("Brak aktywnego administratora do przypisania notatki AI.");
  return data.id;
}
