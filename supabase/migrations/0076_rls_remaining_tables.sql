-- RLS na pozostałych tabelach public (zgłoszenie 18.11.2026) — ten sam wzorzec
-- co migracja 0075: bez polityk, bo cały dostęp i tak idzie przez
-- service_role (lib/supabase.ts), który RLS omija niezależnie od polityk.
-- Zweryfikowane logami API (edge_logs) z 7 dni: zero ruchu kluczem
-- anon/publishable albo z przeglądarki na którejkolwiek tabeli Grafiku; druga
-- appka ("agent-marketingowy", supabase-py) używa tego samego klucza
-- service_role i dotyka wyłącznie swoich tabel (ga4_*/meta_*/efitness_*/
-- playmore_reservations), które też się tu domykają.
begin;

-- 1) Pracownicy / grafik.
alter table employee enable row level security;
alter table employee_role enable row level security;
alter table employee_class_schedule enable row level security;
alter table weekly_recurring_constraint enable row level security;
alter table shift_template enable row level security;
alter table schedule_month enable row level security;
alter table schedule_day enable row level security;
alter table schedule_shift enable row level security;
alter table schedule_event enable row level security;
alter table availability_submission enable row level security;
alter table availability_entry enable row level security;
alter table preferred_day_off enable row level security;
alter table shift_swap_request enable row level security;
alter table time_entry enable row level security;
alter table time_entry_archive enable row level security;
alter table planned_absence enable row level security;

-- 2) Sprzątanie.
alter table cleaning_zone enable row level security;
alter table cleaning_task enable row level security;
alter table cleaning_checklist_item enable row level security;
alter table cleaning_checklist_template enable row level security;
alter table cleaning_checklist_template_item enable row level security;
alter table employee_cleaning_zone enable row level security;
alter table cleaning_completion enable row level security;
alter table cleaning_settings enable row level security;
alter table cleaning_time_budget enable row level security;
alter table cleaning_ai_day_choice enable row level security;

-- 3) Treningi personalne.
alter table personal_training_settings enable row level security;
alter table personal_training_room_hours enable row level security;
alter table personal_training_session enable row level security;
alter table personal_training_credit enable row level security;
alter table personal_training_room_block enable row level security;

-- 4) Zajęcia dla dzieci.
alter table kids_class_registration enable row level security;
alter table kids_class_payment enable row level security;
alter table kids_class_group enable row level security;
alter table kids_class_enrollment enable row level security;
alter table kids_class_attendance enable row level security;
alter table kids_class_price_tier enable row level security;

-- 5) Kasa.
alter table payment_forms_map enable row level security;
alter table efitness_transactions enable row level security;
alter table cash_days enable row level security;
alter table cash_counts enable row level security;
alter table cash_months enable row level security;
alter table cash_doc_links enable row level security;
alter table cash_attachments enable row level security;
alter table kasa_settings enable row level security;
alter table kasa_audit_log enable row level security;

-- 6) Marketing Grafiku (marketing_project/content/task mają już RLS od 0075).
alter table marketing_plan enable row level security;

-- 7) Notatki.
alter table note enable row level security;
alter table note_link enable row level security;
alter table note_comment enable row level security;

-- 8) Inne.
alter table kiosk_settings enable row level security;

-- 9) Dane drugiej appki ("agent-marketingowy") w tej samej bazie.
alter table efitness_member_stats enable row level security;
alter table efitness_class_types enable row level security;
alter table efitness_instructors enable row level security;
alter table efitness_class_sessions enable row level security;
alter table efitness_attendance_daily enable row level security;
alter table marketing_insight enable row level security;

-- 10) Widok v_playmore_oblozenie_90d — jedyny widok w public, dotąd
-- SECURITY DEFINER (domyślne), czyli ignorował RLS tabeli pod spodem
-- (playmore_reservations, już ma RLS włączone od wcześniej, bez polityk).
-- Nieużywany przez ten repo (grep: zero trafień) — należy do drugiej appki.
-- security_invoker=true każe mu sprawdzać RLS wołającego zamiast właściciela;
-- service_role i tak to omija, więc nie wpływa na żadną z appek.
alter view v_playmore_oblozenie_90d set (security_invoker = true);

commit;
