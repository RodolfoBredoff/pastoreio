-- Migration 025: Adicionar 'visitor_dropoff' ao CHECK de notification_type
-- Remove a constraint existente e recria com o novo valor permitido

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type IN ('absence_alert', 'birthday', 'visitor_dropoff'));
