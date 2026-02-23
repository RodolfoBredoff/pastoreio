import crypto from 'crypto';
import { query, queryOne } from '@/lib/db/postgres';

/**
 * Hash do token para armazenar no banco
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const MAGIC_LINK_EXPIRY_HOURS = 1; // Token expira em 1 hora

/**
 * Gera um token seguro para magic link
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Cria um token de magic link para o email
 */
export async function createMagicLinkToken(email: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + MAGIC_LINK_EXPIRY_HOURS);

  // Verificar se o usuário existe, se não, criar
  let user = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );

  if (!user) {
    // Criar novo usuário
    const result = await query<{ id: string }>(
      `INSERT INTO users (email, email_verified)
       VALUES ($1, FALSE)
       RETURNING id`,
      [email]
    );
    user = result.rows[0];
  }

  // Criar token de magic link
  const tokenHash = hashToken(token);
  await query(
    `INSERT INTO magic_link_tokens (user_id, email, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [user.id, email, tokenHash, expiresAt]
  );

  return token;
}

/**
 * Valida e usa um token de magic link
 */
export async function validateMagicLinkToken(token: string): Promise<{ userId: string; email: string } | null> {
  const tokenHash = hashToken(token);
  
  // Buscar token válido
  const tokenData = await queryOne<{ user_id: string; email: string }>(
    `SELECT user_id, email 
     FROM magic_link_tokens 
     WHERE token_hash = $1
     AND expires_at > NOW()
     AND used = FALSE`,
    [tokenHash]
  );

  if (!tokenData) {
    return null;
  }

  // Marcar token como usado
  await query(
    `UPDATE magic_link_tokens 
     SET used = TRUE 
     WHERE token_hash = $1`,
    [tokenHash]
  );

  // Marcar email como verificado
  await query(
    `UPDATE users SET email_verified = TRUE WHERE id = $1`,
    [tokenData.user_id]
  );

  return {
    userId: tokenData.user_id,
    email: tokenData.email,
  };
}

/**
 * Limpa tokens expirados (deve ser executado periodicamente)
 */
export async function cleanupExpiredTokens(): Promise<void> {
  await query(
    `DELETE FROM magic_link_tokens 
     WHERE expires_at < NOW() OR used = TRUE`
  );
}
