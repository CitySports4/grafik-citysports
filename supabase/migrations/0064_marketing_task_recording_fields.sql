-- Pola nagraniowe na marketing_task — opcjonalne, pokazywane w formularzu
-- gdy assignee = Oliwia albo ręczny toggle "zadanie nagraniowe" (patrz Sprint
-- D, D1). Zamknięty zestaw formatów dostaje check (w przeciwieństwie do
-- "project" — tu nie ma osobnej tabeli zarządzanej z UI, więc check chroni
-- przed literówkami), reszta to zwykły opcjonalny tekst.

alter table marketing_task add column recording_format text check (recording_format is null or recording_format in ('rolka', 'relacja', 'zdjecia'));
alter table marketing_task add column recording_look_for text not null default '';
alter table marketing_task add column recording_mood text not null default '';
