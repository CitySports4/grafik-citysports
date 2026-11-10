-- member_ref i description bywają puste w eksporcie Excela (np. zwykła
-- sprzedaż barowa bez przypisanego klubowicza i bez opisu) — NULL ("nie
-- podano") jest tu trafniejsze niż "" (pusty string był arbitralnym
-- wyborem przy pierwszej wersji schematu, pkt 7 spec).
alter table efitness_transactions alter column member_ref drop not null;
alter table efitness_transactions alter column description drop not null;
