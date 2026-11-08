-- Rola "content_creator" (Sprint A) — uproszczony widok /marketing dla osób
-- nagrywających treści (tylko "Moje zadania" + "Kalendarz" ich zadań, bez
-- kampanii/wydarzeń/ustawień innych osób, patrz app code). Oliwia ma już
-- recepcja+sprzatanie (jej prawdziwe etaty) — TYCH ról nie ruszamy, tylko
-- zamieniamy "marketing" (pełny dostęp do modułu) na "content_creator"
-- (ograniczony), żeby trafiała do uproszczonego widoku zamiast pełnego.

alter table employee_role drop constraint employee_role_role_check;
alter table employee_role add constraint employee_role_role_check
  check (role in ('recepcja', 'sprzatanie', 'admin', 'trener_personalny', 'marketing', 'content_creator'));

update employee_role set role = 'content_creator'
  where role = 'marketing'
    and employee_id = (select id from employee where name = 'Oliwia Kwiatkowska');
