-- Tabela marketing_project — projekty zarządzane z UI (/marketing/projekty)
-- zamiast zakodowanej listy w PROJECT_OPTIONS (lib/marketing.ts). Seedowana
-- tymi samymi czterema wartościami, które do tej pory były na sztywno w
-- kodzie, żeby istniejące marketing_task.project/marketing_content.project
-- (zwykły tekst, patrz migracja 0062) dalej pasowały do nazw projektów.

create table marketing_project (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#7c3aed',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into marketing_project (name, color) values
  ('Wigilia', '#dc2626'),
  ('Liga Deblowa', '#0284c7'),
  ('Półkolonie', '#16a34a'),
  ('Ogólne', '#7c3aed');
