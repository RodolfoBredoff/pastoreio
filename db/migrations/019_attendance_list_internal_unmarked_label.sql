-- Rótulo customizável para quem não marcou nenhum dos dois checkboxes
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS attendance_list_internal_unmarked_label TEXT NULL;

COMMENT ON COLUMN meetings.attendance_list_internal_unmarked_label IS 'Texto para o grupo que não marcou nenhum checkbox (padrão na UI: Não marcados)';
