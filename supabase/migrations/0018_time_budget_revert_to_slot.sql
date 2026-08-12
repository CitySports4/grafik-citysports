-- Cofnięcie 0017: po dalszej rozmowie budżety wracają na "per pora dnia"
-- (otwarcie/środek/zamknięcie/po zamknięciu) — to dokładnie zgodne z
-- oryginalnym briefem ("budżety czasowe per osoba per pora dnia... rano:
-- Krzysztof 150, Justyna 120, Karol 120; przy różnicy >20 min system
-- przenosi zadania") i z tym, co potwierdził użytkownik ("per zmiana").
-- Dzień powszedni/weekend miały tę samą wartość zaraz po 0017 (uśrednioną
-- z poprzednich per-slot wartości), więc bierzemy 'weekday' jako punkt
-- startowy dla wszystkich 4 slotów — i tak do dostrojenia przez admina.

create table cleaning_time_budget_new (
  employee_id uuid not null references employee(id) on delete cascade,
  slot text not null check (slot in ('otwarcie', 'srodek', 'zamkniecie', 'po_zamknieciu')),
  budget_minutes integer not null default 60,
  primary key (employee_id, slot)
);

insert into cleaning_time_budget_new (employee_id, slot, budget_minutes)
select employee_id, s, budget_minutes
from cleaning_time_budget, unnest(array['otwarcie', 'srodek', 'zamkniecie', 'po_zamknieciu']) as s
where day_type = 'weekday';

drop table cleaning_time_budget;
alter table cleaning_time_budget_new rename to cleaning_time_budget;
