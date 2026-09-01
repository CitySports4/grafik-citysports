-- Niektórzy pracownicy (np. Sasza) mają zgodę na wpisywanie godzin pracy
-- zdalnej, której nie ma w ogóle w grafiku (nieplanowana z góry) — bez tej
-- flagi każdy wpis bez zaplanowanej zmiany tego dnia wymagał obowiązkowej
-- notatki z wyjaśnieniem (patrz requiresDiscrepancyNote w
-- lib/time-entry-window.ts), co dla takich osób jest zbędnym tarciem przy
-- czymś, na co i tak mają już zgodę.
alter table employee add column allow_remote_work boolean not null default false;
