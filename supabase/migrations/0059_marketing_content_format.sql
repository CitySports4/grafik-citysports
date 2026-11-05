-- Typ/format treści (rolka, post, relacja/story, aktualność na stronie...) —
-- osobny wymiar od "celu materiału" (promocja/relacja), dodanego migracją
-- 0056. Nazwa kolumny "format", nie "typ", żeby nie kolidować słownie z
-- marketing_plan.type (strategia/plan) ani z purpose.
alter table marketing_content add column format text not null default 'post'
  check (format in ('rolka', 'post', 'story', 'aktualnosc', 'inne'));
