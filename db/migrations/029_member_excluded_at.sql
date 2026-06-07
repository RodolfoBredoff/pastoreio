-- Permite remover pessoas inativas da lista de Pessoas sem apagar histórico
ALTER TABLE members ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_members_excluded
  ON members(group_id, excluded_at)
  WHERE excluded_at IS NULL;
