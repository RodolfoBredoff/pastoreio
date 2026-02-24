-- Migration 012: Visitantes na lista de presença
-- Quem vai ao encontro pode cadastrar que levará um visitante (nome e sobrenome).
-- O e-mail de quem está cadastrando é armazenado. Visitantes entram na contagem de presença.

CREATE TABLE IF NOT EXISTS attendance_list_guests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  registered_by_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_list_guests_meeting ON attendance_list_guests(meeting_id);
