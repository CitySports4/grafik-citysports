-- Zamiana binarnego admin/employee na 4 role funkcyjne: recepcja,
-- sprzatanie, marketing, admin. Istniejący 'employee' mapowany domyślnie na
-- 'recepcja' — admin powinien poprawić to ręcznie per osoba w Pracownicy,
-- jeśli ktoś faktycznie robi coś innego (sprzątanie/marketing).
alter table employee drop constraint employee_role_check;

update employee set role = 'recepcja' where role = 'employee';

alter table employee add constraint employee_role_check
  check (role in ('recepcja', 'sprzatanie', 'marketing', 'admin'));

alter table employee alter column role set default 'recepcja';
