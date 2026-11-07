-- Moduł "Kasa" — zastępuje papierowy raport dobowy (RD) i raport kasowy
-- (RK): zamknięcie dnia, KW/KP ze zdjęciem, archiwum. Faza 1-2 ze
-- specyfikacji (dane + ręczny wpis wpływów + dokumenty + PDF RD) — bez
-- integracji eFitness/PayU/OCR (wymagają dostępu do zewnętrznych API,
-- których jeszcze nie mamy) i bez roli "ksiegowa" (na razie niepotrzebna,
-- dojdzie przy automatycznej paczce miesięcznej). Bez RLS — tak jak reszta
-- bazy, autoryzacja w warstwie aplikacji.

create table kasa_settings (
  id int primary key default 1 check (id = 1),
  next_rd_number int not null default 1,
  cash_limit numeric(10, 2),
  updated_at timestamptz not null default now()
);
insert into kasa_settings (id) values (1);

create table kasa_category (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into kasa_category (name, sort_order) values
  ('Materiały', 1), ('Środki czystości', 2), ('Naprawy/serwis', 3),
  ('Ogłoszenia/reklama', 4), ('Opłaty i prowizje', 5), ('Inne', 6);

-- Jeden wiersz na dzień kasowy. rd_number nadawany dopiero przy zamknięciu
-- (zob. closeCashDay w actions.ts), nie przy utworzeniu — dzień "otwarty"
-- jeszcze nie ma numeru RD, tak jak papierowy dokument nie istnieje, dopóki
-- nie zostanie wypełniony do końca.
create table cash_day (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  rd_number int unique,
  opening_balance numeric(10, 2) not null default 0,
  expected_closing numeric(10, 2),
  counted_closing numeric(10, 2),
  difference numeric(10, 2),
  explanation text not null default '',
  status text not null default 'open' check (status in ('open', 'closed', 'corrected')),
  closed_by_employee_id uuid references employee(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_cash_day_date on cash_day(date);

-- Liczenie gotówki w szufladzie o konkretnej porze — osobno od wpływów
-- (cash_income_entry), bo to dwa różne fakty: "ile faktycznie leży" vs "ile
-- powinno wpłynąć ze sprzedaży".
create table cash_count (
  id uuid primary key default gen_random_uuid(),
  cash_day_id uuid not null references cash_day(id) on delete cascade,
  slot text not null check (slot in ('08:00', '14:00', 'zamkniecie')),
  counted_amount numeric(10, 2) not null,
  employee_id uuid references employee(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cash_day_id, slot)
);

-- Wpływy gotówką/kartą per okno czasowe — ręczny wpis w Fazie 1 (docelowo z
-- importu eFitness, patrz Data Lake API w specyfikacji), stąd brak pola
-- "źródło" na razie: wszystko jest ręczne, dopóki nie dojdzie import.
create table cash_income_entry (
  id uuid primary key default gen_random_uuid(),
  cash_day_id uuid not null references cash_day(id) on delete cascade,
  -- "time_window", nie "window" — window to słowo zarezerwowane w Postgresie
  -- (funkcje okienkowe), psuje składnię create table.
  time_window text not null check (time_window in ('do_8', '8_14', '14_zamkniecie')),
  cash_amount numeric(10, 2) not null default 0,
  card_amount numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (cash_day_id, time_window)
);

-- KW (rozchód) / KP (przychód spoza sprzedaży) — numer w formacie
-- RRRR/M/NNNNN nadawany przy utworzeniu (patrz nextDocumentNumber w
-- lib/kasa.ts), osobna sekwencja per typ+miesiąc, tak jak na papierze.
create table cash_document (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('KW', 'KP')),
  number text not null unique,
  cash_day_id uuid not null references cash_day(id) on delete cascade,
  counterparty text not null default '',
  source_doc_number text not null default '',
  amount numeric(10, 2) not null,
  category text,
  description text not null default '',
  created_by_employee_id uuid not null references employee(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index idx_cash_document_day on cash_document(cash_day_id);

-- Załączniki — zdjęcia/skany trzymane na firmowym Google Drive (ustalone z
-- userem), tu tylko metadane + link. document_id ALBO cash_day_id ustawione
-- (nigdy oba, nigdy żadne) — załącznik do konkretnego KW/KP, albo do dnia
-- (wydruk terminala, potwierdzenia kartowe).
create table cash_attachment (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references cash_document(id) on delete cascade,
  cash_day_id uuid references cash_day(id) on delete cascade,
  kind text not null check (kind in ('paragon', 'faktura', 'raport_okresowy', 'terminal', 'potwierdzenie_karty', 'inne')),
  drive_file_id text not null,
  drive_url text not null,
  file_name text not null,
  uploaded_by_employee_id uuid not null references employee(id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  constraint cash_attachment_one_owner check (
    (document_id is not null and cash_day_id is null) or (document_id is null and cash_day_id is not null)
  )
);
create index idx_cash_attachment_document on cash_attachment(document_id);
create index idx_cash_attachment_day on cash_attachment(cash_day_id);

-- Log korekt po zamknięciu dnia (status='corrected') — tylko admin może
-- cofnąć zamknięcie i poprawić, zawsze z zapisanym powodem.
create table cash_audit_log (
  id uuid primary key default gen_random_uuid(),
  cash_day_id uuid not null references cash_day(id) on delete cascade,
  employee_id uuid not null references employee(id) on delete cascade,
  action text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
