import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryOne } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { getS3Client } from '@/lib/aws/s3-client';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function extFromContentType(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'bin';
}

/**
 * POST /api/meetings/[id]/invite-cover/presign
 * Retorna uma URL assinada (PUT) para upload da capa do convite no S3.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não está vinculado a um grupo' }, { status: 400 });
    }

    if (!canManageMeetings(leader.role)) {
      return NextResponse.json({ error: SECRETARY_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const { id: meetingId } = await params;
    const meeting = await queryOne<{ id: string; group_id: string }>(
      `SELECT id, group_id FROM meetings WHERE id = $1`,
      [meetingId]
    );
    if (!meeting || meeting.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { contentType, size } = body as { contentType?: string; size?: number };

    if (!contentType || typeof contentType !== 'string') {
      return NextResponse.json({ error: 'contentType é obrigatório' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Formato de imagem não suportado (use JPG, PNG ou WEBP)' }, { status: 400 });
    }
    const sizeNum = typeof size === 'number' ? size : NaN;
    if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
      return NextResponse.json({ error: 'size é obrigatório' }, { status: 400 });
    }
    if (sizeNum > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'Imagem muito grande (máx. 5MB)' }, { status: 400 });
    }

    const bucket = process.env.INVITE_COVERS_BUCKET || process.env.S3_BUCKET || process.env.PEQUENOS_GRUPOS_BUCKET;
    const publicBase = process.env.INVITE_COVERS_PUBLIC_BASE_URL;
    if (!bucket) {
      return NextResponse.json({ error: 'Bucket não configurado (INVITE_COVERS_BUCKET)' }, { status: 500 });
    }
    if (!publicBase) {
      return NextResponse.json({ error: 'URL pública não configurada (INVITE_COVERS_PUBLIC_BASE_URL)' }, { status: 500 });
    }

    const ext = extFromContentType(contentType);
    const objectKey = `invite-covers/${meetingId}/${Date.now()}-${randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 });
    const publicUrl = `${publicBase.replace(/\/$/, '')}/${objectKey}`;
    // #region agent log
    fetch('http://127.0.0.1:7855/ingest/9ae56e2b-dd3e-4c99-8d52-723e69ab8fcd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'790123'},body:JSON.stringify({sessionId:'790123',location:'presign/route.ts:86',message:'Presign generated',data:{bucket,hasUploadUrl:!!uploadUrl,hasPublicUrl:!!publicUrl,objectKey,region:process.env.AWS_REGION},timestamp:Date.now(),hypothesisId:'UPLOAD'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({ uploadUrl, publicUrl, objectKey });
  } catch (error) {
    console.error('Erro ao gerar presign de capa:', error);
    return NextResponse.json({ error: 'Erro ao gerar link de upload' }, { status: 500 });
  }
}

