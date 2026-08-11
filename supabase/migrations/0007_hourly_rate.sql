-- Stawka godzinowa (PLN/h) — do kalkulatora wynagrodzeń recepcji (godziny ×
-- stawka). Domyślnie 0, admin uzupełnia per osoba.
alter table employee add column hourly_rate numeric(6, 2) not null default 0;
