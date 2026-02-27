-- Migration 014: Prazo de confirmação da lista de presença
-- Adiciona um campo opcional de data/hora limite para confirmações via link público.
-- Após esse prazo, o link continua existindo, mas a API pública não aceita novas confirmações.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS attendance_list_deadline TIMESTAMPTZ NULL;

