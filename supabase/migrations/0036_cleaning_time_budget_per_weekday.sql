-- Budżety czasowe: dwa "typy dnia" (pon-pt / weekend) z 0035 to wciąż za
-- mało granularne — konfiguracja zmian (shift_template) różni się per
-- KONKRETNY dzień tygodnia (patrz np. piątek vs sobota vs niedziela, różne
-- godziny), więc budżet ma teraz dokładnie tę samą granularność: per dzień
-- tygodnia (0=niedziela..6=sobota), nie per kategoria.

create table cleaning_time_budget_new (
  employee_id uuid not null references employee(id) on delete cascade,
  slot text not null check (slot in ('otwarcie', 'srodek', 'zamkniecie', 'po_zamknieciu')),
  weekday integer not null check (weekday between 0 and 6),
  budget_minutes integer not null default 60,
  primary key (employee_id, slot, weekday)
);

-- Istniejąca wartość dla 'weekday' rozlewa się na pon-pt (1-5), wartość dla
-- 'weekend' na sob-nd (0, 6) — punkt startowy dla wszystkich 7 dni, admin
-- doprecyzuje per dzień tygodnia, gdy będzie chciał.
insert into cleaning_time_budget_new (employee_id, slot, weekday, budget_minutes)
select employee_id, slot, wd, budget_minutes
from cleaning_time_budget, unnest(case when day_type = 'weekday' then array[1,2,3,4,5] else array[0,6] end) as wd;

drop table cleaning_time_budget;
alter table cleaning_time_budget_new rename to cleaning_time_budget;
