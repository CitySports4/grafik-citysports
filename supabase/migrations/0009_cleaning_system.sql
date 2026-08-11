-- System sprzątania zintegrowany z grafikiem pracy — nie osobny moduł.
-- Przydział zadania zależy bezpośrednio od tego, kto ma danego dnia zmianę
-- (otwarcie/środek/zamknięcie), a nie od niezależnego wyboru osoby.
-- Przeprojektowane (nie 1:1 port) na bazie wcześniejszego prototypu
-- (city_sports_sprzatanie.html) — uproszczone: bez logiki "carry"/mopów,
-- bez auto-rozkładania rzadkich zadań, bez per-osoba budżetów czasowych.

create table cleaning_zone (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_code text,
  active boolean not null default true
);

create table cleaning_task (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references cleaning_zone(id) on delete cascade,
  name text not null,
  time_minutes integer not null default 10,
  frequency text not null check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly')),
  -- Dzień tygodnia (0=niedziela..6=sobota) — wymagany dla weekly i rzadszych,
  -- ignorowany dla daily.
  weekday integer,
  -- Która zmiana dnia robi to zadanie: pierwsza (otwarcie), środkowa (jeśli
  -- jest 3. zmiana tego dnia) czy ostatnia (zamknięcie).
  slot text not null check (slot in ('otwarcie', 'srodek', 'zamkniecie')),
  requires_ladder boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table cleaning_checklist_item (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references cleaning_task(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0
);

-- Granularne kompetencje sprzątania per osoba — którymi strefami może się
-- zajmować, zamiast jednego przełącznika "może sprzątać".
create table employee_cleaning_zone (
  employee_id uuid not null references employee(id) on delete cascade,
  zone_id uuid not null references cleaning_zone(id) on delete cascade,
  primary key (employee_id, zone_id)
);

create table cleaning_completion (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references cleaning_task(id) on delete cascade,
  date date not null,
  employee_id uuid references employee(id) on delete set null,
  completed_at timestamptz,
  checklist_done jsonb not null default '[]'::jsonb,
  unique (task_id, date)
);

-- Data odniesienia dla cykli co-2-tygodnie/co-4-tygodnie/kwartalnie —
-- jeden wiersz, ustawiany raz przez admina.
create table cleaning_settings (
  id boolean primary key default true check (id),
  cycle_start date
);
insert into cleaning_settings (id, cycle_start) values (true, null);

create index idx_cleaning_task_zone on cleaning_task(zone_id);
create index idx_cleaning_checklist_task on cleaning_checklist_item(task_id);
create index idx_cleaning_completion_date on cleaning_completion(date);

-- Zjednoczenie ze starym przełącznikiem can_clean: kolumna zostaje w bazie
-- (nieużywana od teraz w kodzie — nic nie kasujemy), ale każdy, kto miał
-- can_clean=true, dostaje od razu jedną ogólną strefę, żeby nie stracić
-- istniejącego sygnału "może sprzątać" przy przejściu na strefy. Admin może
-- to potem doprecyzować w Konfiguracja sprzątania → Kompetencje.
insert into cleaning_zone (name, group_code)
values ('Ogólne sprzątanie (sobota)', 'A');

insert into employee_cleaning_zone (employee_id, zone_id)
select e.id, z.id
from employee e, cleaning_zone z
where e.can_clean = true and z.name = 'Ogólne sprzątanie (sobota)';
