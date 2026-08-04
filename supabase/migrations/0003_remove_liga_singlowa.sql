-- Usunięto "liga singlowa" jako osobny typ wydarzenia — zostają liga open,
-- liga deblowa, sprzątanie, warsztaty, inne.
alter table schedule_event drop constraint schedule_event_type_check;
alter table schedule_event add constraint schedule_event_type_check
  check (type in ('liga_open', 'liga_deblowa', 'sprzatanie', 'warsztaty', 'custom'));
