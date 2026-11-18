-- Propozycja Marketing -> Grafik (18.11.2026, krok 2): gotowe pola treści
-- zamiast jednego worka "notatki" — każde ma w UI przycisk "Kopiuj", żeby
-- wklejać wprost przy publikacji, bez przepisywania z notatek.
alter table marketing_content add column hook text not null default '';
alter table marketing_content add column content_fb text not null default '';
alter table marketing_content add column content_ig text not null default '';
alter table marketing_content add column screen_captions text not null default '';
alter table marketing_content add column what_to_record text not null default '';
alter table marketing_content add column hashtags text not null default '';
alter table marketing_content add column to_confirm text not null default '';
alter table marketing_content add column link_utm text not null default '';

-- Dwa nowe formaty z propozycji — karuzela (seria zdjęć) i wydarzenie na
-- Facebooku — obok istniejących (migracja 0059). "email" i "aktualnosc" z
-- listy propozycji już istnieją (aktualnosc jako format, email jako
-- platform), więc nie dublujemy ich tutaj.
alter table marketing_content drop constraint marketing_content_format_check;
alter table marketing_content add constraint marketing_content_format_check
  check (format in ('rolka', 'post', 'story', 'aktualnosc', 'karuzela', 'wydarzenie_fb', 'inne'));
