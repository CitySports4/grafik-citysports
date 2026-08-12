-- Budżety czasowe: było 4 wartości na osobę (jedna per slot dnia), za dużo
-- do ustawiania i bez żadnego rozróżnienia dzień powszedni / weekend (a to
-- właśnie w weekendy realnie bywa inna obsada). Zamiana na 2 wartości na
-- osobę: dzień powszedni / weekend. Stare wartości per-slot uśredniane per
-- osoba jako punkt startowy dla obu (admin może potem doprecyzować).

create table cleaning_time_budget_new (
  employee_id uuid not null references employee(id) on delete cascade,
  day_type text not null check (day_type in ('weekday', 'weekend')),
  budget_minutes integer not null default 60,
  primary key (employee_id, day_type)
);

insert into cleaning_time_budget_new (employee_id, day_type, budget_minutes)
select employee_id, dt, round(avg(budget_minutes))::int
from cleaning_time_budget, unnest(array['weekday', 'weekend']) as dt
group by employee_id, dt;

drop table cleaning_time_budget;
alter table cleaning_time_budget_new rename to cleaning_time_budget;
