-- Migracje 0012 i 0013 zostały rozbudowane (nowe sekcje dopisane do już
-- istniejących plików) PO tym, jak ich wcześniejsza wersja została ręcznie
-- uruchomiona na produkcji — więc same ALTER/CREATE TABLE (schemat) się
-- wykonały, ale dopisane później sekcje (dane startowe stref/zadań/
-- checklist w 0012; project_link + note.source w 0013) nigdy nie zostały
-- wklejone i uruchomione. Efekt: puste "Kompetencje sprzątania" (brak stref
-- i zadań), i wszędzie tam gdzie kod odwołuje się do note.source — błąd
-- "column note.source does not exist". Ta migracja dogrywa DOKŁADNIE to, co
-- brakuje — bezpieczna do uruchomienia teraz niezależnie od stanu (idempotentna:
-- IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / warunek na puste tabele przed
-- seedem), więc nic nie zduplikuje ani nie nadpisze.

-- ── Notatnik: brakujące elementy z 0013 ─────────────────────────────────

create table if not exists project_link (
  project_id_a uuid not null references project(id) on delete cascade,
  project_id_b uuid not null references project(id) on delete cascade,
  primary key (project_id_a, project_id_b),
  constraint project_link_no_self check (project_id_a <> project_id_b)
);

alter table note add column if not exists source text not null default 'human' check (source in ('human', 'ai'));

update note set source = 'ai' where title like '🤖%' and source <> 'ai';

create index if not exists idx_note_project on note(project_id);
create index if not exists idx_note_source on note(source);
create index if not exists idx_note_comment_note on note_comment(note_id);
create index if not exists idx_cleaning_task_carry_pair on cleaning_task(carry_pair_task_id);
create index if not exists idx_cleaning_task_skip_with on cleaning_task(skip_with_task_id);
create index if not exists idx_cleaning_checklist_template_item on cleaning_checklist_template_item(template_id);

-- ── Sprzątanie: brakująca kolumna z 0012 ────────────────────────────────
-- Ten sam wzorzec co note.source powyżej — slug był dopisany do pliku 0012
-- już PO tym, jak reszta tamtej migracji (day_constraint, note,
-- carry_pair_task_id, skip_with_task_id, sort_order — te już istnieją)
-- została uruchomiona, więc jego dodanie nigdy nie poszło. Bez tego insert
-- zadań niżej od razu wywala błąd "column slug does not exist".

alter table cleaning_task add column if not exists slug text unique;

-- ── Sprzątanie: brakujące dane z 0012 (strefy, checklisty, 61 zadań) ────
-- Uwaga: bez kolumny weekdays w insercie zadań — 0015 ją usunęła (dzień
-- wykonania jest teraz wyznaczany dynamicznie z grafiku, nie konfigurowany).
-- Cały blok gated na "cleaning_zone jest puste", żeby nie duplikować, gdyby
-- ktoś jednak część tego już ręcznie dosiał.

