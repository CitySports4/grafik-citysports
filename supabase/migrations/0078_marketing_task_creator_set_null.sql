-- Usunięcie pracownika nie kasuje jego zadań marketingu: twórcę zadania zerujemy.
alter table marketing_task alter column created_by_employee_id drop not null;
alter table marketing_task drop constraint if exists marketing_task_created_by_employee_id_fkey;
alter table marketing_task
  add constraint marketing_task_created_by_employee_id_fkey
  foreign key (created_by_employee_id) references employee(id) on delete set null;
