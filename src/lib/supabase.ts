import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Klucz service_role, nie anon — omija RLS, więc RLS można mieć włączone na
// wszystkich tabelach bez zrywania działania aplikacji (pkt odkryty
// 15.11.2026: NEXT_PUBLIC_SUPABASE_ANON_KEY z definicji trafia do paczki JS
// w przeglądarce, więc bez RLS był to de facto publiczny dostęp do całej
// bazy, mimo że cała autoryzacja w aplikacji jest po stronie serwera).
// Bezpieczne tylko dlatego, że createServerSupabaseClient jest używane
// WYŁĄCZNIE po stronie serwera (Server Components/Actions) — nigdy w kodzie
// klienckim, inaczej ten klucz trafiłby do przeglądarki.
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createServerSupabaseClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
