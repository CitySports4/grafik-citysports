-- Rdzeń systemu grafików pracy City Sports.
-- Bez multi-tenancy (jeden klub) i bez RLS — autoryzacja jest w warstwie
-- aplikacji (Server Actions sprawdzające requireAdmin()/requireEmployee()),
-- tak jak w innych projektach tego zespołu.

create extension if not exists "pgcrypto";

-- Pracownicy -----------------------------------------------------------

create table employee (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  password_hash text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  color_hex text not null default '#3b82f6',
  is_instructor boolean not null default false,
  min_hours_month numeric(6, 2) not null default 0,
  target_hours_month numeric(6, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Stałe godziny zajęć instruktora (weekday: 0=niedziela .. 6=sobota).
-- Jeśli zmiana pokrywa się z zajęciami o więcej niż 1h, przy generowaniu
-- draftu grafiku dany pracownik jest przypisywany do tej zmiany w ostatniej
-- kolejności — tylko gdy nie ma innego dostępnego pracownika.
create table employee_class_schedule (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  note text,
  created_at timestamptz not null default now()
);

-- Cykliczne reguły dostępności: twarde ("unavailable" — nigdy nie
-- przypisuj) i miękkie preferencje ("preferred" — pierwszy wybór przy
-- rotacji, ale nadpisywalne dla sprawiedliwego rozkładu dni wolnych).
create table weekly_recurring_constraint (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time,
  end_time time,
  type text not null check (type in ('unavailable', 'preferred')),
  note text,
  created_at timestamptz not null default now()
);

-- Konfiguracja zmian ------------------------------------------------------

-- Domyślne zmiany dla danego dnia tygodnia (edytowalne przez admina).
create table shift_template (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  slot_index smallint not null,
  default_start_time time not null,
  default_end_time time not null,
  label text,
  active boolean not null default true,
  unique (weekday, slot_index)
);

-- Grafik miesięczny --------------------------------------------------------

create table schedule_month (
  id uuid primary key default gen_random_uuid(),
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (year, month)
);

create table schedule_day (
  id uuid primary key default gen_random_uuid(),
  schedule_month_id uuid not null references schedule_month(id) on delete cascade,
  date date not null,
  weekday smallint not null check (weekday between 0 and 6),
  notes text,
  unique (schedule_month_id, date)
);

-- Konkretna zmiana danego dnia — godziny nadpisywalne per dzień (nie sztywny
-- szablon), employee_id nullable dopóki nieprzypisana.
create table schedule_shift (
  id uuid primary key default gen_random_uuid(),
  schedule_day_id uuid not null references schedule_day(id) on delete cascade,
  slot_index smallint not null,
  start_time time not null,
  end_time time not null,
  employee_id uuid references employee(id) on delete set null,
  is_closed boolean not null default false,
  unique (schedule_day_id, slot_index)
);

create table schedule_event (
  id uuid primary key default gen_random_uuid(),
  schedule_day_id uuid not null references schedule_day(id) on delete cascade,
  type text not null check (
    type in ('liga_open', 'liga_deblowa', 'liga_singlowa', 'sprzatanie', 'warsztaty', 'custom')
  ),
  start_time time,
  label text,
  note text,
  participant_employee_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Dyspozycyjność -----------------------------------------------------------

create table availability_submission (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id) on delete cascade,
  schedule_month_id uuid not null references schedule_month(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'locked')),
  submitted_at timestamptz,
  unique (employee_id, schedule_month_id)
);

-- Pracownik zaznacza tylko dni/zmiany, w których go NIE będzie.
-- whole_day = true -> slot_index bez znaczenia (cały dzień niedostępny).
create table availability_entry (
  id uuid primary key default gen_random_uuid(),
  availability_submission_id uuid not null references availability_submission(id) on delete cascade,
  date date not null,
  whole_day boolean not null default false,
  slot_index smallint
);

-- Preferowane dni wolne w tygodniu — utrzymywane między miesiącami; jeśli
-- pracownik nie wypełni dyspozycyjności na nowy miesiąc, te preferencje są
-- brane jako domyślne przy generowaniu draftu.
create table preferred_day_off (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (employee_id, weekday)
);

-- Zamiany zmian --------------------------------------------------------

create table shift_swap_request (
  id uuid primary key default gen_random_uuid(),
  requester_employee_id uuid not null references employee(id) on delete cascade,
  requester_shift_id uuid not null references schedule_shift(id) on delete cascade,
  target_employee_id uuid references employee(id) on delete set null,
  target_shift_id uuid references schedule_shift(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  hour_delta numeric(6, 2),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Indeksy ----------------------------------------------------------------

create index idx_schedule_day_month on schedule_day(schedule_month_id);
create index idx_schedule_shift_day on schedule_shift(schedule_day_id);
create index idx_schedule_shift_employee on schedule_shift(employee_id);
create index idx_schedule_event_day on schedule_event(schedule_day_id);
create index idx_availability_entry_submission on availability_entry(availability_submission_id);
create index idx_weekly_constraint_employee on weekly_recurring_constraint(employee_id);
create index idx_class_schedule_employee on employee_class_schedule(employee_id);
create index idx_swap_requester on shift_swap_request(requester_employee_id);
create index idx_swap_target on shift_swap_request(target_employee_id);
