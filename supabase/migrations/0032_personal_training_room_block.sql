-- Blokada sali treningów personalnych — administrator może zablokować salkę
-- na dowolny fragment dnia (np. wynajem komuś innemu, własne potrzeby klubu),
-- niezależnie od zwykłych godzin dostępności sali i limitu osób. W czasie
-- blokady NIE da się zaplanować żadnego treningu, bez względu na liczbę
-- osób — patrz treningi-personalne/actions.ts, gdzie blokada jest wpuszczana
-- do tego samego sprawdzenia dostępności co zwykłe treningi (jako "trening"
-- zajmujący całą salę, patrz komentarz przy checkAvailability).
create table personal_training_room_block (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_by_employee_id uuid references employee(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index idx_pt_room_block_date on personal_training_room_block(date);
