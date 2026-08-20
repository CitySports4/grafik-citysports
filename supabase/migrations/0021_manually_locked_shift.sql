-- Ręczne przypisanie (wybór konkretnej osoby albo "NIECZYNNE" z rozwijanej
-- listy w edytorze grafiku) jest teraz TRWAŁĄ decyzją admina, której żaden
-- generator (deterministyczny ani AI) nie nadpisuje — dopiero jawne wybranie
-- "— nieprzypisane —" zwalnia zmianę z powrotem do puli generatora. Bez
-- tego rozróżnienia AI (patrz schedule-generator-ai.ts) traktowało KAŻDĄ
-- otwartą zmianę jako do obsadzenia od nowa, więc potrafiło nadpisać to, co
-- admin już świadomie ustawił ręcznie.
alter table schedule_shift add column if not exists manually_locked boolean not null default false;
