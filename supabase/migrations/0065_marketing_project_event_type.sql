-- Projekty eventowe (Wigilia, Półkolonie, Liga Deblowa, ...) dostają własną
-- sekcję /projekty, osobną od /marketing/projekty (patrz Sprint D, D2) — ale
-- dzielą tę samą tabelę marketing_project, nie osobną "event_project":
-- zadania (marketing_task.project) i tak łączą się z projektami wyłącznie po
-- nazwie (zwykły tekst, nie klucz obcy — patrz migracje 0062/0063), więc
-- osobna tabela wymagałaby duplikowania całego tego mechanizmu łączenia
-- zamiast prostego filtra po type.
--
-- event_date/status/notes mają sens tylko dla type='event' (dla
-- type='marketing' zostają NULL/puste) — to świadomy kompromis: jedna,
-- spójna tabela projektów zamiast dwóch rozjeżdżających się systemów.

alter table marketing_project add column type text not null default 'marketing' check (type in ('marketing', 'event'));
alter table marketing_project add column event_date date;
alter table marketing_project add column status text check (status is null or status in ('planowanie', 'w_toku', 'zamkniety'));
alter table marketing_project add column notes text not null default '';

update marketing_project
  set type = 'event', status = 'planowanie'
  where name in ('Wigilia', 'Półkolonie', 'Liga Deblowa');
