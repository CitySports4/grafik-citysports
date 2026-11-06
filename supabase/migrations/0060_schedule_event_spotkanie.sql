-- "Spotkanie" jest od dawna wybieralne w formularzu dodawania wydarzenia
-- (src/lib/event-types.ts), ale nigdy nie trafiło do check constraint na
-- schedule_event.type (ostatnio ustawionego migracją 0003) — każda próba
-- zapisania wydarzenia typu "Spotkanie" kończyła się błędem bazy
-- (schedule_event_type_check), widocznym w appce jako nieopisany błąd
-- Server Components.
alter table schedule_event drop constraint schedule_event_type_check;
alter table schedule_event add constraint schedule_event_type_check
  check (type in ('liga_open', 'liga_deblowa', 'sprzatanie', 'warsztaty', 'spotkanie', 'custom'));
