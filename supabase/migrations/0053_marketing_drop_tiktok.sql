-- Nie korzystamy z TikToka — usuwamy go z listy platform kalendarza treści.
-- Istniejące wpisy z platform='tiktok' (jeśli jakieś już są) przechodzą na
-- 'inne', żeby zawężenie check constraint nie wywaliło się na starych
-- danych.
update marketing_content set platform = 'inne' where platform = 'tiktok';

alter table marketing_content drop constraint marketing_content_platform_check;
alter table marketing_content add constraint marketing_content_platform_check
  check (platform in ('instagram', 'facebook', 'strona_www', 'email', 'inne'));