do $$
begin
  if not exists (select 1 from cleaning_zone limit 1) then

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

    insert into cleaning_task (slug, zone_id, name, time_minutes, frequency, slot, requires_ladder, note, sort_order, checklist_template_id)
    select
      d.slug, z.id, d.name, d.time_minutes, d.frequency, d.slot, d.requires_ladder, d.note, d.sort_order, ct.id
    from (values
      -- RANO -> otwarcie
      ('r-blaty',      'Recepcja',                    'Blaty',                                     10, 'daily',    'otwarcie', false, null,                                     1,  null),
      ('r-san-dol',    'Dolny relax',                  'Sanitariaty',                                15, 'daily',    'otwarcie', false, null,                                     2,  'san-dol'),
      ('r-san-szat-d', 'Szatnia damska',               'Sanitariaty + pufy',                         20, 'daily',    'otwarcie', false, null,                                     3,  'san-szat-d'),
      ('r-san-szat-m', 'Szatnia męska',                'Sanitariaty + pufy',                         15, 'daily',    'otwarcie', false, null,                                     4,  'san-szat-m'),
      ('r-dyw',        'Relax dół + Relax góra',       'Dywany — 2 strefy',                          15, 'daily',    'otwarcie', false, null,                                     5,  null),
      ('r-podl-szat',  'Szatnie',                      'Podłogi — szatnie',                          10, 'daily',    'otwarcie', false, null,                                     6,  null),
      ('r-podl-dol',   'Dolny relax',                  'Podłogi — dolny relax',                      10, 'daily',    'otwarcie', false, null,                                     7,  null),
      ('mop-fit-g-r',  'Sala fitness góra',            'Niebieski mop + układanie sprzętu',          15, 'daily',    'otwarcie', false, 'Przed pierwszymi zajęciami',            8,  null),
      ('mop-fit-d-r',  'Sala fitness dół',             'Niebieski mop + układanie sprzętu',          15, 'daily',    'otwarcie', false, 'Przed pierwszymi zajęciami',            9,  null),
      ('mop-bad-r',    'Badminton',                    'Niebieski mop — badminton',                  10, 'daily',    'otwarcie', false, 'Przed pierwszą rezerwacją na korty',    10, null),
      ('d-squash',     'Squash',                       'Odkurzanie kortów',                          20, '3xweek',   'otwarcie', false, null,                                     11, null),
      ('w-bad',        'Badminton',                    'Mycie kortów z odsuwaniem słupków',          60, 'weekly',   'otwarcie', false, null,                                     12, null),
      ('m-klima',      'Klimatyzacja',                 'Czyszczenie filtrów — 6 jednostek',          30, 'monthly',  'otwarcie', true,  null,                                     13, null),
      ('m-panel',      'Squash',                       'Panel nad kortami',                          20, 'monthly',  'otwarcie', true,  null,                                     14, null),
      ('m-szd-g',      'Szatnia damska',               'Szafki od góry',                             15, 'monthly',  'otwarcie', true,  null,                                     15, null),
      ('m-szm-g',      'Szatnia męska',                'Szafki od góry',                             15, 'monthly',  'otwarcie', true,  null,                                     16, null),
      ('m-relg-g',     'Relax góra',                   'Szafki od góry',                              5, 'monthly',  'otwarcie', true,  null,                                     17, null),
      ('m-pajak',      'Cały klub',                    'Pajęczyny — przejście po całym klubie',      35, 'monthly',  'otwarcie', false, null,                                     18, null),
      ('m-firanki',    'Badminton',                    'Za firanami kortów — odkurzanie',            15, 'monthly',  'otwarcie', false, null,                                     19, null),

      -- POPOŁUDNIE -> srodek
      ('w-kab',        'Szatnia damska',               'Kabiny prysznicowe',                         25, 'weekly',   'srodek',   false, null,                                     20, null),
      ('w-szafki',     'Szatnie × 2',                  'Szafki w środku — obie szatnie',             40, 'weekly',   'srodek',   false, null,                                     21, null),
      ('w-pryszn',     'Szatnia męska',                'Prysznice',                                  40, 'weekly',   'srodek',   false, null,                                     22, null),
      ('w-bibl',       'Relax góra',                   'Biblioteka + szafki w środku',               20, 'weekly',   'srodek',   false, null,                                     23, null),
      ('w-pkrt',       'Między kortami',               'Podłogi',                                    10, 'weekly',   'srodek',   false, null,                                     24, null),
      ('w-socj',       'Socjalne',                     'Blat',                                        5, 'weekly',   'srodek',   false, null,                                     25, null),
      ('bw01',         'Dolny relax',                  'Kanapy, stoliki, śmietniki, TV',             20, 'biweekly', 'srodek',   false, null,                                     26, null),
      ('bw02',         'Relax góra',                   'Kanapy, stoliki, śmietniki',                 30, 'biweekly', 'srodek',   false, null,                                     27, null),
      ('bw03',         'Między kortami',               'Kanapy i stoliki',                           35, 'biweekly', 'srodek',   false, null,                                     28, null),
      ('bw04',         'Między kortami',               'Schody — stopnie + poręcze',                 20, 'biweekly', 'srodek',   false, null,                                     29, null),
      ('bw05',         'Sala fitness góra',            'Stojaki, kosze, parapety',                   40, 'biweekly', 'srodek',   false, null,                                     30, null),
      ('bw06',         'Sala fitness góra',            'Lustra',                                     30, 'biweekly', 'srodek',   true,  null,                                     31, null),
      ('bw07',         'Sala fitness dół',             'Stojaki, za stojakami',                      40, 'biweekly', 'srodek',   false, null,                                     32, null),
      ('m01',          'Recepcja',                     'Za komputerami, pod ladą, lodówki',          20, 'monthly',  'srodek',   false, null,                                     33, null),
      ('m02',          'Recepcja',                     'Drzwi wejściowe',                            20, 'monthly',  'srodek',   false, null,                                     34, null),
      ('m03',          'Dolny relax',                  'Drzwi do toalet i kortów',                   15, 'monthly',  'srodek',   false, null,                                     35, null),
      ('m04',          'Szatnia damska',               'Drzwi',                                      15, 'monthly',  'srodek',   false, null,                                     36, null),
      ('m05',          'Szatnia męska',                'Drzwi',                                      10, 'monthly',  'srodek',   false, null,                                     37, null),
      ('m06',          'Relax góra',                   'Drzwi wejściowe',                            10, 'monthly',  'srodek',   false, null,                                     38, null),
      ('m07',          'Między kortami',               'Pod schodami — 2 strefy',                    40, 'monthly',  'srodek',   false, null,                                     39, null),
      ('m08',          'Badminton',                    'Mycie z zalewaniem (zastępuje tygodniowe)',  90, 'monthly',  'srodek',   false, null,                                     40, null),
      ('m09',          'Sala fitness góra',            'Światełka',                                  10, 'quarterly','srodek',   false, null,                                     41, null),
      ('m10',          'Sala fitness dół',             'Światełka',                                  10, 'quarterly','srodek',   false, null,                                     42, null),
      ('m11',          'Socjalne',                     'Lodówka, zmywarka, szafki',                  30, 'quarterly','srodek',   false, null,                                     43, null),
      ('q-kratki-san', 'Kratki — toalety + szatnie',   'Odkurzanie kratek — toalety i szatnie',      10, 'quarterly','otwarcie', false, null,                                     44, null),
      ('q-kratki-fit', 'Kratki — sala fitness',        'Odkurzanie kratek — sala fitness',           30, 'quarterly','otwarcie', false, null,                                     45, null),
      ('q-szyby-rel-d','Dolny relax',                  'Szyby',                                      35, 'quarterly','srodek',   false, null,                                     46, null),
      ('q-szyby-rel-g','Relax góra',                   'Szyby',                                      35, 'quarterly','srodek',   false, null,                                     47, null),
      ('q-szyby-miedzy','Między kortami',              'Szyby',                                      35, 'quarterly','srodek',   false, null,                                     48, null),
      ('q-za-kanapa-sq3','Squash — 3. kort',           'Sprzątanie za kanapą',                       25, 'quarterly','srodek',   false, null,                                     49, null),
      ('q-pod-kanapy', 'Relaksy + squash',             'Odkurzanie pod kanapami',                    30, 'quarterly','srodek',   false, null,                                     50, null),

      -- WIECZÓR -> zamkniecie
      ('blaty-w',      'Recepcja',                     'Blaty',                                      10, 'daily',   'zamkniecie', false, null,                                   51, null),
      ('san-dol-w',    'Dolny relax',                  'Sanitariaty',                                 15, 'daily',   'zamkniecie', false, null,                                   52, 'san-dol'),
      ('podl-dol-w',   'Dolny relax',                  'Podłogi — dolny relax',                       10, 'daily',   'zamkniecie', false, null,                                   53, null),
      ('fit-podl-g',   'Sala fitness góra',            'Mycie podłóg — fitness góra',                 20, '2xweek',  'zamkniecie', false, 'Wt + Sob',                              54, null),
      ('fit-podl-d',   'Sala fitness dół',             'Mycie podłóg — fitness dół',                  20, '2xweek',  'zamkniecie', false, 'Śr + Nd',                               55, null),
      ('mop-fit-g-w',  'Sala fitness góra',            'Niebieski mop + układanie sprzętu',           15, 'daily',   'zamkniecie', false, 'Piątek: przed zamknięciem 20:30–21:00', 56, null),
      ('mop-fit-d-w',  'Sala fitness dół',             'Niebieski mop + układanie sprzętu',           15, 'daily',   'zamkniecie', false, 'Piątek: przed zamknięciem 20:30–21:00', 57, null),
      ('dyw-w',        'Relax dół + Relax góra',       'Dywany — 2 strefy',                           15, 'daily',   'zamkniecie', false, null,                                   58, null),
      ('smiec',        'Cały klub',                    'Wyrzucanie śmieci',                           10, 'daily',   'zamkniecie', false, null,                                   59, null),

      -- PO ZAMKNIĘCIU
      ('mop-bad-w',    'Badminton',                    'Niebieski mop — badminton',                   10, 'daily',   'po_zamknieciu', false, null,                                60, null),

      -- WEEKEND
      ('smiec-wknd',   'Cały klub',                    'Wyrzucanie śmieci',                           10, 'weekly',  'otwarcie', false, null,                                     61, null)
    ) as d(slug, zone_name, name, time_minutes, frequency, slot, requires_ladder, note, sort_order, checklist_template_name)
    join cleaning_zone z on z.name = d.zone_name
    left join cleaning_checklist_template ct on ct.name = d.checklist_template_name;

    update cleaning_task set day_constraint = 'not_weekend' where slug = 'smiec';

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

    update cleaning_task a set skip_with_task_id = b.id
    from cleaning_task b
    where (a.slug, b.slug) in (
      ('mop-fit-g-r', 'bw05'), ('mop-fit-g-w', 'bw05'),
      ('mop-fit-d-r', 'bw07'), ('mop-fit-d-w', 'bw07')
    );

  end if;
end $$;
