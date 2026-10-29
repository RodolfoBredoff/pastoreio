import { NextResponse } from 'next/server';
import { rejectUnlessAttendanceSecret } from '@/lib/attendance-cron-auth';
import { syncAttendanceBuffer } from '@/lib/attendance-buffer-sync';

/**
 * POST /api/cron/sync-attendance-buffer
 * Passa para o Postgres as confirmações recebidas pela Lambda enquanto a EC2 estava
 * desligada (buffer no DynamoDB). Chamado no boot e a cada 5 minutos pelo timer systemd
 * (scripts/install-attendance-sync-timer.sh).
 *
 *   curl -X POST -H "Authorization: Bearer $ATTENDANCE_SNAPSHOT_SECRET" http://localhost/api/cron/sync-attendance-buffer
 */
export async function POST(request: Request) {
  const rejected = rejectUnlessAttendanceSecret(request);
  if (rejected) return rejected;

  try {
    const result = await syncAttendanceBuffer();
    return NextResponse.json({ ok: result.failed.length === 0, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[attendance-buffer] erro no sync:', error);
    return NextResponse.json({ error: 'Erro ao sincronizar' }, { status: 500 });
  }
}
