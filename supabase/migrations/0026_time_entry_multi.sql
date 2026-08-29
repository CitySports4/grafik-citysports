-- Pozwól na wiele wpisów godzin w jednym dniu dla tej samej osoby — do tej
-- pory unique(employee_id, date) wymuszało dokładnie JEDEN przedział
-- godzinowy na dzień, co nie oddawało realnych podzielonych zmian z przerwą
-- (np. 08:00–10:00 i 15:00–22:00 tego samego dnia). Nazwa ograniczenia to
-- domyślna konwencja Postgresa dla `unique (employee_id, date)` zadeklarowanego
-- inline w migracji 0006.
alter table time_entry drop constraint if exists time_entry_employee_id_date_key;
