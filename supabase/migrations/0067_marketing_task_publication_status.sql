-- Rozszerzenie statusu zadania o etap publikacji — dotąd "done" było jednym,
-- binarnym końcem (zrobione/nie), a klub potrzebuje rozróżnić "materiał
-- gotowy, czeka na publikację" od "faktycznie opublikowane" (ta sama
-- nazwa co już istniejące etapy marketing_content.status, świadomie — ten
-- sam koncept, tylko na poziomie zadania zamiast wpisu w kalendarzu, bo
-- większość zadań Oliwii nie ma linkowanej treści, patrz content_id).
--
-- "done" znika z dozwolonych wartości (zastąpione dwoma, bardziej
-- precyzyjnymi) — istniejące wiersze "done" migrują na "opublikowane"
-- (najbliższe znaczeniowo "w pełni zrobione").

alter table marketing_task drop constraint marketing_task_status_check;

update marketing_task set status = 'opublikowane' where status = 'done';

alter table marketing_task add constraint marketing_task_status_check
  check (status in ('todo', 'in_progress', 'gotowe', 'opublikowane'));
