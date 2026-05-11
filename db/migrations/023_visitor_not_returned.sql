-- Migration 022: Visitor not returned marker
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS marked_not_returned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_members_not_returned 
  ON members(marked_not_returned) 
  WHERE member_type = 'visitor' AND marked_not_returned = TRUE;
