-- Przebudowa /projekty -> zakładka Marketing "Wydarzenia i kampanie"
-- (zgłoszenie 18.11.2026). Schemat + jednorazowy backfill w jednej
-- transakcji, żeby przy błędzie nic nie zostało w połowie.
begin;

-- 1) Schemat marketing_project.
alter table marketing_project drop constraint marketing_project_type_check;
alter table marketing_project add constraint marketing_project_type_check
  check (type in ('marketing', 'event', 'kampania'));

alter table marketing_project add column end_date date;
alter table marketing_project add column target_people int;
alter table marketing_project add column actual_people int;
alter table marketing_project add column target_label text not null default '';
alter table marketing_project add column to_confirm text not null default '';

-- 2) project_id (klucz obcy) obok istniejącej kolumny tekstowej "project" —
-- ta zostaje na czas przejścia (aplikacja zapisuje oba pola, czyta z
-- project_id), nie usuwamy jej tą migracją.
alter table marketing_content add column project_id uuid references marketing_project(id) on delete set null;
create index idx_marketing_content_project_id on marketing_content(project_id);

alter table marketing_task add column project_id uuid references marketing_project(id) on delete set null;
create index idx_marketing_task_project_id on marketing_task(project_id);

-- 3) RLS — zweryfikowane grepem 18.11.2026: cały dostęp do tych trzech
-- tabel idzie przez Server Actions z service_role (lib/supabase.ts),
-- żaden komponent kliencki nie odpytuje Supabase bezpośrednio. Bez polityk
-- — service_role i tak omija RLS, więc to tylko zamyka dostęp dla anon
-- (ten sam wzorzec, którym miały zostać objęte wszystkie tabele Grafiku —
-- zaległość z poprzedniej rozmowy, patrz odpowiedź o stanie RLS).
alter table marketing_project enable row level security;
alter table marketing_content enable row level security;
alter table marketing_task enable row level security;

-- 4) Backfill — znane przypadki z przeglądu 18.11.2026 (9 zadań "Styczeń
-- 2027" bez projektu, 1 zadanie "Marketing" -> Ogólne, reszta dopasowana
-- po nazwie). Kolor kampanii inny niż "Ogólne" (#7c3aed), żeby się nie
-- mylić wizualnie.
insert into marketing_project (name, type, event_date, end_date, color)
values ('Styczeń 2027', 'kampania', '2027-01-02', '2027-01-31', '#ea580c');

update marketing_task set project_id = mp.id
from marketing_project mp
where mp.name = trim(marketing_task.project) and marketing_task.project_id is null;

update marketing_content set project_id = mp.id
from marketing_project mp
where mp.name = trim(marketing_content.project) and marketing_content.project_id is null;

-- "Marketing" nie pasuje do żadnej nazwy projektu -> Ogólne, zapisane w
-- obu polach (project i project_id), bo aplikacja docelowo pisze oba naraz.
update marketing_task set project = 'Ogólne', project_id = (select id from marketing_project where name = 'Ogólne')
where project = 'Marketing';

commit;
