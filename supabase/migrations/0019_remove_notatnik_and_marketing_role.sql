-- Notatnik (notatki ogólne, pomysły, plany, projekty) znika z aplikacji —
-- zostaje tylko system zadań, dla którego notatnik był jednym z trybów.
-- Kasujemy wpisy, które nie są zadaniami (is_task=false — notatki, pomysły,
-- plany; kasuje kaskadowo powiązane note_link/note_comment), tabele
-- projektów i kolumny specyficzne dla notatnika. Kolumna is_task przestaje
-- mieć sens, skoro w tabeli zostają wyłącznie zadania — usuwamy ją też.

delete from note where is_task = false;

-- Kolejność ma znaczenie: note.project_id ma klucz obcy do project, więc
-- musi zniknąć PRZED zrzuceniem tabeli project (inaczej "cannot drop table
-- project because other objects depend on it").
alter table note
  drop column if exists project_id,
  drop column if exists category,
  drop column if exists is_long_term,
  drop column if exists due_date,
  drop column if exists is_task;

drop table if exists project_link;
drop table if exists project;

-- Rola "marketing" — nieużywana, redukujemy role funkcyjne do trzech
-- (recepcja, sprzątanie, admin). Osoby, które ją miały, dostają recepcję
-- (tak samo jak przy pierwotnym wprowadzeniu ról w 0005), żeby nikt nie
-- został bez żadnej roli.

insert into employee_role (employee_id, role)
select employee_id, 'recepcja' from employee_role where role = 'marketing'
on conflict do nothing;

delete from employee_role where role = 'marketing';

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'employee_role'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%marketing%';
  if con_name is not null then
    execute format('alter table employee_role drop constraint %I', con_name);
  end if;
end $$;

alter table employee_role add constraint employee_role_role_check
  check (role in ('recepcja', 'sprzatanie', 'admin'));
