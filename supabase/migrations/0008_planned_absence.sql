-- Planowane nieobecności/urlopy — pracownik może dodać z wyprzedzeniem
-- (do 6 miesięcy, pilnowane w kodzie aplikacji), niezależnie od cyklu
-- comiesięcznego zgłaszania dyspozycyjności. Traktowane jak "cały dzień
-- niedostępny" wszędzie tam, gdzie liczona jest dostępność.
create table planned_absence (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint planned_absence_date_order check (end_date >= start_date)
);

create index idx_planned_absence_employee on planned_absence(employee_id);
create index idx_planned_absence_range on planned_absence(start_date, end_date);
