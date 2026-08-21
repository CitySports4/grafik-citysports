-- Poprawki po przeglądzie listy zadań sprzątania.

-- 1) Poranny/wieczorny mop w Sali fitness (góra/dół) jest CODZIENNY i nie
--    powinien być zastępowany przez zadanie dwutygodniowe ("Lustra" /
--    "Stojaki, za stojakami") — to była błędna decyzja projektowa z 0012,
--    mop jest zawsze potrzebny niezależnie od tego, co jeszcze danego dnia
--    wypada w tej samej strefie.
update cleaning_task set skip_with_task_id = null
where slug in ('mop-fit-g-r', 'mop-fit-g-w', 'mop-fit-d-r', 'mop-fit-d-w');

-- 2) "Panel nad kortami" -> co kwartał (było: co 4 tygodnie / monthly).
update cleaning_task set frequency = 'quarterly' where slug = 'm-panel';

-- 3) Dwa osobne zadania "kratki" (toalety+szatnie / sala fitness) scalone w
--    jedno, obejmujące cały klub — podział na 2 zadania o tej samej
--    częstotliwości i porze dnia, różniące się tylko strefą, nie miał
--    uzasadnienia. Czas: suma obu (10 + 30).
update cleaning_task
set slug = 'q-kratki',
    name = 'Odkurzanie kratek wentylacyjnych',
    zone_id = (select id from cleaning_zone where name = 'Cały klub'),
    time_minutes = 40
where slug = 'q-kratki-san';

delete from cleaning_task where slug = 'q-kratki-fit';

-- Strefy "Kratki — ..." zostają bez żadnego zadania po scaleniu powyżej —
-- usuwamy (kasuje kaskadowo ewentualne przypisane kompetencje do tych stref,
-- patrz employee_cleaning_zone.zone_id on delete cascade w 0009).
delete from cleaning_zone where name in ('Kratki — toalety + szatnie', 'Kratki — sala fitness');

-- 4) Koncepcja "wymaga drabiny" / "nie może wchodzić na drabinę" znika z
--    systemu — nikt już nie ma takiego ograniczenia, więc pole tylko myliło
--    (sugerowało realną regułę, która nic nie robiła).
alter table cleaning_task drop column if exists requires_ladder;
alter table employee drop column if exists no_ladder;
