-- Migration 011: Lista de presença para encontros especiais
-- Permite ao líder gerar um link de lista de presença (nome, data, local) para eventos especiais.
-- Participantes acessam o link, veem os nomes cadastrados e marcam "Estarei presente" ou "Vou me ausentar"
-- após informar o e-mail. Um contador exibe totais.

-- Campo local do encontro (nome, data, local)
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- Token único para o link público da lista de presença (só preenchido quando líder gera a lista)
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS attendance_list_token UUID UNIQUE DEFAULT NULL;

-- Respostas da lista de presença: um registro por (encontro, membro) com status e e-mail
CREATE TABLE IF NOT EXISTS attendance_list_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent')),
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(meeting_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_list_responses_meeting ON attendance_list_responses(meeting_id);
CREATE INDEX IF NOT EXISTS idx_attendance_list_token ON meetings(attendance_list_token) WHERE attendance_list_token IS NOT NULL;
