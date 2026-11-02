import { randomUUID } from 'crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client } from '@/lib/aws/s3-client';

/**
 * Comprovantes de pagamento de eventos pagos.
 *
 * - Upload: URL pré-assinada (PUT) gerada pelo servidor; o arquivo vai direto do navegador ao S3.
 * - Leitura: somente por URL pré-assinada (GET) de curta duração, gerada para o líder do grupo.
 * - Bucket: PAYMENT_RECEIPTS_BUCKET (recomendado, privado). Sem ele, usa o bucket já existente
 *   (INVITE_COVERS_BUCKET / S3_BUCKET) no prefixo payment-receipts/.
 */

export const RECEIPT_PREFIX = 'payment-receipts';
export const RECEIPT_ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const UPLOAD_URL_TTL_SECONDS = 300;
const DOWNLOAD_URL_TTL_SECONDS = 120;

export function getReceiptBucket(): string | null {
  return (
    process.env.PAYMENT_RECEIPTS_BUCKET ||
    process.env.INVITE_COVERS_BUCKET ||
    process.env.S3_BUCKET ||
    process.env.PEQUENOS_GRUPOS_BUCKET ||
    null
  );
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
  uuid?: string;
}): string {
  const ext = RECEIPT_ALLOWED_TYPES[args.contentType] ?? 'bin';
  const event = sanitizeKeyPart(args.eventTitle?.trim() || 'evento', 40);
  const person = sanitizeKeyPart(`${args.firstName} ${args.lastName}`, 50);
  const contact = sanitizeKeyPart(args.contact, 60);
  const id = args.uuid ?? randomUUID();
  return `${RECEIPT_PREFIX}/${args.meetingId}/${event}__${person}__${contact}__${id}.${ext}`;
}

export async function createReceiptUploadUrl(args: {
  key: string;
  contentType: string;
  size: number;
}): Promise<string> {
  const bucket = getReceiptBucket();
  if (!bucket) throw new Error('Bucket de comprovantes não configurado');
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: args.key,
    ContentType: args.contentType,
    // Assinado junto: o S3 recusa envios com tamanho diferente do declarado.
    ContentLength: args.size,
  });
  return getSignedUrl(getS3Client(), command, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
    // Assina também o Content-Type: o arquivo só é aceito com o tipo permitido (imagem/PDF).
    signableHeaders: new Set(['content-type']),
  });
}

export async function createReceiptDownloadUrl(key: string): Promise<string> {
  const bucket = getReceiptBucket();
  if (!bucket) throw new Error('Bucket de comprovantes não configurado');
  return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}

/** True se o arquivo do comprovante realmente foi enviado ao S3. */
export async function receiptObjectExists(key: string): Promise<boolean> {
  const bucket = getReceiptBucket();
  if (!bucket) return false;
  try {
    await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(5000),
    });
    return true;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === 'NotFound' || name === 'NoSuchKey') return false;
    // Sem permissão de leitura/Head ou S3 indisponível: não dá para confirmar o arquivo.
    console.error('[payment-receipts] falha ao verificar comprovante no S3:', error);
    return false;
  }
}
