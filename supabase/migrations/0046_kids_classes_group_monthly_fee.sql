-- Kwota miesięczna per grupa — potrzebna, żeby widok Płatności pokazywał
-- ile dziecko ma zapłacić, nie tylko czy checkbox jest zaznaczony. Start od
-- 0 (do ustawienia w zakładce "Grupy" zaraz po wdrożeniu — realne ceny nie
-- były nigdzie zapisane).
alter table kids_class_group add column monthly_fee numeric(6,2) not null default 0;
