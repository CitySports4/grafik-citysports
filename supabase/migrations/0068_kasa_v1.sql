-- Moduł "Kasa" v1 (SPEC_kasa_v1.md, 10.11.2026) — pełne zastąpienie fazy 1-2
-- (migracja 0061): tamten moduł wymagał ręcznego wpisywania wpływów
-- gotówką/kartą; tu wszystko liczy się samo z transakcji eFitness (najpierw
-- import z Excela — dane logowania do Data Lake API jeszcze nie przyszły —
-- docelowo też Data Lake, patrz TransactionSource w lib/kasa-import.ts,
-- wspólny model, podmieniane tylko źródło). W produkcji stary moduł miał
-- tylko 3 puste, otwarte dni bez żadnych dokumentów (07-09.11.2026) — zero
-- realnych danych do migracji, więc czyścimy i budujemy od nowa. Bez RLS —
-- tak jak reszta bazy, autoryzacja w warstwie aplikacji.

drop table if exists cash_audit_log;
drop table if exists cash_attachment;
drop table if exists cash_document;
drop table if exists cash_income_entry;
drop table if exists cash_count;
drop table if exists cash_day;
drop table if exists kasa_category;
drop table if exists kasa_settings;

-- Słownik form płatności eFitness -> kategoria kasowa (pkt 2 spec). name =
-- "Forma płatności" dokładnie jak w eksporcie Excela/API (jedyny klucz, bo
-- eksport Excela nie ma payment form ID — to dojdzie dopiero z Data Lake).
-- Brak dopasowania w tej tabeli = kategoria "ignore" (pozostałe formy, poza
-- zakresem kasy) — nie trzeba więc wypisywać wszystkich możliwych nazw.
create table payment_forms_map (
  id uuid primary key default gen_random_uuid(),
  efitness_payment_form_id int unique,
  name text not null unique,
  category text not null check (category in ('cash', 'card', 'nonfiscal', 'online', 'ignore')),
  created_at timestamptz not null default now()
);
insert into payment_forms_map (name, category) values
  ('Gotówka', 'cash'),
  ('Karta', 'card'),
  ('Niefiskalna', 'nonfiscal'),
  ('Online', 'online');

-- Surowe transakcje z eFitness — wspólny model dla ExcelImportSource (teraz)
-- i DataLakeSource (później). efitness_id (pole Id z API) wypełnia tylko
-- DataLakeSource; eksport Excela go nie ma, więc dedup/upsert dla źródła
-- "excel" idzie po (full_number, transaction_date, value) — UWAGA: w
-- realnych danych (raport RK/2026/11/00001, pozycje 20-21) trafił się
-- duplikat full_number (KP/2026/11/00018) z dwiema różnymi kwotami tego
-- samego dnia, więc sam full_number NIE wystarcza jako klucz.
create table efitness_transactions (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('excel', 'api')),
  efitness_id bigint unique,
  type int not null,
  value numeric(10, 2) not null,
  payment_form_name text not null default '',
  payment_form_id uuid references payment_forms_map(id) on delete set null,
  user_name text not null default '',
  contractor text not null default '',
  member_ref text not null default '',
  description text not null default '',
  number text not null default '',
  full_number text not null default '',
  fiscal_document_number text,
  cash_report_full_number text not null default '',
  transaction_date date not null,
  transaction_at timestamptz,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (full_number, transaction_date, value)
);
create index idx_efitness_transactions_date on efitness_transactions(transaction_date);
create index idx_efitness_transactions_type on efitness_transactions(type);

