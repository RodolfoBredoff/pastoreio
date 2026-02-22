-- Obrigar troca de senha no primeiro login (líder, secretário, coordenador)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE;

-- Usuários existentes não são forçados a trocar (apenas novos ou após reset)
UPDATE users SET must_change_password = FALSE WHERE must_change_password IS NULL;
