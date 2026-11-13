-- Bucket na skany/zdjęcia dokumentów KW/KP (pkt 4 spec) — prywatny (public=false),
-- dostęp do odczytu tylko przez podpisane URL-e generowane po stronie serwera.
-- Brak auth w tej appce (sesja po własnym cookie, nie Supabase Auth), więc
-- polityki na storage.objects muszą pozwalać roli "anon" — dokładnie ta sama
-- zasada co reszta bazy ("autoryzacja wyłącznie na poziomie aplikacji").
insert into storage.buckets (id, name, public)
values ('kasa-dokumenty', 'kasa-dokumenty', false)
on conflict (id) do nothing;

create policy "kasa-dokumenty insert" on storage.objects
  for insert to anon
  with check (bucket_id = 'kasa-dokumenty');

create policy "kasa-dokumenty select" on storage.objects
  for select to anon
  using (bucket_id = 'kasa-dokumenty');

create policy "kasa-dokumenty delete" on storage.objects
  for delete to anon
  using (bucket_id = 'kasa-dokumenty');
