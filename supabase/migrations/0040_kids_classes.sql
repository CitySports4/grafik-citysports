-- Zajęcia dla dzieci — port dawnego systemu zapisów na Google Apps
-- Script (formularz + panel administracyjny nad Arkuszem Google) na stałe
-- do tej aplikacji, jako nowa sekcja obok grafiku i treningów personalnych.
--
-- Zamiast "wiek" jako zapisana w momencie zgłoszenia wartość (jak w starym
-- systemie — z czasem się dezaktualizuje, dziecko rośnie w trakcie sezonu),
-- trzymamy tylko datę urodzenia i wiek liczymy na bieżąco tam, gdzie trzeba
-- (patrz src/lib/kids-classes.ts, ageOnDate) — zawsze aktualne, jedno źródło
-- prawdy.
create table kids_class_registration (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_name text not null,
  birth_date date not null,
  parent_name text not null,
  phone text not null,
  email text,
  -- Czy rodzic jest osiągalny przez WhatsApp (nie osobny numer — patrz
  -- realne dane źródłowe: zawsze Tak/Nie, ten sam numer co `phone`).
  whatsapp_contact boolean not null default false,
  -- 'obie' liczy się do limitu OBU dni naraz — patrz computeOccupancy.
  group_choice text not null check (group_choice in ('poniedzialek', 'czwartek', 'obie')),
  has_experience boolean not null default false,
  rodo_consent boolean not null default false,
  terms_consent boolean not null default false,
  image_consent boolean not null default false,
  status text not null default 'nowe'
    check (status in ('nowe', 'aktywny', 'oczekuje', 'brak_oplaty', 'rezygnacja')),
  used_trial boolean not null default false,
  paid_trial_fee boolean not null default false
);
create index idx_kids_class_registration_status on kids_class_registration(status);

-- Płaska tabela miesięcy sezonu (wrzesień..czerwiec, patrz SEASON_MONTHS w
-- kids-classes.ts) — jeden wiersz na dziecko, tak jak w starym arkuszu
-- Płatności (jedna linia, bez sekcji/scaleń), tylko znormalizowana do
-- osobnej tabeli zamiast 10 kolumn wprost w rejestracji.
create table kids_class_payment (
  registration_id uuid primary key references kids_class_registration(id) on delete cascade,
  months boolean[] not null default array_fill(false, array[10])
);

-- Limity miejsc — jeden wiersz, tak jak cleaning_settings (id boolean
-- zawsze true wymusza dokładnie jeden rekord).
create table kids_class_settings (
  id boolean primary key default true check (id),
  limit_poniedzialek integer not null default 8,
  limit_czwartek integer not null default 8
);
insert into kids_class_settings (id) values (true);
