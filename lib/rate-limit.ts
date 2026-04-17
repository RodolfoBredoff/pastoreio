/**
 * Rate limiter in-memory — custo zero, ideal para instância EC2 única.
 * Para multi-instância, substitua por Redis (Upstash, ElastiCache).
 *
 * Limita chamadas por chave (ex: IP ou email) dentro de uma janela de tempo.
 * Limpeza automática de entradas expiradas para evitar vazamento de memória.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Limpa entradas expiradas a cada 5 minutos
let cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

/**
 * Verifica e incrementa o contador de rate limit para uma chave.
 * @param key     Identificador único (ex: `login:${ip}` ou `magic:${email}`)
 * @param limit   Número máximo de requisições na janela
 * @param windowMs Tamanho da janela em milissegundos
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  scheduleCleanup();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Helper para extrair o IP do request (compatível com Next.js + proxy reverso).
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
