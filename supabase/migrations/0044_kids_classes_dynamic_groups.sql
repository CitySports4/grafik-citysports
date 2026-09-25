-- Duża przebudowa "Zajęć dla dzieci": grupa (dzień/godzina/pojemność)
-- przestaje być sztywnym enumem (poniedzialek/czwartek/obie) i staje się
-- osobną, edytowalną tabelą — admin dodaje nowe dni/godziny, od razu
-- widoczne w formularzu. Dziecko może należeć do DOWOLNEJ liczby grup
-- naraz (koniec sztywnego "obie") — status (aktywny/oczekuje/rezygnacja)
-- musi więc żyć PER (dziecko, grupa) w nowej tabeli kids_class_enrollment,
-- nie na całym zgłoszeniu — inaczej zmiana jednej grupy i lista rezerwowa
-- per grupa nie miałyby sensu. kids_class_registration zostaje jako czysty
-- profil dziecka/rodzica (imię, data urodzenia, kontakt, zgody).

create table kids_class_group (
  id uuid primary key default gen_random_uuid(),
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  label text,
  capacity integer not null default 8,
  active boolean not null default true,
  sort_order integer not null default 0
);

-- Poniedziałek/Czwartek 1:1 z dotychczasowych limitów — GODZINY są
-- tymczasowym przybliżeniem (nie były nigdzie zapisane, tylko sama nazwa
-- dnia) — do poprawienia w nowej zakładce "Grupy" zaraz po wdrożeniu.
insert into kids_class_group (weekday, start_time, end_time, capacity, sort_order) values
  (1, '16:00', '17:00', 9, 1),
  (4, '16:00', '17:00', 8, 2);

create table kids_class_enrollment (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references kids_class_registration(id) on delete cascade,
  group_id uuid not null references kids_class_group(id) on delete restrict,
  status text not null default 'nowe'
    check (status in ('nowe', 'aktywny', 'oczekuje', 'brak_oplaty', 'rezygnacja')),
  created_at timestamptz not null default now(),
  -- Wspiera zaplanowaną zmianę grupy "od nowego miesiąca": stary zapis
  -- dostaje effective_until (ostatni dzień, w którym jeszcze zajmuje
  -- miejsce w SWOJEJ grupie), nowy zapis (inna grupa) dostaje
  -- effective_from w przyszłości — do tego dnia zajmuje miejsce jeszcze
  -- stary, od tego dnia nowy. "Aktualny" zapis = effective_from <= dziś
  -- <= (effective_until albo bez końca).
  effective_from date not null default current_date,
  effective_until date,
  used_trial boolean not null default false,
  paid_trial_fee boolean not null default false,
  check (effective_until is null or effective_until >= effective_from)
);
create index idx_kids_class_enrollment_group_status on kids_class_enrollment(group_id, status);
create index idx_kids_class_enrollment_registration on kids_class_enrollment(registration_id);

-- Przenosi dotychczasowe group_choice/status/used_trial/paid_trial_fee z
-- rejestracji do zapisów na grupy — "obie" tworzy DWA wiersze (po jednym
-- na grupę), z tymi samymi wartościami status/trial co oryginał.
insert into kids_class_enrollment (registration_id, group_id, status, created_at, used_trial, paid_trial_fee)
select r.id, g.id, r.status, r.created_at, r.used_trial, r.paid_trial_fee
from kids_class_registration r
join kids_class_group g on g.weekday = 1
where r.group_choice in ('poniedzialek', 'obie');

insert into kids_class_enrollment (registration_id, group_id, status, created_at, used_trial, paid_trial_fee)
select r.id, g.id, r.status, r.created_at, r.used_trial, r.paid_trial_fee
from kids_class_registration r
join kids_class_group g on g.weekday = 4
where r.group_choice in ('czwartek', 'obie');

alter table kids_class_registration drop column group_choice;
alter table kids_class_registration drop column status;
alter table kids_class_registration drop column used_trial;
alter table kids_class_registration drop column paid_trial_fee;
drop index if exists idx_kids_class_registration_status;

-- Frekwencja per konkretne zajęcia (data) — jeden wiersz per (zapis, dzień),
-- tworzony dopiero gdy ktoś faktycznie odhaczy obecność (nie pre-tworzymy
-- "nieobecny" dla każdej możliwej daty z góry).
create table kids_class_attendance (
  enrollment_id uuid not null references kids_class_enrollment(id) on delete cascade,
  session_date date not null,
  present boolean not null default true,
  marked_at timestamptz not null default now(),
  primary key (enrollment_id, session_date)
);

-- Limity miejsc teraz per grupa (kids_class_group.capacity) — cała tabela
-- ustawień staje się zbędna.
drop table kids_class_settings;
