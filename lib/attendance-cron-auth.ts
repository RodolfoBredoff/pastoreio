import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Autoriza as rotas internas da lista de presença (backfill de snapshot e sync do buffer)
 * pelo header Authorization: Bearer <ATTENDANCE_SNAPSHOT_SECRET>.
 * Retorna uma resposta de erro, ou null quando autorizado.
 */
export function rejectUnlessAttendanceSecret(request: Request): NextResponse | null {
  const secret = process.env.ATTENDANCE_SNAPSHOT_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'Serviço não configurado' }, { status: 503 });
  }
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
