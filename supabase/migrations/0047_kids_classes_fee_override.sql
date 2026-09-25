-- Kwota łączna dla dziecka zapisanego na >1 grupę NIE musi być sumą cen
-- pojedynczych grup (np. zniżka za 2×/tydz.) — zamiast sztywnej reguły
-- rabatu, admin może po prostu ustawić realną kwotę ręcznie per dziecko.
-- NULL = licz jak dotąd (suma cen aktualnych grup).
alter table kids_class_registration add column monthly_fee_override numeric(6,2);
