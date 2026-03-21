-- Checklist interno: ligar/desligar, rótulos dos resultados, convidados pelo líder
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS attendance_list_internal_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attendance_list_internal_result_positive TEXT NULL,
  ADD COLUMN IF NOT EXISTS attendance_list_internal_result_negative TEXT NULL;

COMMENT ON COLUMN meetings.attendance_list_internal_enabled IS 'Se o líder ativou o checklist interno';
COMMENT ON COLUMN meetings.attendance_list_internal_result_positive IS 'Rótulo customizado para linhas marcadas (ex.: Pago)';
COMMENT ON COLUMN meetings.attendance_list_internal_result_negative IS 'Rótulo customizado para não marcadas (ex.: Não pago)';

ALTER TABLE attendance_list_guests
  ADD COLUMN IF NOT EXISTS registered_by_leader BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN attendance_list_guests.registered_by_leader IS 'TRUE quando incluído pelo líder/secretário (ex.: após prazo)';
