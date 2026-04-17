-- Migration 023: Contact log for tracking member interactions
CREATE TABLE IF NOT EXISTS contact_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  leader_id UUID REFERENCES leaders(id) ON DELETE SET NULL,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('whatsapp','ligacao','presencial','email','outro')),
  note TEXT,
  contacted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_log_member ON contact_log(member_id);
CREATE INDEX IF NOT EXISTS idx_contact_log_group ON contact_log(group_id, contacted_at DESC);
