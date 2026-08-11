-- Zadania sprzątania nie-codzienne (co tydzień i rzadziej) już nie mają
-- ustalonego z góry dnia tygodnia — system dynamicznie wybiera dzień w
-- danym okresie (tydzień / 2-4-12 tygodni) na podstawie tego, kto faktycznie
-- pracuje i ma kompetencję do strefy (patrz src/lib/cleaning.ts:
-- cycleWindowDatesForFrequency + resolveCyclicDueDates). Kolumna weekdays
-- jest więc martwa.
alter table cleaning_task drop column if exists weekdays;
