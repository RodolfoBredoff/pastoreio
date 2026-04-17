-- Migration 021: Visitor funnel integration stage
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS integration_stage TEXT
    NOT NULL DEFAULT 'novo_visitante'
    CHECK (integration_stage IN ('novo_visitante','retornou','integrando','membro'));

CREATE INDEX IF NOT EXISTS idx_members_integration_stage
  ON members(integration_stage) WHERE member_type = 'visitor';
