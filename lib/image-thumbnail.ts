/**
 * Gera a miniatura da foto do visitante NO NAVEGADOR (canvas):
 * - reduz o maior lado para no máx. `maxSide` px;
 * - recodifica em WebP (ou JPEG se o navegador não suportar), baixando a qualidade até caber em `maxBytes`;
 * - como a imagem é redesenhada, metadados (EXIF, GPS) não são copiados.
 * Só roda no cliente.
 */

export const THUMB_MAX_SIDE = 256;
export const THUMB_MAX_BYTES = 30 * 1024;

/** Calcula o tamanho final mantendo a proporção (nunca amplia). */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem'));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

async function loadBitmap(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    // 'from-image' aplica a orientação do EXIF antes de descartá-lo
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível abrir a imagem'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Converte a foto escolhida em uma data URL pequena (WebP/JPEG). Lança erro com mensagem amigável. */
export async function createThumbnailDataUrl(
  file: File,
  opts: { maxSide?: number; maxBytes?: number } = {}
): Promise<string> {
  const maxSide = opts.maxSide ?? THUMB_MAX_SIDE;
  const maxBytes = opts.maxBytes ?? THUMB_MAX_BYTES;
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem');

  const bmp = await loadBitmap(file);
  try {
    const { width, height } = fitWithin(bmp.width, bmp.height, maxSide);
    if (!width || !height) throw new Error('Imagem inválida');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem');
    ctx.fillStyle = '#ffffff'; // evita fundo preto em PNG com transparência ao virar JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bmp.source, 0, 0, width, height);

    for (const type of ['image/webp', 'image/jpeg']) {
      for (const quality of [0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
        const blob = await canvasToBlob(canvas, type, quality);
        // Navegador sem suporte a WebP devolve PNG: tenta o próximo formato
        if (!blob || blob.type !== type) break;
        if (blob.size <= maxBytes) return await blobToDataUrl(blob);
      }
    }
    throw new Error('Não foi possível reduzir a foto o suficiente. Tente outra imagem.');
  } finally {
    bmp.close();
  }
}
