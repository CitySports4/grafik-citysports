-- Pracownik może mieć więcej niż jedną rolę naraz (np. recepcja + admin).
-- Zastępuje pojedynczą kolumnę employee.role tabelą łączącą.

create table employee_role (
  employee_id uuid not null references employee(id) on delete cascade,
  role text not null check (role in ('recepcja', 'sprzatanie', 'marketing', 'admin')),
  primary key (employee_id, role)
);

insert into employee_role (employee_id, role)
select id, role from employee;

alter table employee drop column role;

create index idx_employee_role_role on employee_role(role);
