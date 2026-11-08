-- Pole "project" na marketing_task i marketing_content — dowolny tekst
-- (nie enum/check), żeby dodanie nowego projektu nie wymagało migracji;
-- UI proponuje stały zestaw (Wigilia, Liga Deblowa, Półkolonie, Ogólne),
-- ale baza nie wymusza go na poziomie constraintu.

alter table marketing_task add column project text not null default '';
alter table marketing_content add column project text not null default '';
