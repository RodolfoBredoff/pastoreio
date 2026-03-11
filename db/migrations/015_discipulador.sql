-- Discipulador: vínculo participante -> outro membro do grupo (discipulador)
-- O discipulador é um membro cadastrado no app; quem tem discipulador_id preenchido é "discipulado por" esse membro.

ALTER TABLE members
  ADD COLUMN discipulador_id UUID REFERENCES members(id) ON DELETE SET NULL;

-- Evitar self-reference
ALTER TABLE members
  ADD CONSTRAINT members_discipulador_not_self CHECK (discipulador_id IS NULL OR discipulador_id <> id);

CREATE INDEX idx_members_discipulador_id ON members(discipulador_id);
