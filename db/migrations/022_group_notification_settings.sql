-- Migration 022: Group notification settings toggles
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS absence_whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS weekly_summary_enabled BOOLEAN NOT NULL DEFAULT TRUE;
