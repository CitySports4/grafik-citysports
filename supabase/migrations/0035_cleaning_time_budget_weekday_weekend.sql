-- Budżety czasowe: dotąd JEDNA wartość per osoba+pora dnia, używana
-- identycznie każdego dnia tygodnia — mimo że sobota/niedziela realnie mają
-- więcej wolnego czasu (nie obowiązuje blokada 16:30-21:10, patrz
-- WEEKDAY_CLEANING_BLACKOUT). Wcześniejsza próba (migracja 0017) zastąpiła
-- "pora dnia" przez "dzień powszedni/weekend" i została cofnięta (0018) na
-- wyraźne życzenie — budżet miał zostać "per zmiana". Tym razem NIE
-- zastępujemy jednego wymiaru drugim, tylko dokładamy drugi obok — budżet
-- jest teraz per (pora dnia, dzień powszedni/weekend) naraz, do 8 wartości
-- na osobę zamiast 4. Świadomie NIE liczone automatycznie z realnych godzin
-- zmiany (to już robi resolveDaySlotFreeMinutes jako GÓRNE ograniczenie) —
-- admin nadal ręcznie ustawia "normę", bo więcej wolnego czasu w slocie nie
-- znaczy więcej możliwości: w weekend jest więcej rezerwacji/ruchu na
-- recepcji, więc realna zdolność do sprzątania nie rośnie proporcjonalnie do
-- długości zmiany.

create table cleaning_time_budget_new (
  employee_id uuid not null references employee(id) on delete cascade,
  slot text not null check (slot in ('otwarcie', 'srodek', 'zamkniecie', 'po_zamknieciu')),
  day_type text not null check (day_type in ('weekday', 'weekend')),
  budget_minutes integer not null default 60,
  primary key (employee_id, slot, day_type)
);

-- Istniejąca wartość per (osoba, pora dnia) staje się punktem startowym dla
-- OBU typów dnia — admin doprecyzuje weekend osobno, gdy będzie chciał.
insert into cleaning_time_budget_new (employee_id, slot, day_type, budget_minutes)
select employee_id, slot, dt, budget_minutes
from cleaning_time_budget, unnest(array['weekday', 'weekend']) as dt;

drop table cleaning_time_budget;
alter table cleaning_time_budget_new rename to cleaning_time_budget;
