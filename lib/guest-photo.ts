/**
 * Foto (miniatura) opcional de visitante não cadastrado. Validação no servidor:
 * nunca confiamos no que o navegador diz sobre o arquivo.
 */

/** Limite da miniatura em bytes (o navegador mira ~30 KB; aqui há folga). */
export const MAX_GUEST_PHOTO_BYTES = 40 * 1024;
/** Limite do texto base64 antes de decodificar (evita processar payloads enormes). */
const MAX_DATA_URL_LENGTH = Math.ceil((MAX_GUEST_PHOTO_BYTES * 4) / 3) + 64;

export type GuestPhotoMime = 'image/webp' | 'image/jpeg';

export interface ParsedGuestPhoto {
  mime_type: GuestPhotoMime;
  data: Buffer;
}

export type ParseGuestPhotoResult =
  | { ok: true; photo: ParsedGuestPhoto }
  | { ok: false; error: string };

function isWebp(buf: Buffer): boolean {
  return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
}

function isJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/** Valida e decodifica uma data URL de imagem (WebP ou JPEG). */
export function parseGuestPhotoDataUrl(input: unknown): ParseGuestPhotoResult {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, error: 'Foto inválida' };
  }
  if (input.length > MAX_DATA_URL_LENGTH) {
    return { ok: false, error: 'Foto muito grande' };
  }
  const match = /^data:(image\/(?:webp|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!match) {
    return { ok: false, error: 'Formato de foto não suportado (use WebP ou JPEG)' };
  }
  const mime = match[1] as GuestPhotoMime;
  const data = Buffer.from(match[2], 'base64');
  if (data.length === 0 || data.length > MAX_GUEST_PHOTO_BYTES) {
    return { ok: false, error: 'Foto muito grande' };
  }
  const signatureOk = mime === 'image/webp' ? isWebp(data) : isJpeg(data);
  if (!signatureOk) {
    return { ok: false, error: 'O arquivo não é uma imagem válida' };
  }
  return { ok: true, photo: { mime_type: mime, data } };
}
