-- Migration 030: Exigir RG e limite de inscrições na lista de confirmação

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS attendance_list_require_rg BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attendance_list_limit INTEGER NULL;

COMMENT ON COLUMN meetings.attendance_list_require_rg IS 'Se TRUE, o formulário público (lista vazia) exige RG';
COMMENT ON COLUMN meetings.attendance_list_limit IS 'Limite de inscrições/confirmados; NULL = sem limite';

ALTER TABLE attendance_list_public_entries
  ADD COLUMN IF NOT EXISTS rg VARCHAR(20) NULL;

COMMENT ON COLUMN attendance_list_public_entries.rg IS 'RG informado no autocadastro (quando exigido)';
