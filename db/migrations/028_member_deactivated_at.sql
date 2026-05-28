-- Data em que o membro foi marcado como inativo
ALTER TABLE members ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

UPDATE members
SET deactivated_at = updated_at
WHERE is_active = FALSE AND deactivated_at IS NULL;
