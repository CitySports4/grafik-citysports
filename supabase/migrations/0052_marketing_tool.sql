-- Narzędzie planowania marketingu: zadania, kalendarz treści, strategie i
-- plany — osobna sekcja /marketing (jak /recepcja czy /treningi-personalne),
-- dostępna dla nowej roli "marketing" (plus admin, jak wszędzie indziej).
--
-- Rola "marketing" istniała już raz (migracja 0019) i została usunięta jako
-- nieużywana, razem z całym "Notatnikiem" (ogólne notatki/pomysły/projekty,
-- miał zastąpić Taskade). To nowe podejście jest węższe i celowo
-- marketingowe — trzy osobne, proste tabele zamiast jednego uniwersalnego
-- "notatnika" — nie próbuje być ogólnym zastępnikiem komunikacji zespołu.

alter table employee_role drop constraint employee_role_role_check;
alter table employee_role add constraint employee_role_role_check
  check (role in ('recepcja', 'sprzatanie', 'admin', 'trener_personalny', 'marketing'));

-- Zadania marketingowe — przypisywane WYŁĄCZNIE osobom z rolą marketing
-- (pilnowane w kodzie, nie tu w bazie — tak samo jak reszta autoryzacji w
-- tej appce, patrz 0001_init.sql).
create table marketing_task (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date,
  assignee_employee_id uuid references employee(id) on delete set null,
  created_by_employee_id uuid not null references employee(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_marketing_task_assignee on marketing_task(assignee_employee_id);
create index idx_marketing_task_status on marketing_task(status);

-- Kalendarz treści — jeden wpis = jedna publikacja, z konkretną platformą i
-- datą, żeby dało się go pokazać jako prawdziwy kalendarz, nie tylko listę.
create table marketing_content (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok', 'strona_www', 'email', 'inne')),
  scheduled_date date not null,
  status text not null default 'pomysl' check (status in ('pomysl', 'w_przygotowaniu', 'gotowe', 'opublikowane')),
  notes text not null default '',
  assignee_employee_id uuid references employee(id) on delete set null,
  created_by_employee_id uuid not null references employee(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_marketing_content_date on marketing_content(scheduled_date);
create index idx_marketing_content_platform on marketing_content(platform);

-- Strategie i plany — dłuższe, swobodne dokumenty (nie zadania, nie
-- konkretne publikacje), np. strategia na kwartał albo plan kampanii.
-- "archived" zamiast usuwania, żeby stare plany dało się jeszcze znaleźć,
-- bez zaśmiecania bieżącej listy (ten sam wzorzec co employee.active,
-- kids_class_group.active).
create table marketing_plan (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  type text not null default 'plan' check (type in ('strategia', 'plan')),
  archived boolean not null default false,
  created_by_employee_id uuid not null references employee(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_marketing_plan_type on marketing_plan(type);
