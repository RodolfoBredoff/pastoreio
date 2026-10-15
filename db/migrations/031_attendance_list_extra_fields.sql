-- Migration 031: Campos adicionais obrigatórios na lista de presença
-- Permite ao líder definir, por encontro especial, um ou mais campos extras
-- (ex.: "O que você vai levar?") que podem ser:
--   - resposta livre (texto), ou
--   - lista de opções pré-definidas (seleção múltipla, com opção de texto próprio).
-- Quem confirma presença pelo link público (modo prefilled ou open) é obrigado a
-- preencher todos os campos habilitados. Visitantes incluídos pelo líder também.
-- As respostas ficam salvas em extra_values (JSONB) nas tabelas de confirmação.

-- 1) Configuração dos campos extras por encontro
CREATE TABLE IF NOT EXISTS attendance_list_extra_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  options JSONB NULL,
  allow_custom BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON COLUMN attendance_list_extra_fields.label IS 'Título do campo (ex.: O que você vai levar?)';
COMMENT ON COLUMN attendance_list_extra_fields.options IS 'Array JSON de opções; NULL = resposta livre (texto)';
COMMENT ON COLUMN attendance_list_extra_fields.allow_custom IS 'Se TRUE (padrão), além das opções é permitido digitar resposta própria';

CREATE INDEX IF NOT EXISTS idx_attendance_list_extra_fields_meeting
  ON attendance_list_extra_fields(meeting_id);

-- 2) Respostas dos campos extras (array de { field_id, values[] })
ALTER TABLE attendance_list_responses
  ADD COLUMN IF NOT EXISTS extra_values JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE attendance_list_public_entries
  ADD COLUMN IF NOT EXISTS extra_values JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE attendance_list_guests
  ADD COLUMN IF NOT EXISTS extra_values JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN attendance_list_responses.extra_values IS 'Respostas dos campos adicionais: [{field_id, values[]}]';
COMMENT ON COLUMN attendance_list_public_entries.extra_values IS 'Respostas dos campos adicionais: [{field_id, values[]}]';
COMMENT ON COLUMN attendance_list_guests.extra_values IS 'Respostas dos campos adicionais: [{field_id, values[]}]';
