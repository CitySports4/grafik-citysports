-- Dodanie treści do kalendarza z przypisaną osobą automatycznie tworzy
-- powiązane zadanie (patrz createContent w app/(app)/marketing/actions.ts)
-- — bez przypisanej osoby zadanie nie ma sensu (nikt by go nie zobaczył na
-- swojej liście), więc tworzy się tylko wtedy. Po utworzeniu zadanie żyje
-- niezależnie: odznaczenie treści jako "Opublikowane" NIE zamyka
-- automatycznie zadania i odwrotnie — to świadomie dwie osobne rzeczy do
-- odhaczenia. content_id tylko pozwala sprawdzić "czy ten wpis już ma
-- zadanie" (żeby edycja nie tworzyła duplikatów) i kasuje zadanie razem z
-- treścią, jeśli ta zniknie z kalendarza.
alter table marketing_task add column content_id uuid references marketing_content(id) on delete cascade;
create index idx_marketing_task_content on marketing_task(content_id);
