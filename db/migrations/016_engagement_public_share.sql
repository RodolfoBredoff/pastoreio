-- Compartilhamento público da página de engajamento por grupo.
-- O líder pode ativar/desativar e obter um link público via token.

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS engagement_share_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS engagement_share_token VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_groups_engagement_share_token
  ON groups(engagement_share_token) WHERE engagement_share_token IS NOT NULL;
