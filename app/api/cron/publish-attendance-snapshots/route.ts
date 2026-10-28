import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { queryMany } from '@/lib/db/postgres';
import { isAttendanceSnapshotEnabled, publishAttendanceSnapshotNow } from '@/lib/attendance-snapshot';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * POST /api/cron/publish-attendance-snapshots
 * (Re)publica no S3 o snapshot público de todas as listas de presença ativas
 * (encontros não cancelados com data a partir de ontem).
 * Uso: backfill das listas existentes e rede de segurança periódica.
 *
 * Protegida pelo header Authorization: Bearer <ATTENDANCE_SNAPSHOT_SECRET>
 * (segredo próprio, para não reativar outras rotas /api/cron/* que usam CRON_SECRET).
 *   curl -X POST -H "Authorization: Bearer $ATTENDANCE_SNAPSHOT_SECRET" https://seudominio.com/api/cron/publish-attendance-snapshots
 *
 * Só publica com ATTENDANCE_SNAPSHOT_ENABLED=true.
 */
export async function POST(request: Request) {
  const secret = process.env.ATTENDANCE_SNAPSHOT_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'Serviço não configurado' }, { status: 503 });
  }
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token || !safeEqual(token, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAttendanceSnapshotEnabled()) {
    return NextResponse.json(
      { error: 'Snapshots desativados (defina ATTENDANCE_SNAPSHOT_ENABLED=true)' },
      { status: 409 }
    );
  }

  try {
    const meetings = await queryMany<{ id: string }>(
      `SELECT id FROM meetings
       WHERE attendance_list_token IS NOT NULL
         AND is_cancelled = FALSE
         AND meeting_date >= CURRENT_DATE - 1
       ORDER BY meeting_date ASC`
    );

    const published: string[] = [];
    const failed: Array<{ meeting_id: string; error: string }> = [];
    const skipped: Array<{ meeting_id: string; reason: string }> = [];

    // Sequencial de propósito: volume pequeno e sem pressão no pool do Postgres.
    for (const { id } of meetings) {
      try {
        const result = await publishAttendanceSnapshotNow(id);
        if (result.status === 'skipped') skipped.push({ meeting_id: id, reason: result.reason });
        else published.push(...result.keys);
      } catch (error) {
        failed.push({ meeting_id: id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return NextResponse.json({
      ok: failed.length === 0,
      total: meetings.length,
      published,
      skipped,
      failed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[attendance-snapshot] erro no backfill:', error);
    return NextResponse.json({ error: 'Erro ao publicar snapshots' }, { status: 500 });
  }
}
