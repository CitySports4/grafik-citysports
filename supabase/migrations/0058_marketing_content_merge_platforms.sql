-- Facebook i Instagram nie są rozdzielane — ten sam materiał zawsze idzie na
-- oba naraz, więc liczą się jako jeden kanał "facebook_instagram", nie dwie
-- osobne wartości do wyboru. Constraint zdjęty PRZED update — stare wartości
-- "facebook"/"instagram" i tak nie pasują do nowego check, dopóki wiersze nie
-- zostaną przepisane.
alter table marketing_content drop constraint marketing_content_platform_check;
update marketing_content set platform = 'facebook_instagram' where platform in ('facebook', 'instagram');
alter table marketing_content add constraint marketing_content_platform_check
  check (platform in ('facebook_instagram', 'strona_www', 'email', 'inne'));
