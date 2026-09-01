-- Osobne oznaczenie "to był wpis pracy zdalnej" — niezależne od tego, czy
-- notatka była wymagana (patrz allow_remote_work w migracji 0027). Admin ma
-- to widzieć wprost przy wpisie (np. w Wynagrodzeniach), a nie dopiero po
-- przeczytaniu notatki albo domyśleniu się z braku zmiany w grafiku.
alter table time_entry add column is_remote boolean not null default false;
