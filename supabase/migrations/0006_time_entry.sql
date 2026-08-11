-- Licznik godzin: pracownik ręcznie wpisuje rzeczywistą godzinę rozpoczęcia
-- i zakończenia pracy danego dnia. Można wpisać/edytować o dowolnej porze,
-- ale tylko dla dnia nie starszego niż 7 dni wstecz (pilnowane w kodzie
-- aplikacji, nie w bazie — podobnie jak reszta autoryzacji w tym projekcie).
-- Służy do rozliczeń wynagrodzeń (porównanie z grafikiem, tolerancja ±30 min).
create table time_entry (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id) on delete cascade,
  date date not null,
  actual_start time,
  actual_end time,
  note text,
  updated_at timestamptz not null default now(),
  unique (employee_id, date)
);

create index idx_time_entry_employee on time_entry(employee_id);
create index idx_time_entry_date on time_entry(date);
