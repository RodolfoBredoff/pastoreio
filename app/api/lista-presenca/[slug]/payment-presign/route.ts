import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { queryOne } from '@/lib/db/postgres';
import { getMeetingBySlugOrToken } from '@/lib/attendance-list-public';
import { getS3Client } from '@/lib/aws/s3-client';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function extFromContentType(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'application/pdf') return 'pdf';
  return 'bin';
}

/**
 * POST /api/lista-presenca/[slug]/payment-presign
 * Público: Retorna uma URL assinada (PUT) para upload do comprovante de pagamento.
 * 
 * Body: { contentType, size, first_name, last_name, email?, phone? }
 * 
 * Validações:
 * - Evento deve ser pago (is_paid_event = true)
 * - Tipo de arquivo deve ser imagem ou PDF
 * - Tamanho máximo 10MB
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: 'Link inválido' }, { status: 400 });
    }

    const meeting = await getMeetingBySlugOrToken(slug);
    if (!meeting) {
      return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 });
    }

    if (!meeting.is_paid_event) {
      return NextResponse.json({ error: 'Este evento não requer pagamento' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { contentType, size, first_name, last_name, email, phone } = body as {
      contentType?: string;
      size?: number;
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
    };

    // Validações básicas
    if (!contentType || typeof contentType !== 'string') {
      return NextResponse.json({ error: 'contentType é obrigatório' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Formato não suportado (use JPG, PNG, WEBP ou PDF)' }, { status: 400 });
    }
    const sizeNum = typeof size === 'number' ? size : NaN;
    if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
      return NextResponse.json({ error: 'size é obrigatório' }, { status: 400 });
    }
    if (sizeNum > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'Arquivo muito grande (máx. 10MB)' }, { status: 400 });
    }

    const firstName = typeof first_name === 'string' ? first_name.trim() : '';
    const lastName = typeof last_name === 'string' ? last_name.trim() : '';
    const emailVal = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const phoneVal = typeof phone === 'string' ? phone.replace(/\D/g, '').trim() : '';

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'Nome e sobrenome são obrigatórios' }, { status: 400 });
    }
    if (!emailVal && !phoneVal) {
      return NextResponse.json({ error: 'Email ou telefone é obrigatório' }, { status: 400 });
    }

    // Bucket para comprovantes (reutiliza o mesmo bucket das capas de convite)
    const bucket = process.env.INVITE_COVERS_BUCKET || process.env.S3_BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: 'Bucket não configurado (INVITE_COVERS_BUCKET)' }, { status: 500 });
    }

    // Gera nome do arquivo: payment-receipts/{meeting_id}/{timestamp}-{uuid}.{ext}
    const ext = extFromContentType(contentType);
    const safeName = `${firstName}_${lastName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const objectKey = `payment-receipts/${meeting.id}/${Date.now()}-${safeName}-${randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
      // Não usamos CacheControl pois são arquivos privados
    });

    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 120 }); // 2 minutos
    const receiptUrl = `s3://${bucket}/${objectKey}`;

    // Pré-insere o registro do comprovante (será vinculado na confirmação)
    const receiptId = randomUUID();
    await queryOne<{ id: string }>(
      `INSERT INTO payment_receipts (id, meeting_id, user_first_name, user_last_name, user_email, user_phone, receipt_url, receipt_object_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [receiptId, meeting.id, firstName, lastName, emailVal || null, phoneVal || null, receiptUrl, objectKey]
    );

    return NextResponse.json({ 
      uploadUrl, 
      receiptId,
      objectKey 
    });
  } catch (error) {
    console.error('Erro ao gerar presign de comprovante:', error);
    return NextResponse.json({ error: 'Erro ao gerar link de upload' }, { status: 500 });
  }
}
