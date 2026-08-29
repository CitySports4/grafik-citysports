-- Kilka indeksów pod zapytania, które robimy najczęściej i które rosną z
-- czasem (kolejne miesiące grafiku, kolejne dni sprzątania) — bez nich
-- Postgres musi przy każdym takim zapytaniu przeglądać całą tabelę, co z
-- każdym miesiącem działania systemu robi się coraz wolniejsze.

-- schedule_day.date: skanowane zakresowo (gte/lte) przy KAŻDYM wyliczeniu
-- widoku sprzątania — dla pojedynczego dnia i dla całego podglądu miesiąca
-- (do 31 takich zapytań na jedno wejście na /admin/sprzatanie/podglad) — a
-- tabela rośnie z każdym kolejnym miesiącem grafiku. Miała dotąd tylko
-- indeks po schedule_month_id, nie po dacie.
create index if not exists idx_schedule_day_date on schedule_day(date);

-- cleaning_completion.task_id: filtrowane przez IN(...) w trzech różnych
-- miejscach liczenia dnia sprzątania (historia wykonań zadań cyklicznych,
-- zadania "carry", potwierdzenia na dany dzień) — dotąd tylko indeks po
-- dacie, nie po zadaniu.
create index if not exists idx_cleaning_completion_task on cleaning_completion(task_id);

-- cleaning_ai_day_choice.window_start: filtrowane przez IN(...) przy każdym
-- wyliczeniu dnia sprzątania dotykającego zadań cyklicznych z wyborem AI —
-- dotąd tylko indeks po task_id.
create index if not exists idx_cleaning_ai_day_choice_window on cleaning_ai_day_choice(window_start);
