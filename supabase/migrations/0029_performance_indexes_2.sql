-- Kolejna runda indeksów pod zapytania, które teraz dominują ruch systemu.

-- time_entry(employee_id, date): każde wejście w /grafik, /godziny i
-- admin/godziny filtruje DOKŁADNIE po tej parze naraz (konkretny
-- pracownik + zakres dat miesiąca). Migracja 0026 usunęła
-- unique(employee_id, date) (żeby dopuścić kilka wpisów dziennie przy
-- podzielonej zmianie) — a razem z nią, niezauważenie, zniknął też
-- automatyczny indeks złożony, który ten unique constraint tworzył.
-- Zostały tylko dwa osobne indeksy (employee_id, date), które Postgres
-- może co najwyżej połączyć bitmapowo, zamiast jednego trafnego skanu.
create index if not exists idx_time_entry_employee_date on time_entry(employee_id, date);

-- availability_submission.schedule_month_id: admin/grafik i
-- admin/grafik/dyspozycyjnosc dociągają WSZYSTKIE zgłoszenia danego
-- miesiąca naraz (dla całego zespołu) przy każdym wejściu — dotąd
-- indeksowana była tylko para (employee_id, schedule_month_id) z
-- unique(), z employee_id jako pierwszą kolumną, więc zapytanie samym
-- schedule_month_id z niego nie korzysta.
create index if not exists idx_availability_submission_month on availability_submission(schedule_month_id);
