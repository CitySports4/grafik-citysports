-- Cel materiału (promocja vs relacja z zajęć) — Oliwia potrzebuje tego, żeby
-- wiedzieć PO CO nagrywa dany materiał, patrz kwestionariusze zespołu
-- (październik 2026).
alter table marketing_content add column purpose text not null default 'relacja' check (purpose in ('promocja', 'relacja'));

-- Akceptacja przed publikacją — Krzysztof chce przeczytać i ewentualnie
-- zasugerować uwagę zanim coś pójdzie na "Opublikowane". Dotyczy tylko treści
-- pisanych (needs_review), nie każdego wpisu — ustalone z zespołem, że np.
-- same nagrania wideo tego nie potrzebują. Żeby to nie blokowało pracy w
-- nieskończoność, gdy admin zwleka z odpowiedzią: blokada automatycznie
-- znika w dniu samej publikacji (scheduled_date) — patrz isApprovalPending w
-- actions.ts, to jedyne miejsce, które faktycznie o tym decyduje.
alter table marketing_content add column needs_review boolean not null default true;
alter table marketing_content add column approved boolean not null default false;
alter table marketing_content add column review_note text not null default '';
alter table marketing_content add column reviewed_by_employee_id uuid references employee(id) on delete set null;
alter table marketing_content add column reviewed_at timestamptz;
