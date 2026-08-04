-- Sprzątanie ma teraz też godzinę zakończenia (żeby liczyć je do godzin
-- przydzielonych pracownikom) i może mieć przypisanych uczestników
-- (participant_employee_ids już istnieje na schedule_event).
alter table schedule_event add column end_time time;

-- Nie każdy pracownik sprząta (np. Sasza) — filtrowane przy wyborze
-- uczestników sprzątania i w generatorze propozycji.
alter table employee add column can_clean boolean not null default true;
