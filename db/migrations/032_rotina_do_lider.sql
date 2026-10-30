-- Migration 032: rotina do líder
--  - notificação "chamada não lançada" (attendance_missing), ligada ao encontro
--  - relatório do encontro: pedidos de oração (privados), oferta e observações
-- Só acrescenta colunas e amplia o CHECK; idempotente.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type IN ('absence_alert', 'birthday', 'visitor_dropoff', 'attendance_missing'));

CREATE INDEX IF NOT EXISTS idx_notifications_meeting
  ON notifications (meeting_id) WHERE meeting_id IS NOT NULL;

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS report_prayer_requests TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS report_offering NUMERIC(10, 2);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS report_notes TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS report_updated_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN meetings.report_prayer_requests IS 'Pedidos de oração do encontro; visível só para líder, secretário(a) e coordenação';
