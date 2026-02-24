-- Migration 013: Telefone como alternativa ao e-mail na lista de presença
-- Permite "Não tenho e-mail" e gravar telefone. E-mail e telefone ficam visíveis só na página interna (líder/secretário).

-- Respostas: permitir telefone em vez de e-mail
ALTER TABLE attendance_list_responses
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE attendance_list_responses
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Visitantes: quem cadastrou pode informar telefone em vez de e-mail
ALTER TABLE attendance_list_guests
  ADD COLUMN IF NOT EXISTS registered_by_phone VARCHAR(20);

ALTER TABLE attendance_list_guests
  ALTER COLUMN registered_by_email DROP NOT NULL;
