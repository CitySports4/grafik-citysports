-- Notatnik/pomysły — główne narzędzie komunikacji zespołu (zastępuje rolę,
-- którą miał pełnić Taskade). Notatka może zostać "przekształcona w
-- zadanie" (is_task=true, dostaje status i opcjonalnie przypisaną osobę).
-- Ręczne linkowanie powiązanych notatek przez note_link.
create table note (
  id uuid primary key default gen_random_uuid(),
  author_employee_id uuid not null references employee(id) on delete cascade,
  title text not null,
  body text not null default '',
  is_task boolean not null default false,
  status text check (status in ('todo', 'in_progress', 'done')),
  assignee_employee_id uuid references employee(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table note_link (
  note_id_a uuid not null references note(id) on delete cascade,
  note_id_b uuid not null references note(id) on delete cascade,
  primary key (note_id_a, note_id_b),
  constraint note_link_no_self check (note_id_a <> note_id_b)
);

create index idx_note_author on note(author_employee_id);
create index idx_note_is_task on note(is_task);
