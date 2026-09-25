-- Realne godziny obecnie aktywnych grup (Poniedziałek, Czwartek) — 0044
-- wstawiła tymczasowe przybliżenie 16:00-17:00, bo godziny nie były nigdzie
-- zapisane wcześniej.
update kids_class_group set end_time = '17:30' where weekday in (1, 4) and start_time = '16:00' and end_time = '17:00';
