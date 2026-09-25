-- Zgoda na wizerunek usunięta z formularza zapisu — kolumna nieużywana
-- nigdzie indziej (nigdy nie była pokazywana w panelu /zajecia-dzieci).
alter table kids_class_registration drop column image_consent;
