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

export {
  RECEIPT_PREFIX,
  RECEIPT_ALLOWED_TYPES,
  RECEIPT_MAX_BYTES,
  buildReceiptObjectKey,
  isReceiptKeyForMeeting,
  sanitizeKeyPart,
  validateReceiptFile,
} from '@/lib/payment-receipt-key';

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
