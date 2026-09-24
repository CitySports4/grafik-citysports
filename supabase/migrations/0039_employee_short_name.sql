-- Imię skrócone do grafiku — samo pole `name` (pełne imię i nazwisko) musi
-- zostać nietknięte wszędzie tam, gdzie dane pełnią rolę dokumentu
-- potwierdzenia (archiwum godzin, wynagrodzenia, lista/karta pracownika) —
-- to tylko DODATKOWA, opcjonalna etykieta do zwartych widoków grafiku
-- (siatka zmian), gdzie pełne imię i nazwisko nie mieści się wygodnie.
-- employee_id jako klucz obcy nigdy się nie zmienia, więc powiązanie z
-- pełnym imieniem i nazwiskiem jest zachowane niezależnie od tego, co
-- akurat wyświetla się w siatce.
alter table employee add column short_name text;
