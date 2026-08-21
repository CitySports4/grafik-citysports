-- Porządkowanie stref sprzątania — 4 strefy używane przez dokładnie 1
-- zadanie dublowały bardziej ogólne/konkretne strefy. Rozbijamy 2 zadania
-- "obie szatnie naraz" na osobne per szatnia (spójnie z resztą zadań, które
-- już rozróżniają damską/męską — sanitariaty, prysznice, szafki od góry), a
-- 2 pojedyncze zadania dołączamy do sąsiedniej, już istniejącej strefy.

-- "Podłogi — szatnie" (Szatnie, wspólna) -> osobno per szatnia.
update cleaning_task
set slug = 'r-podl-szat-d',
    name = 'Podłogi — szatnia damska',
    zone_id = (select id from cleaning_zone where name = 'Szatnia damska'),
    time_minutes = 5
where slug = 'r-podl-szat';

insert into cleaning_task (slug, zone_id, name, time_minutes, frequency, slot, active, note, sort_order)
select 'r-podl-szat-m', (select id from cleaning_zone where name = 'Szatnia męska'),
       'Podłogi — szatnia męska', 5, 'daily', 'otwarcie', true, null, 6;

-- "Szafki w środku — obie szatnie" (Szatnie × 2) -> osobno per szatnia.
update cleaning_task
set slug = 'w-szafki-d',
    name = 'Szafki w środku — szatnia damska',
    zone_id = (select id from cleaning_zone where name = 'Szatnia damska'),
    time_minutes = 20
where slug = 'w-szafki';

insert into cleaning_task (slug, zone_id, name, time_minutes, frequency, slot, active, note, sort_order)
select 'w-szafki-m', (select id from cleaning_zone where name = 'Szatnia męska'),
       'Szafki w środku — szatnia męska', 20, 'weekly', 'srodek', true, null, 21;

-- "Sprzątanie za kanapą" (Squash — 3. kort) i "Odkurzanie pod kanapami"
-- (Relaksy + squash) -> obie do strefy "Między kortami".
update cleaning_task
set zone_id = (select id from cleaning_zone where name = 'Między kortami')
where slug in ('q-za-kanapa-sq3', 'q-pod-kanapy');

delete from cleaning_zone where name in ('Szatnie', 'Szatnie × 2', 'Squash — 3. kort', 'Relaksy + squash');
