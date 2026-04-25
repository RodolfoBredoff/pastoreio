import { NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryOne } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { getS3Client } from '@/lib/aws/s3-client';

/**
 * PUT /api/meetings/[id]/invite-cover
 * Salva (ou remove) a capa do convite no encontro.
 * Body:
 *  - { publicUrl: string, objectKey: string } para definir
 *  - { remove: true } para remover
 */
export async function PUT(
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
    const meeting = await queryOne<{
      id: string;
      group_id: string;
      invite_cover_image_key: string | null;
    }>(
      `SELECT id, group_id, invite_cover_image_key FROM meetings WHERE id = $1`,
      [meetingId]
    );
    if (!meeting || meeting.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { publicUrl, objectKey, remove } = body as {
      publicUrl?: string;
      objectKey?: string;
      remove?: boolean;
    };

    const bucket = process.env.INVITE_COVERS_BUCKET || process.env.S3_BUCKET || process.env.PEQUENOS_GRUPOS_BUCKET;

    if (remove) {
      // best-effort delete old object
      if (bucket && meeting.invite_cover_image_key) {
        try {
          await getS3Client().send(
            new DeleteObjectCommand({ Bucket: bucket, Key: meeting.invite_cover_image_key })
          );
        } catch (e) {
          console.warn('Falha ao remover capa antiga do S3 (ignorado):', e);
        }
      }

      await query(
        `UPDATE meetings SET invite_cover_image_url = NULL, invite_cover_image_key = NULL WHERE id = $1`,
        [meetingId]
      );
      return NextResponse.json({ ok: true, invite_cover_image_url: null });
    }

    const urlVal = typeof publicUrl === 'string' ? publicUrl.trim() : '';
    const keyVal = typeof objectKey === 'string' ? objectKey.trim() : '';
    if (!urlVal || !keyVal) {
      return NextResponse.json(
        { error: 'Informe publicUrl e objectKey' },
        { status: 400 }
      );
    }

    // If replacing, delete old object best-effort
    if (bucket && meeting.invite_cover_image_key && meeting.invite_cover_image_key !== keyVal) {
      try {
        await getS3Client().send(
          new DeleteObjectCommand({ Bucket: bucket, Key: meeting.invite_cover_image_key })
        );
      } catch (e) {
        console.warn('Falha ao remover capa antiga do S3 (ignorado):', e);
      }
    }

    const result = await query<{ invite_cover_image_url: string | null }>(
      `UPDATE meetings
       SET invite_cover_image_url = $2, invite_cover_image_key = $3
       WHERE id = $1
       RETURNING invite_cover_image_url`,
      [meetingId, urlVal, keyVal]
    );

    return NextResponse.json({
      ok: true,
      invite_cover_image_url: result.rows[0]?.invite_cover_image_url ?? null,
    });
  } catch (error) {
    console.error('Erro ao salvar capa do convite:', error);
    return NextResponse.json({ error: 'Erro ao salvar capa' }, { status: 500 });
  }
}

