-- Znacznik czasu ostatniej synchronizacji z Data Lake (pkt 1 spec) —
-- osobny od kasa_audit_log (który jest śladem RĘCZNYCH akcji admina,
-- employee_id tam jest NOT NULL). Automatyczne odświeżenie przy każdym
-- otwarciu /kasa i /recepcja/kasa nie ma naturalnego "kto", a i tak nie
-- powinno zaśmiecać audytu przy każdym wejściu na ekran — potrzebuje
-- własnego miejsca do throttlingu (nie częściej niż co ~2 min) i do
-- wyznaczania okna UpdatedFrom.
alter table kasa_settings add column if not exists last_api_sync_at timestamptz;
