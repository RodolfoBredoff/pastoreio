-- Migration 026: Slug público + modo de lista (pré-preenchida vs vazia/autocadastro)
-- Objetivo:
-- - Expor a lista pública por um slug (sem token no URL)
-- - Permitir modo "open" (lista vazia) onde qualquer pessoa adiciona Nome/Sobrenome + Email/Telefone
-- - Manter PII somente em rotas internas (líder/secretário)

-- 1) meetings: slug público e modo
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS attendance_list_slug TEXT UNIQUE;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS attendance_list_mode TEXT NOT NULL DEFAULT 'prefilled';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meetings_attendance_list_mode_check'
  ) THEN
    ALTER TABLE meetings
      ADD CONSTRAINT meetings_attendance_list_mode_check
      CHECK (attendance_list_mode IN ('prefilled', 'open'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meetings_attendance_list_slug
  ON meetings(attendance_list_slug)
  WHERE attendance_list_slug IS NOT NULL;

-- 2) Lista vazia (autocadastro): registros públicos de confirmação
CREATE TABLE IF NOT EXISTS attendance_list_public_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_list_public_entries_meeting
  ON attendance_list_public_entries(meeting_id);

