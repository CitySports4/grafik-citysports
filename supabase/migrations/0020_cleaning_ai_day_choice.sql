-- AI (patrz src/lib/cleaning-generator-ai.ts) dostaje pełne zaufanie do
-- wyboru, KTÓREGO dnia w oknie (tydzień/2 tyg./4 tyg./kwartał) wykonać
-- zadanie cykliczne sprzątania — ten sam poziom zaufania co przy grafiku
-- zmian. Wynik jest zapisywany tu (per zadanie + okno), rewalidowany przy
-- KAŻDYM odczycie w resolveCyclicDueDates (nigdy ślepo zaufany — jeśli
-- kompetencje/grafik zmieniły się od wyboru, po cichu spada z powrotem do
-- zwykłej, deterministycznej logiki). Bez tej tabeli decyzja AI musiałaby
-- być liczona na nowo przy każdym wejściu na stronę — tu jest podjęta raz
-- (na żądanie admina) i trzyma się, dopóki ktoś nie przeliczy jej ponownie.
-- Jeden wiersz na wybraną datę — zadania 2x/3x-w-tygodniu potrzebują kilku
-- dat na to samo okno, stąd unikalność na (task_id, window_start,
-- chosen_date), nie samo (task_id, window_start).
create table cleaning_ai_day_choice (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references cleaning_task(id) on delete cascade,
  window_start date not null,
  chosen_date date not null,
  created_at timestamptz not null default now(),
  unique (task_id, window_start, chosen_date)
);

create index idx_cleaning_ai_day_choice_task on cleaning_ai_day_choice(task_id);
