-- Jednorazowy import istniejących danych z Arkusza Google "Zapisy
-- Badminton" (zakładki Zgloszenia, Płatności, Ustawienia) — stan na
-- 2026-09-25, w momencie przenoszenia systemu na stałe do tej aplikacji.
-- Dopasowanie zgłoszeń do wierszy płatności po (imię dziecka, telefon) —
-- tak samo jak dawny klucz w Code.gs (wczytajWszystkiePlatnosci_).

-- terms_consent (Regulamin) nie było osobną kolumną w dawnym arkuszu — samo
-- zgłoszenie było możliwe tylko po zaakceptowaniu obu zgód naraz (patrz
-- Code.gs submitForm), więc historyczne wiersze dostają true.
insert into kids_class_registration
  (created_at, child_name, birth_date, parent_name, phone, email, whatsapp_contact, group_choice, has_experience, rodo_consent, terms_consent, status, used_trial, paid_trial_fee)
values
  ('2026-08-25 15:14:37+02', 'Stanisław Miszczuk', '2014-08-11', 'Joanna Miszczuk', '609363059', null, true, 'czwartek', false, true, true, 'aktywny', true, true),
  ('2026-08-25 16:59:07+02', 'Wojtek Bogusiak', '2018-02-02', 'Marcin Bogusiak', '787950124', null, true, 'poniedzialek', false, true, true, 'aktywny', true, true),
  ('2026-08-26 16:44:59+02', 'Adam Wawrzyniak', '2014-12-11', 'Urszula Wawrzyniak', '502331972', null, true, 'czwartek', false, true, true, 'brak_oplaty', true, false),
  ('2026-08-31 16:37:05+02', 'Jagoda Zapałowicz', '2018-12-17', 'Marta Zapałowicz', '607930878', null, true, 'poniedzialek', false, true, true, 'aktywny', true, true),
  ('2026-09-01 00:49:23+02', 'Jan Bąk', '2014-02-07', 'Magdalena Bąk', '607070279', null, true, 'czwartek', false, true, true, 'brak_oplaty', true, false),
  ('2026-09-01 16:34:16+02', 'Tosia Zakrzewska', '2014-06-30', 'Monika Zakrzewska', '669025957', null, true, 'poniedzialek', true, true, true, 'aktywny', true, true),
  ('2026-09-01 17:08:21+02', 'Emilia Paczkowska', '2012-10-04', 'Katarzyna Paczkowska', '668822976', null, true, 'poniedzialek', false, true, true, 'aktywny', true, true),
  ('2026-09-03 09:53:58+02', 'Jagoda Bałuszyńska', '2018-10-30', 'Sylwia Szulawska-Bałuszyńska', '693294186', null, true, 'poniedzialek', false, true, true, 'aktywny', true, true),
  ('2026-09-03 16:29:40+02', 'Zuzanna Topolska', '2014-06-12', 'Przemysław Topolski', '515094580', null, true, 'poniedzialek', true, true, true, 'aktywny', true, true),
  ('2026-09-03 16:30:52+02', 'Lena Drożdż', '2014-07-30', 'Monika Zygmunt', '790213451', null, true, 'poniedzialek', true, true, true, 'aktywny', true, true),
  ('2026-09-03 20:36:28+02', 'Leon Siemiątkowski', '2015-11-09', 'Anna Rybczak-Siemiątkowska', '695424854', null, true, 'czwartek', false, true, true, 'aktywny', true, true),
  ('2026-09-03 22:57:28+02', 'Jaśmina Kapela', '2012-07-28', 'Roman Kapela', '698673102', null, true, 'poniedzialek', false, true, true, 'rezygnacja', false, false),
  ('2026-09-10 16:07:05+02', 'Rozalia Kołoch', '2015-10-03', 'Bożena Kołoch', '606934776', null, true, 'obie', false, true, true, 'aktywny', true, true),
  ('2026-09-10 19:54:19+02', 'Mateusz Zbrojewicz', '2017-01-12', 'Małgorzata Chłopek', '692607767', null, true, 'czwartek', true, true, true, 'aktywny', true, true),
  ('2026-09-03 16:30:52+02', 'Maja Drożdż', '2018-03-22', 'Monika Zygmunt', '790213451', null, true, 'poniedzialek', true, true, true, 'aktywny', true, true),
  ('2026-09-21 14:27:57+02', 'Oscar Mańkowski', '2015-01-30', 'Małgorzata Rurkowska', '735588761', null, true, 'czwartek', false, true, true, 'aktywny', true, false),
  ('2026-09-24 12:25:57+02', 'Nina Wawrzeniuk', '2013-06-06', 'Anna Wawrzeniuk', '503656099', null, true, 'poniedzialek', false, true, true, 'oczekuje', false, false);

-- Płatności — kolejność miesięcy zgodna z SEASON_MONTHS w kids-classes.ts:
-- Wrzesień, Październik, Listopad, Grudzień, Styczeń, Luty, Marzec,
-- Kwiecień, Maj, Czerwiec.
insert into kids_class_payment (registration_id, months)
select r.id, p.months
from (values
  ('Emilia Paczkowska', '668822976', array[true, false, false, false, false, false, false, false, false, false]),
  ('Jagoda Bałuszyńska', '693294186', array[true, false, false, false, false, false, false, false, false, false]),
  ('Jagoda Zapałowicz', '607930878', array[true, false, false, false, false, false, false, false, false, false]),
  ('Lena Drożdż', '790213451', array[true, false, false, false, false, false, false, false, false, false]),
  ('Maja Drożdż', '790213451', array[true, false, false, false, false, false, false, false, false, false]),
  ('Tosia Zakrzewska', '669025957', array[true, false, false, false, false, false, false, false, false, false]),
  ('Wojtek Bogusiak', '787950124', array[true, false, false, false, false, false, false, false, false, false]),
  ('Zuzanna Topolska', '515094580', array[true, false, false, false, false, false, false, false, false, false]),
  ('Leon Siemiątkowski', '695424854', array[true, false, false, false, false, false, false, false, false, false]),
  ('Mateusz Zbrojewicz', '692607767', array[true, false, false, false, false, false, false, false, false, false]),
  ('Oscar Mańkowski', '735588761', array[false, false, false, false, false, false, false, false, false, false]),
  ('Stanisław Miszczuk', '609363059', array[true, false, false, false, false, false, false, false, false, false]),
  ('Rozalia Kołoch', '606934776', array[true, false, false, false, false, false, false, false, false, false])
) as p(child_name, phone, months)
join kids_class_registration r on r.child_name = p.child_name and r.phone = p.phone;

update kids_class_settings set limit_poniedzialek = 9, limit_czwartek = 8 where id = true;
