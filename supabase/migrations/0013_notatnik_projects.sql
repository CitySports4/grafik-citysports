-- Rozbudowa notatnika: projekty, pomysły, plany, priorytety, komentarze
-- (komunikator), rozróżnienie źródła notatki (człowiek/AI) do warstwy
-- Asystenta.

create table project (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_at timestamptz not null default now()
);

create table project_link (
  project_id_a uuid not null references project(id) on delete cascade,
  project_id_b uuid not null references project(id) on delete cascade,
  primary key (project_id_a, project_id_b),
  constraint project_link_no_self check (project_id_a <> project_id_b)
);

alter table note
  add column project_id uuid references project(id) on delete set null,
  add column category text not null default 'general' check (category in ('general', 'idea', 'plan')),
  add column priority smallint check (priority between 1 and 3),
  add column is_long_term boolean not null default false,
  add column due_date date,
  add column source text not null default 'human' check (source in ('human', 'ai'));

-- Notatki już utworzone przez crony (rozpoznawane dotąd po prefiksie 🤖 w
-- tytule) — oznacz retroaktywnie jako 'ai', żeby filtrowanie w Asystencie
-- działało od razu, nie tylko dla nowych.
update note set source = 'ai' where title like '🤖%';

create table note_comment (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references note(id) on delete cascade,
  author_employee_id uuid not null references employee(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_note_project on note(project_id);
create index idx_note_comment_note on note_comment(note_id);
create index idx_note_source on note(source);
