-- Polityki na storage.objects dla "kasa-dokumenty" pozwalały roli anon
-- insert/select/delete (0071), bo appka nie miała wtedy innego sposobu na
-- dostęp do prywatnego bucketu. Od 15.11.2026 createServerSupabaseClient
-- (lib/supabase.ts) łączy się kluczem service_role, który i tak omija
-- polityki storage — więc te trzy polityki dla anon są teraz zbędne, a
-- przy tym to jedyna droga, którą ktoś z samym kluczem publicznym (ten
-- klucz trafia do przeglądarki z definicji Next.js) mógłby dziś czytać,
-- dodawać i kasować skany dokumentów KW/KP. Zgłoszone 15.11.2026 przy
-- przeglądzie bezpieczeństwa Supabase Advisora.
drop policy "kasa-dokumenty insert" on storage.objects;
drop policy "kasa-dokumenty select" on storage.objects;
drop policy "kasa-dokumenty delete" on storage.objects;
