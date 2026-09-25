-- Cena zależy od LICZBY grup, do których dziecko aktualnie należy
-- (1×/tydz., 2×/tydz., ...), nie od konkretnej grupy (kids_class_group.
-- monthly_fee) ani ręcznego wpisu per dziecko (monthly_fee_override,
-- wprowadzone w 0047, wycofane — "bez sensu per dziecko"). Jeden wspólny
-- cennik, edytowalny w zakładce Grupy.
create table kids_class_price_tier (
  group_count integer primary key check (group_count > 0),
  monthly_fee numeric(6,2) not null
);
insert into kids_class_price_tier (group_count, monthly_fee) values (1, 325), (2, 599);

alter table kids_class_registration drop column monthly_fee_override;
alter table kids_class_group drop column monthly_fee;
