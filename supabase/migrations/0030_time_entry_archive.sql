-- Archiwum ewidencji godzin — zamiast trzymać całe 5 lat wpisów w "gorącej"
-- tabeli time_entry (przeglądanej przy KAŻDYM wejściu w /grafik i
-- /godziny), wpisy starsze niż 3 miesiące przenoszą się tutaj (cotygodniowy
-- cron, patrz api/cron/data-retention). Węższy szkielet niż time_entry —
-- bez updated_at (wpis zamrożony, nikt go już nie edytuje), z archived_at
-- zamiast tego. Dopiero stąd, po 5 latach od `date`, dane znikają na
-- zawsze — to ten sam cron.
create table time_entry_archive (
  id uuid primary key,
  employee_id uuid not null references employee(id) on delete cascade,
  date date not null,
  actual_start time,
  actual_end time,
  note text,
  is_remote boolean not null default false,
  archived_at timestamptz not null default now()
);

create index idx_time_entry_archive_employee_date on time_entry_archive(employee_id, date);
create index idx_time_entry_archive_date on time_entry_archive(date);
