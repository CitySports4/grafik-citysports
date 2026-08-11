-- Pełny port systemu sprzątania ze starego prototypu (city_sports_sprzatanie.html,
-- Firebase). Rozszerza model z 0009: 4 sloty (dochodzi "po zamknięciu"), więcej
-- częstotliwości (2x/3x w tygodniu), wiele dni tygodnia per zadanie, powiązania
-- carry/skip-with, notatki, szablony checklist, budżety czasowe, niezdolność do
-- pracy na drabinie per osoba.

-- ── Schemat ──────────────────────────────────────────────────────────────

alter table cleaning_task drop constraint if exists cleaning_task_slot_check;
alter table cleaning_task add constraint cleaning_task_slot_check
  check (slot in ('otwarcie', 'srodek', 'zamkniecie', 'po_zamknieciu'));

alter table cleaning_task drop constraint if exists cleaning_task_frequency_check;
alter table cleaning_task add constraint cleaning_task_frequency_check
  check (frequency in ('daily', '2xweek', '3xweek', 'weekly', 'biweekly', 'monthly', 'quarterly'));

-- Pojedynczy weekday -> tablica (obsługuje 2x/3x-tydzień jako kilka dni naraz).
alter table cleaning_task drop column weekday;
alter table cleaning_task add column weekdays integer[] not null default '{}';

alter table cleaning_task
  add column slug text unique,
  add column day_constraint text check (day_constraint in ('mon_fri', 'not_weekend')),
  add column note text,
  add column carry_pair_task_id uuid references cleaning_task(id),
  add column skip_with_task_id uuid references cleaning_task(id),
  add column sort_order integer not null default 0;

-- Generalizacja hardkodowanych wykluczeń z prototypu (tam: "Justyna" nie robi
-- zadań na drabinie) — teraz per-osoba, ustawiane w edycji pracownika.
alter table employee add column no_ladder boolean not null default false;

-- Budżety czasowe per osoba per slot — do auto-balansowania obciążenia w dni,
-- gdy w tym samym slocie pracuje więcej niż jedna osoba.
create table cleaning_time_budget (
  employee_id uuid not null references employee(id) on delete cascade,
  slot text not null check (slot in ('otwarcie', 'srodek', 'zamkniecie', 'po_zamknieciu')),
  budget_minutes integer not null default 60,
  primary key (employee_id, slot)
);

