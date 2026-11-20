-- Zadania marketingu: 3 statusy (todo / in_progress / done), termin "do" / "w dniu",
-- automatyczne schowanie starych zrobionych zadań, usunięcie zadania nie kasuje
-- zadań powiązanych z wpisem kalendarza (ON DELETE SET NULL zamiast CASCADE).

alter table marketing_task
  add column if not exists due_kind text not null default 'do'
  check (due_kind in ('do', 'w_dniu'));

alter table marketing_task drop constraint if exists marketing_task_status_check;

update marketing_task set status = 'done' where status in ('gotowe', 'opublikowane');

alter table marketing_task
  add constraint marketing_task_status_check
  check (status in ('todo', 'in_progress', 'done'));

update marketing_task
  set archived = true
  where status = 'done' and updated_at < now() - interval '7 days';

alter table marketing_task drop constraint if exists marketing_task_content_id_fkey;
alter table marketing_task
  add constraint marketing_task_content_id_fkey
  foreign key (content_id) references marketing_content(id) on delete set null;
