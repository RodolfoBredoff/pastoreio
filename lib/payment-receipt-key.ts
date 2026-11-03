/**
 * Regras puras dos comprovantes de pagamento (sem AWS, sem banco, sem Next).
 * Usadas pelo app (lib/payment-receipts) e pela Lambda de confirmação offline.
 */

export const RECEIPT_PREFIX = 'payment-receipts';
export const RECEIPT_ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024; // 10MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Texto seguro para chave S3: minúsculas, sem acentos, só [a-z0-9._-]. */
export function sanitizeKeyPart(value: string, maxLength: number): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, maxLength)
    .replace(/[-._]+$/g, '');
  return cleaned || 'x';
}

/**
 * Chave do arquivo: payment-receipts/<encontro>/<evento>__<nome-sobrenome>__<email|telefone>__<uuid>.<ext>
 * O UUID torna a chave imprevisível e evita sobrescrever envios repetidos.
 */
export function buildReceiptObjectKey(args: {
  meetingId: string;
  eventTitle: string | null;
  firstName: string;
  lastName: string;
  contact: string;
  contentType: string;
  /** Obrigatório: quem chama gera o UUID (crypto.randomUUID). */
  uuid: string;
}): string {
  const ext = RECEIPT_ALLOWED_TYPES[args.contentType] ?? 'bin';
  const event = sanitizeKeyPart(args.eventTitle?.trim() || 'evento', 40);
  const person = sanitizeKeyPart(`${args.firstName} ${args.lastName}`, 50);
  const contact = sanitizeKeyPart(args.contact, 60);
  return `${RECEIPT_PREFIX}/${args.meetingId}/${event}__${person}__${contact}__${args.uuid}.${ext}`;
}

/** A chave pertence ao encontro? (defesa contra chave forjada ao gravar o comprovante) */
export function isReceiptKeyForMeeting(key: unknown, meetingId: string): key is string {
  if (typeof key !== 'string' || key.length > 400) return false;
  const prefix = `${RECEIPT_PREFIX}/${meetingId}/`;
  if (!key.startsWith(prefix)) return false;
  const rest = key.slice(prefix.length);
  return /^[a-z0-9._-]+$/.test(rest) && !rest.includes('..');
}

/** Validação do pedido de URL de upload (formato e tamanho do arquivo). */
export function validateReceiptFile(contentType: unknown, size: unknown):
  | { ok: true; contentType: string; size: number }
  | { ok: false; error: string } {
  if (typeof contentType !== 'string' || !RECEIPT_ALLOWED_TYPES[contentType]) {
    return { ok: false, error: 'Formato não suportado (use JPG, PNG, WEBP ou PDF)' };
  }
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return { ok: false, error: 'Arquivo inválido' };
  }
  if (size > RECEIPT_MAX_BYTES) return { ok: false, error: 'Arquivo muito grande (máx. 10MB)' };
  return { ok: true, contentType, size };
}
