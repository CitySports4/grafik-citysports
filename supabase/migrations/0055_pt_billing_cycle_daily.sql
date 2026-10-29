alter table employee drop constraint employee_pt_billing_cycle_check;
alter table employee add constraint employee_pt_billing_cycle_check check (pt_billing_cycle in ('daily', 'weekly', 'monthly'));
