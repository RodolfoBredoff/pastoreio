-- Migration 034: descrição curta do visitante não cadastrado
-- Ajuda a reconhecer a pessoa depois (ex.: "camisa azul, veio com a Maria").
ALTER TABLE guest_visitors
  ADD COLUMN IF NOT EXISTS description VARCHAR(200);

COMMENT ON COLUMN guest_visitors.description IS 'Descrição curta opcional para reconhecer o visitante (máx. 200 caracteres)';
