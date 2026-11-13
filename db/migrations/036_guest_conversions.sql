-- Migration 036: histórico de conversões de visitante em membro (permite desfazer com segurança)
-- Ao converter, guardamos uma cópia do visitante (dados, foto) e a lista de encontros cujas
-- presenças foram copiadas para o membro. Sem isso não há como saber de onde o membro veio.
CREATE TABLE IF NOT EXISTS guest_conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  -- Membro criado pela conversão. Se o membro for apagado (inclusive ao desfazer a conversão),
  -- o histórico some junto, com a cópia do visitante e a foto (privacidade).
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- Cópia do visitante original
  guest_id UUID NOT NULL,
  guest_full_name VARCHAR(255) NOT NULL,
  guest_phone VARCHAR(20),
  guest_description VARCHAR(200),
  guest_created_at TIMESTAMP WITH TIME ZONE,
  guest_photo_mime VARCHAR(20),
  guest_photo_data BYTEA,
  guest_photo_consent_at TIMESTAMP WITH TIME ZONE,
  -- Encontros em que o visitante estava presente (viraram presença do membro)
  meeting_ids UUID[] NOT NULL DEFAULT '{}',
  converted_by UUID,
  converted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_conversions_member ON guest_conversions(member_id);
CREATE INDEX IF NOT EXISTS idx_guest_conversions_group ON guest_conversions(group_id);

COMMENT ON TABLE guest_conversions IS 'Origem de membros criados a partir de visitantes; base do "desfazer conversão"';
