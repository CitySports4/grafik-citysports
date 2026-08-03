import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Używane tylko po stronie serwera (Server Components / Server Actions) —
// klucz nigdy nie trafia do przeglądarki.
export function createServerSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}
