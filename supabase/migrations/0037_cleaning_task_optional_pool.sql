-- "Wolność wyboru": obowiązkowe zadania pozostają jak dotąd, ale niektóre
-- zadania mogą trafiać do "puli do wyboru" zamiast być sztywno wymagane —
-- pracownik dostaje kilka kandydatów na daną porę dnia i wybiera tyle, ile
-- zmieści się w jego budżecie (patrz resolveTasksForDate / capPoolCandidates
-- / flagBudgetOverflow w cleaning.ts, sekcja "Do wyboru" w CleaningDayList).
--
-- Domyślnie do puli trafiają zadania codzienne sparowane rano/wieczór
-- (carry_pair_task_id) — typu "niebieski mop": mają już wbudowaną siatkę
-- bezpieczeństwa (czego nie zrobisz wieczorem, zrobi ktoś rano, patrz
-- resolveCarryOverrides), więc nie muszą być sztywno obowiązkowe. Pozostałe
-- zadania (codzienne bez pary i wszystkie cykliczne) zostają obowiązkowe —
-- admin może to ręcznie zmienić per zadanie w konfiguracji.
alter table cleaning_task add column optional boolean not null default false;

update cleaning_task
set optional = true
where frequency = 'daily' and carry_pair_task_id is not null;
