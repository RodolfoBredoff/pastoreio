-- Checklist interno (líder/secretário) para lista de presença de eventos especiais
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS attendance_list_internal_label TEXT NULL,
  ADD COLUMN IF NOT EXISTS attendance_list_internal_checks JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN meetings.attendance_list_internal_label IS 'Rótulo exibido no checklist interno (ex.: item a conferir por participante)';
COMMENT ON COLUMN meetings.attendance_list_internal_checks IS 'Mapa member_id -> boolean (checkbox marcado)';

-- Remove presenças indevidas: encontro anterior à data de cadastro do membro
DELETE FROM attendance a
USING meetings mt, members m
WHERE a.meeting_id = mt.id
  AND a.member_id = m.id
  AND mt.meeting_date < (m.created_at AT TIME ZONE 'UTC')::date;