-- Jeden wiersz na dzień kasowy — DATA KALENDARZOWA TRANSAKCJI, nie raport
-- kasowy eFitness (te bywają wielodniowe, np. RK/2026/10/00021 trwał
-- 31.10-02.11, patrz pkt 10 spec). rd_number nadawany dopiero przy
-- zamknięciu (aplikacja, bez luk), nie przy utworzeniu dnia.
create table cash_days (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  rd_number int unique,
  opening_balance numeric(10, 2) not null default 0,
  terminal_total numeric(10, 2),
  fiscal_daily_total numeric(10, 2),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by_employee_id uuid references employee(id) on delete set null,
  closed_at timestamptz,
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_cash_days_date on cash_days(date);

-- 3 liczenia dziennie (otwarcie/zmiana/zamknięcie) — expected/difference
-- zapisane w momencie liczenia (nie przeliczane wstecz, patrz spec: "Liczenia
-- się nie zmieniają", tylko znacznik "przeliczono" w UI gdy dane z eFitness
-- się zmienią później).
create table cash_counts (
  id uuid primary key default gen_random_uuid(),
  cash_day_id uuid not null references cash_days(id) on delete cascade,
  slot text not null check (slot in ('open', 'shift', 'close')),
  counted numeric(10, 2) not null,
  expected numeric(10, 2) not null,
  difference numeric(10, 2) not null,
  explanation text not null default '',
  employee_id uuid references employee(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cash_day_id, slot)
);

create table cash_months (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null,
  rk_number int,
  opening_balance numeric(10, 2),
  closing_balance numeric(10, 2),
  status text not null default 'open' check (status in ('open', 'closed')),
  rk_pdf_path text,
  package_path text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (year, month)
);

-- Status dokumentu KW/KP (pkt 4 spec) — 1:1 z transakcją eFitness (KW/KP
-- rozpoznane po type=3/4), nie tworzone ręcznie.
create table cash_doc_links (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references efitness_transactions(id) on delete cascade unique,
  doc_type text check (doc_type in ('receipt', 'ksef_invoice', 'foreign_invoice', 'awaiting_invoice', 'other')),
  ksef_number text,
  note text not null default '',
  status text not null default 'todo' check (status in ('todo', 'complete', 'waiting')),
  updated_by_employee_id uuid references employee(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Załączniki — skany/zdjęcia KW, opcjonalne zdjęcia wydruków dnia, raport
-- okresowy kasy fiskalnej na koniec miesiąca. Dokładnie jeden właściciel
-- (link_id XOR cash_day_id XOR cash_month_id), Supabase Storage (bucket
-- prywatny), przechowywanie min. 5 lat.
create table cash_attachments (
  id uuid primary key default gen_random_uuid(),
  link_id uuid references cash_doc_links(id) on delete cascade,
  cash_day_id uuid references cash_days(id) on delete cascade,
  cash_month_id uuid references cash_months(id) on delete cascade,
  kind text not null check (kind in ('kw_doc', 'fiscal_daily', 'fiscal_monthly', 'terminal_slip')),
  storage_path text not null,
  original_name text not null,
  uploaded_by_employee_id uuid not null references employee(id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  constraint cash_attachments_one_owner check (
    (case when link_id is not null then 1 else 0 end) +
    (case when cash_day_id is not null then 1 else 0 end) +
    (case when cash_month_id is not null then 1 else 0 end) = 1
  )
);
create index idx_cash_attachments_link on cash_attachments(link_id);
create index idx_cash_attachments_day on cash_attachments(cash_day_id);
create index idx_cash_attachments_month on cash_attachments(cash_month_id);

-- Bilans otwarcia i numeracja startowa (pkt 6 spec) — jeden wiersz,
-- konfigurowany przy starcie systemu.
create table kasa_settings (
  id int primary key default 1 check (id = 1),
  start_date date,
  opening_balance numeric(10, 2),
  first_rd_number int not null default 1,
  reminder_days int not null default 7,
  updated_at timestamptz not null default now()
);
insert into kasa_settings (id) values (1);

-- Log korekt po zamknięciu dnia/miesiąca — tylko admin, zawsze z powodem.
create table kasa_audit_log (
  id uuid primary key default gen_random_uuid(),
  cash_day_id uuid references cash_days(id) on delete cascade,
  cash_month_id uuid references cash_months(id) on delete cascade,
  employee_id uuid not null references employee(id) on delete cascade,
  action text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
