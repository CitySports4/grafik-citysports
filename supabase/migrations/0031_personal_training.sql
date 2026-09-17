-- Trening personalny — nowa rola pracownika (Trener Personalny) i cały
-- osobny grafik obok zwykłych zmian: trener rezerwuje siebie i klienta na
-- termin, admin pilnuje, żeby sala się nie przepełniła (wspólny limit osób
-- naraz, liczony ze WSZYSTKICH trenerów razem), a rozliczenie idzie w
-- odwrotną stronę niż stawka godzinowa recepcji — to TRENER płaci klubowi
-- za każdą osobę na treningu.

alter table employee_role drop constraint employee_role_role_check;
alter table employee_role add constraint employee_role_role_check
  check (role in ('recepcja', 'sprzatanie', 'admin', 'trener_personalny'));

-- Cykl rozliczeń (tydzień/miesiąc) jest indywidualny per trener (różne
-- umowy) — w przeciwieństwie do limitu sali i stawki za osobę, które są
-- wspólne dla całego klubu (patrz personal_training_settings).
alter table employee add column pt_billing_cycle text check (pt_billing_cycle in ('weekly', 'monthly'));

-- Ustawienia klubowe treningów personalnych — jeden wiersz (singleton, id
-- zawsze 1), edytowalny tylko przez admina.
create table personal_training_settings (
  id integer primary key default 1 check (id = 1),
  room_capacity integer not null default 8,
  rate_per_person numeric(8, 2) not null default 0
);
insert into personal_training_settings (id) values (1);

-- Godziny, w których sala jest w ogóle dostępna na treningi personalne, per
-- dzień tygodnia — może być kilka okien tego samego dnia (przerwa między
-- nimi, np. 7:00–12:00 i 14:00–22:00). Brak wierszy dla danego dnia tygodnia
-- = sala niedostępna cały dzień.
create table personal_training_room_hours (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index idx_pt_room_hours_weekday on personal_training_room_hours(weekday);

-- Pojedynczy trening personalny — jeden wiersz = jedno KONKRETNE wystąpienie
-- (tak jak schedule_shift, nie "wirtualna" reguła powtarzania) — przy
-- treningu cyklicznym generujemy z góry każdy termin osobno aż do daty
-- końcowej, połączone tym samym series_id. Dzięki temu da się
-- edytować/usunąć jedno wystąpienie bez ruszania reszty serii.
create table personal_training_session (
  id uuid primary key default gen_random_uuid(),
  trainer_employee_id uuid not null references employee(id) on delete cascade,
  series_id uuid,
  date date not null,
  start_time time not null,
  duration_minutes smallint not null check (duration_minutes in (30, 45, 60, 90)),
  client_count smallint not null check (client_count > 0),
  -- Imię klienta widzi TYLKO trener-właściciel treningu (patrz filtrowanie w
  -- warstwie aplikacji) — inni trenerzy widzą tylko "Trener X — n/limit".
  client_name text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  is_settled boolean not null default false,
  -- Np. "opłacone z przeniesienia z 12.09" — widoczne przy automatycznym
  -- rozliczeniu z kredytu (patrz personal_training_credit), żeby recepcja
  -- rozumiała, skąd wzięło się info "opłacone", mimo że nikt nic nie zebrał.
  settled_note text,
  -- Stawka w chwili UTWORZENIA treningu — zmiana globalnej stawki później
  -- (personal_training_settings.rate_per_person) nie ma przepisywać kwot
  -- już zaplanowanych/rozliczonych treningów.
  rate_per_person_snapshot numeric(8, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_pt_session_trainer_date on personal_training_session(trainer_employee_id, date);
create index idx_pt_session_date on personal_training_session(date);
create index idx_pt_session_series on personal_training_session(series_id) where series_id is not null;

-- Kredyt z odwołanego, wcześniej rozliczonego treningu — pieniądze już są
-- zebrane, więc zamiast zwrotu automatycznie pokrywają najbliższy KOLEJNY
-- nierozliczony trening tego samego trenera. Jeśli w chwili odwołania taki
-- jeszcze nie istnieje, kredyt czeka tu nieprzypisany (applied_to_session_id
-- = null) i zostaje zużyty przy najbliższym nowo dodanym treningu tego
-- trenera.
create table personal_training_credit (
  id uuid primary key default gen_random_uuid(),
  trainer_employee_id uuid not null references employee(id) on delete cascade,
  source_session_id uuid not null references personal_training_session(id) on delete cascade,
  amount numeric(8, 2) not null,
  -- Gotowy tekst do settled_note treningu, na który kredyt trafi (patrz
  -- applyPendingCredits w treningi-personalne/actions.ts) — liczony raz, w
  -- chwili odwołania, z datą ODWOŁANEGO treningu.
  note text not null,
  applied_to_session_id uuid references personal_training_session(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_pt_credit_trainer_pending on personal_training_credit(trainer_employee_id) where applied_to_session_id is null;
