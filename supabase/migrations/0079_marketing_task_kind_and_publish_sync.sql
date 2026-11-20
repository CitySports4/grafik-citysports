-- Rodzaj zadania (rozpoznaje zadania publikacji dla synchronizacji ze statusem wpisu)
alter table marketing_task add column if not exists kind text;
alter table marketing_task drop constraint if exists marketing_task_kind_check;

update marketing_task set kind = case
  when title like 'Nagrać i opublikować —%' then 'nagrac_opublikowac'
  when title like 'Nagrać —%' then 'nagrac'
  when title like 'Zmontować i przekazać —%' then 'zmontowac'
  when title like 'Opublikować —%' then 'opublikowac'
  when title like 'Przygotować zdjęcie/grafikę —%' or title like 'Przygotować animację —%' then 'przygotowac'
  else null end
where kind is null;

alter table marketing_task add constraint marketing_task_kind_check
  check (kind is null or kind in ('nagrac', 'zmontowac', 'przygotowac', 'opublikowac', 'nagrac_opublikowac'));

-- Jedna transakcja: status wpisu + (opcjonalnie) status jednego zadania + synchronizacja zadań.
-- Wpis -> opublikowane: wszystkie otwarte zadania wpisu -> done.
-- Wpis cofnięty z opublikowane: zadania publikacji -> todo, pozostałe bez zmian.
create or replace function marketing_set_content_status_sync(
  p_content_id uuid,
  p_status text,
  p_task_id uuid default null,
  p_task_status text default null
) returns void
language plpgsql
as $$
declare
  prev text;
begin
  select status into prev from marketing_content where id = p_content_id for update;
  if prev is null then
    raise exception 'Nie znaleziono wpisu kalendarza.';
  end if;

  update marketing_content set status = p_status, updated_at = now() where id = p_content_id;

  if p_task_id is not null and p_task_status is not null then
    update marketing_task set status = p_task_status, updated_at = now() where id = p_task_id;
  end if;

  if p_status = 'opublikowane' then
    update marketing_task set status = 'done', updated_at = now()
      where content_id = p_content_id and archived = false and status <> 'done';
  elsif prev = 'opublikowane' then
    update marketing_task set status = 'todo', updated_at = now()
      where content_id = p_content_id and kind in ('opublikowac', 'nagrac_opublikowac') and status = 'done';
  end if;
end;
$$;