-- Reużywalne szablony checklist (współdzielone między zadaniami, jak CL w
-- prototypie) — zamiast checklisty 1:1 przypiętej do jednego zadania.
create table cleaning_checklist_template (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
create table cleaning_checklist_template_item (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references cleaning_checklist_template(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0
);
alter table cleaning_task add column checklist_template_id uuid references cleaning_checklist_template(id);

create index idx_cleaning_task_carry_pair on cleaning_task(carry_pair_task_id);
create index idx_cleaning_task_skip_with on cleaning_task(skip_with_task_id);
create index idx_cleaning_checklist_template_item on cleaning_checklist_template_item(template_id);

-- ── Strefy (20, wyciągnięte z prototypu) ────────────────────────────────
-- Uwaga: kompetencje (kto może sprzątać którą strefę) NIE są tu zgadywane na
-- podstawie starych imion z prototypu (Krzysztof/Justyna/Karol/Sasza) — mogą
-- nie odpowiadać 1:1 obecnym pracownikom. Admin przypisuje je ręcznie w
-- Konfiguracja sprzątania → Kompetencje po tej migracji.

insert into cleaning_zone (name, group_code) values
  ('Recepcja', 'A'),
  ('Cały klub', 'A'),
  ('Dolny relax', 'B'),
  ('Relax dół + Relax góra', 'B'),
  ('Szatnia damska', 'B'),
  ('Szatnie × 2', 'B'),
  ('Szatnie', 'B'),
  ('Szatnia męska', 'C'),
  ('Relax góra', 'C'),
  ('Między kortami', 'C'),
  ('Badminton', 'D'),
  ('Squash', 'D'),
  ('Sala fitness góra', 'D'),
  ('Sala fitness dół', 'D'),
  ('Socjalne', 'D'),
  ('Klimatyzacja', 'D'),
  ('Kratki — toalety + szatnie', 'A'),
  ('Kratki — sala fitness', 'A'),
  ('Squash — 3. kort', 'A'),
  ('Relaksy + squash', 'A');

-- ── Szablony checklist (3, sanitariaty) ─────────────────────────────────

insert into cleaning_checklist_template (name) values
  ('san-szat-d'), ('san-szat-m'), ('san-dol');

insert into cleaning_checklist_template_item (template_id, label, sort_order)
select t.id, item.label, item.ord
from cleaning_checklist_template t
join (values
  ('san-szat-d', 'Lustra', 0), ('san-szat-d', 'Umywalki + krany', 1), ('san-szat-d', 'Pojemnik na mydło', 2),
  ('san-szat-d', 'Blat', 3), ('san-szat-d', 'Suszarka do rąk', 4), ('san-szat-d', 'Toaleta', 5),
  ('san-szat-d', 'Szczotka do WC + kosz higieniczny (przetrzeć)', 6), ('san-szat-d', 'Wymiana worka — kosz higieniczny', 7),
  ('san-szat-d', 'Baterie prysznicowe', 8), ('san-szat-d', 'Korki', 9), ('san-szat-d', 'Pufy', 10),

  ('san-szat-m', 'Lustra', 0), ('san-szat-m', 'Umywalki + krany', 1), ('san-szat-m', 'Pojemnik na mydło', 2),
  ('san-szat-m', 'Blat', 3), ('san-szat-m', 'Suszarka do rąk', 4), ('san-szat-m', 'Toaleta + pisuar', 5),
  ('san-szat-m', 'Szczotka do WC', 6), ('san-szat-m', 'Odpływ prysznicowy', 7),
  ('san-szat-m', 'Baterie prysznicowe', 8), ('san-szat-m', 'Pufy', 9),

  ('san-dol', '♀ Lustra — WC damska', 0), ('san-dol', '♀ Umywalka + kran — WC damska', 1),
  ('san-dol', '♀ Pojemnik na mydło — WC damska', 2), ('san-dol', '♀ Suszarka do rąk — WC damska', 3),
  ('san-dol', '♀ Toaleta — WC damska', 4), ('san-dol', '♀ Szczotka do WC + kosz (przetrzeć) — WC damska', 5),
  ('san-dol', '♀ Wymiana worka — WC damska', 6), ('san-dol', '♂ Lustra — WC męska', 7),
  ('san-dol', '♂ Umywalka + kran — WC męska', 8), ('san-dol', '♂ Pojemnik na mydło — WC męska', 9),
  ('san-dol', '♂ Suszarka do rąk — WC męska', 10), ('san-dol', '♂ Toaleta + pisuar — WC męska', 11),
  ('san-dol', '♂ Szczotka do WC — WC męska', 12)
) as item(template_name, label, ord) on item.template_name = t.name;

-- ── Zadania (61, wyciągnięte z prototypu) ───────────────────────────────
-- weekdays: konwencja JS Date#getDay() (0=niedziela..6=sobota), zgodna z
-- resztą aplikacji — przeliczone ze starej konwencji md (1=pon..7=nd).

insert into cleaning_task (slug, zone_id, name, time_minutes, frequency, weekdays, slot, requires_ladder, note, sort_order, checklist_template_id)
select
  d.slug, z.id, d.name, d.time_minutes, d.frequency, d.weekdays, d.slot, d.requires_ladder, d.note, d.sort_order, ct.id
from (values
  -- RANO -> otwarcie
  ('r-blaty',      'Recepcja',                    'Blaty',                                     10, 'daily',     '{}'::int[],   'otwarcie', false, null,                                     1,  null),
  ('r-san-dol',    'Dolny relax',                  'Sanitariaty',                                15, 'daily',     '{}'::int[],   'otwarcie', false, null,                                     2,  'san-dol'),
  ('r-san-szat-d', 'Szatnia damska',               'Sanitariaty + pufy',                         20, 'daily',     '{}'::int[],   'otwarcie', false, null,                                     3,  'san-szat-d'),
  ('r-san-szat-m', 'Szatnia męska',                'Sanitariaty + pufy',                         15, 'daily',     '{}'::int[],   'otwarcie', false, null,                                     4,  'san-szat-m'),
  ('r-dyw',        'Relax dół + Relax góra',       'Dywany — 2 strefy',                          15, 'daily',     '{}'::int[],   'otwarcie', false, null,                                     5,  null),
  ('r-podl-szat',  'Szatnie',                      'Podłogi — szatnie',                          10, 'daily',     '{}'::int[],   'otwarcie', false, null,                                     6,  null),
  ('r-podl-dol',   'Dolny relax',                  'Podłogi — dolny relax',                      10, 'daily',     '{}'::int[],   'otwarcie', false, null,                                     7,  null),
  ('mop-fit-g-r',  'Sala fitness góra',            'Niebieski mop + układanie sprzętu',          15, 'daily',     '{}'::int[],   'otwarcie', false, 'Przed pierwszymi zajęciami',            8,  null),
  ('mop-fit-d-r',  'Sala fitness dół',             'Niebieski mop + układanie sprzętu',          15, 'daily',     '{}'::int[],   'otwarcie', false, 'Przed pierwszymi zajęciami',            9,  null),
  ('mop-bad-r',    'Badminton',                    'Niebieski mop — badminton',                  10, 'daily',     '{}'::int[],   'otwarcie', false, 'Przed pierwszą rezerwacją na korty',    10, null),
  ('d-squash',     'Squash',                       'Odkurzanie kortów',                          20, '3xweek',    '{1,3,5}'::int[], 'otwarcie', false, null,                                  11, null),
  ('w-bad',        'Badminton',                    'Mycie kortów z odsuwaniem słupków',          60, 'weekly',    '{1}'::int[],  'otwarcie', false, null,                                     12, null),
  ('m-klima',      'Klimatyzacja',                 'Czyszczenie filtrów — 6 jednostek',          30, 'monthly',   '{3}'::int[],  'otwarcie', true,  null,                                     13, null),
  ('m-panel',      'Squash',                       'Panel nad kortami',                          20, 'monthly',   '{4}'::int[],  'otwarcie', true,  null,                                     14, null),
  ('m-szd-g',      'Szatnia damska',               'Szafki od góry',                             15, 'monthly',   '{2}'::int[],  'otwarcie', true,  null,                                     15, null),
  ('m-szm-g',      'Szatnia męska',                'Szafki od góry',                             15, 'monthly',   '{3}'::int[],  'otwarcie', true,  null,                                     16, null),
  ('m-relg-g',     'Relax góra',                   'Szafki od góry',                              5, 'monthly',   '{4}'::int[],  'otwarcie', true,  null,                                     17, null),
  ('m-pajak',      'Cały klub',                    'Pajęczyny — przejście po całym klubie',      35, 'monthly',   '{2}'::int[],  'otwarcie', false, null,                                     18, null),
  ('m-firanki',    'Badminton',                    'Za firanami kortów — odkurzanie',            15, 'monthly',   '{2}'::int[],  'otwarcie', false, null,                                     19, null),

  -- POPOŁUDNIE -> srodek
  ('w-kab',        'Szatnia damska',               'Kabiny prysznicowe',                         25, 'weekly',    '{1}'::int[],  'srodek',   false, null,                                     20, null),
  ('w-szafki',     'Szatnie × 2',                  'Szafki w środku — obie szatnie',             40, 'weekly',    '{2}'::int[],  'srodek',   false, null,                                     21, null),
  ('w-pryszn',     'Szatnia męska',                'Prysznice',                                  40, 'weekly',    '{3}'::int[],  'srodek',   false, null,                                     22, null),
  ('w-bibl',       'Relax góra',                   'Biblioteka + szafki w środku',               20, 'weekly',    '{4}'::int[],  'srodek',   false, null,                                     23, null),
  ('w-pkrt',       'Między kortami',               'Podłogi',                                    10, 'weekly',    '{5}'::int[],  'srodek',   false, null,                                     24, null),
  ('w-socj',       'Socjalne',                     'Blat',                                        5, 'weekly',    '{0}'::int[],  'srodek',   false, null,                                     25, null),
  ('bw01',         'Dolny relax',                  'Kanapy, stoliki, śmietniki, TV',             20, 'biweekly',  '{1}'::int[],  'srodek',   false, null,                                     26, null),
  ('bw02',         'Relax góra',                   'Kanapy, stoliki, śmietniki',                 30, 'biweekly',  '{2}'::int[],  'srodek',   false, null,                                     27, null),
  ('bw03',         'Między kortami',               'Kanapy i stoliki',                           35, 'biweekly',  '{3}'::int[],  'srodek',   false, null,                                     28, null),
  ('bw04',         'Między kortami',               'Schody — stopnie + poręcze',                 20, 'biweekly',  '{4}'::int[],  'srodek',   false, null,                                     29, null),
  ('bw05',         'Sala fitness góra',            'Stojaki, kosze, parapety',                   40, 'biweekly',  '{5}'::int[],  'srodek',   false, null,                                     30, null),
  ('bw06',         'Sala fitness góra',            'Lustra',                                     30, 'biweekly',  '{5}'::int[],  'srodek',   true,  null,                                     31, null),
  ('bw07',         'Sala fitness dół',             'Stojaki, za stojakami',                      40, 'biweekly',  '{6}'::int[],  'srodek',   false, null,                                     32, null),
  ('m01',          'Recepcja',                     'Za komputerami, pod ladą, lodówki',          20, 'monthly',   '{1}'::int[],  'srodek',   false, null,                                     33, null),
  ('m02',          'Recepcja',                     'Drzwi wejściowe',                            20, 'monthly',   '{1}'::int[],  'srodek',   false, null,                                     34, null),
  ('m03',          'Dolny relax',                  'Drzwi do toalet i kortów',                   15, 'monthly',   '{2}'::int[],  'srodek',   false, null,                                     35, null),
  ('m04',          'Szatnia damska',               'Drzwi',                                      15, 'monthly',   '{2}'::int[],  'srodek',   false, null,                                     36, null),
  ('m05',          'Szatnia męska',                'Drzwi',                                      10, 'monthly',   '{3}'::int[],  'srodek',   false, null,                                     37, null),
  ('m06',          'Relax góra',                   'Drzwi wejściowe',                            10, 'monthly',   '{4}'::int[],  'srodek',   false, null,                                     38, null),
  ('m07',          'Między kortami',               'Pod schodami — 2 strefy',                    40, 'monthly',   '{4}'::int[],  'srodek',   false, null,                                     39, null),
  ('m08',          'Badminton',                    'Mycie z zalewaniem (zastępuje tygodniowe)',  90, 'monthly',   '{5}'::int[],  'srodek',   false, null,                                     40, null),
  ('m09',          'Sala fitness góra',            'Światełka',                                  10, 'quarterly', '{5}'::int[],  'srodek',   false, null,                                     41, null),
  ('m10',          'Sala fitness dół',             'Światełka',                                  10, 'quarterly', '{6}'::int[],  'srodek',   false, null,                                     42, null),
  ('m11',          'Socjalne',                     'Lodówka, zmywarka, szafki',                  30, 'quarterly', '{6}'::int[],  'srodek',   false, null,                                     43, null),
  ('q-kratki-san', 'Kratki — toalety + szatnie',   'Odkurzanie kratek — toalety i szatnie',      10, 'quarterly', '{3}'::int[],  'otwarcie', false, null,                                     44, null),
  ('q-kratki-fit', 'Kratki — sala fitness',        'Odkurzanie kratek — sala fitness',           30, 'quarterly', '{6}'::int[],  'otwarcie', false, null,                                     45, null),
  ('q-szyby-rel-d','Dolny relax',                  'Szyby',                                      35, 'quarterly', '{1}'::int[],  'srodek',   false, null,                                     46, null),
  ('q-szyby-rel-g','Relax góra',                   'Szyby',                                      35, 'quarterly', '{2}'::int[],  'srodek',   false, null,                                     47, null),
  ('q-szyby-miedzy','Między kortami',              'Szyby',                                      35, 'quarterly', '{3}'::int[],  'srodek',   false, null,                                     48, null),
  ('q-za-kanapa-sq3','Squash — 3. kort',           'Sprzątanie za kanapą',                       25, 'quarterly', '{4}'::int[],  'srodek',   false, null,                                     49, null),
  ('q-pod-kanapy', 'Relaksy + squash',             'Odkurzanie pod kanapami',                    30, 'quarterly', '{5}'::int[],  'srodek',   false, null,                                     50, null),

  -- WIECZÓR -> zamkniecie
  ('blaty-w',      'Recepcja',                     'Blaty',                                      10, 'daily',   '{}'::int[],     'zamkniecie', false, null,                                   51, null),
  ('san-dol-w',    'Dolny relax',                  'Sanitariaty',                                 15, 'daily',   '{}'::int[],     'zamkniecie', false, null,                                   52, 'san-dol'),
  ('podl-dol-w',   'Dolny relax',                  'Podłogi — dolny relax',                       10, 'daily',   '{}'::int[],     'zamkniecie', false, null,                                   53, null),
  ('fit-podl-g',   'Sala fitness góra',            'Mycie podłóg — fitness góra',                 20, '2xweek',  '{2,6}'::int[],  'zamkniecie', false, 'Wt + Sob',                              54, null),
  ('fit-podl-d',   'Sala fitness dół',             'Mycie podłóg — fitness dół',                  20, '2xweek',  '{3,0}'::int[],  'zamkniecie', false, 'Śr + Nd',                               55, null),
  ('mop-fit-g-w',  'Sala fitness góra',            'Niebieski mop + układanie sprzętu',           15, 'daily',   '{}'::int[],     'zamkniecie', false, 'Piątek: przed zamknięciem 20:30–21:00', 56, null),
  ('mop-fit-d-w',  'Sala fitness dół',             'Niebieski mop + układanie sprzętu',           15, 'daily',   '{}'::int[],     'zamkniecie', false, 'Piątek: przed zamknięciem 20:30–21:00', 57, null),
  ('dyw-w',        'Relax dół + Relax góra',       'Dywany — 2 strefy',                           15, 'daily',   '{}'::int[],     'zamkniecie', false, null,                                   58, null),
  ('smiec',        'Cały klub',                    'Wyrzucanie śmieci',                           10, 'daily',   '{}'::int[],     'zamkniecie', false, null,                                   59, null),

  -- PO ZAMKNIĘCIU
  ('mop-bad-w',    'Badminton',                    'Niebieski mop — badminton',                   10, 'daily',   '{}'::int[],     'po_zamknieciu', false, null,                                60, null),

  -- WEEKEND
  ('smiec-wknd',   'Cały klub',                    'Wyrzucanie śmieci',                           10, 'weekly',  '{6}'::int[],    'otwarcie', false, null,                                     61, null)
) as d(slug, zone_name, name, time_minutes, frequency, weekdays, slot, requires_ladder, note, sort_order, checklist_template_name)
join cleaning_zone z on z.name = d.zone_name
left join cleaning_checklist_template ct on ct.name = d.checklist_template_name;

-- "smiec" jedyne zadanie, gdzie ograniczenie dnia faktycznie coś dodaje ponad
-- stały weekday (bo nie ma stałego dnia — leci codziennie poza weekendem).
update cleaning_task set day_constraint = 'not_weekend' where slug = 'smiec';

-- ── Powiązania carry (rano ↔ wieczór, ta sama czynność) ─────────────────

update cleaning_task a set carry_pair_task_id = b.id
from cleaning_task b
where (a.slug, b.slug) in (
  ('r-blaty', 'blaty-w'), ('blaty-w', 'r-blaty'),
  ('r-san-dol', 'san-dol-w'), ('san-dol-w', 'r-san-dol'),
  ('r-podl-dol', 'podl-dol-w'), ('podl-dol-w', 'r-podl-dol'),
  ('r-dyw', 'dyw-w'), ('dyw-w', 'r-dyw'),
  ('mop-fit-g-r', 'mop-fit-g-w'), ('mop-fit-g-w', 'mop-fit-g-r'),
  ('mop-fit-d-r', 'mop-fit-d-w'), ('mop-fit-d-w', 'mop-fit-d-r'),
  ('mop-bad-r', 'mop-bad-w'), ('mop-bad-w', 'mop-bad-r')
);

-- ── Powiązania skip-with (biweekly zadanie zastępuje codzienny mop tego dnia) ──

update cleaning_task a set skip_with_task_id = b.id
from cleaning_task b
where (a.slug, b.slug) in (
  ('mop-fit-g-r', 'bw05'), ('mop-fit-g-w', 'bw05'),
  ('mop-fit-d-r', 'bw07'), ('mop-fit-d-w', 'bw07')
);
