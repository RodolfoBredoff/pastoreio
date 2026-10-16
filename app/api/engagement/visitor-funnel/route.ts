import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';
import { computeVisitorFunnel, type FunnelResult } from '@/lib/visitor-funnel';

export type { FunnelResult };

/**
 * GET /api/engagement/visitor-funnel
 *
 * Funil de conversão de visitantes:
 * 1ª visita → 2ª visita → 3ª visita → 4ª visita → Convertidos
 *
 * Regras (alinhadas com a seção Crescimento do grupo):
 *  - Presença real como fonte da verdade (contagem de presenças).
 *  - Visitantes não cadastrados (guest_visitors) também entram no funil.
 *  - Regra reduzida de conversão: integration_stage 'membro' OU participante
 *    com 4+ presenças. Visitantes não cadastrados nunca aparecem como convertidos.
 *
 * Query params:
 * - period: '90' | '180' | '365' (dias) - default 180
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const periodDays = parseInt(searchParams.get('period') || '180', 10);

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - periodDays);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const [members, memberAttendance, guests, guestAttendance] = await Promise.all([
      queryMany<{ id: string; full_name: string; member_type: string; integration_stage: string; created_at: string }>(
        `SELECT id, full_name, member_type, integration_stage, created_at::text as created_at
         FROM members
         WHERE group_id = $1 AND created_at >= $2::date`,
        [leader.group_id, startDateStr]
      ),
      queryMany<{ member_id: string; meeting_id: string; is_present: boolean; meeting_date: string }>(
        `SELECT a.member_id, a.meeting_id, a.is_present, meetings.meeting_date::text as meeting_date
         FROM attendance a
         JOIN meetings ON meetings.id = a.meeting_id
         JOIN members m ON m.id = a.member_id
         WHERE m.group_id = $1 AND m.created_at >= $2::date
           AND meetings.is_cancelled = FALSE`,
        [leader.group_id, startDateStr]
      ),
      queryMany<{ id: string; full_name: string; created_at: string }>(
        `SELECT id, full_name, created_at::text as created_at
         FROM guest_visitors
         WHERE group_id = $1 AND created_at >= $2::date`,
        [leader.group_id, startDateStr]
      ),
      queryMany<{ guest_id: string; meeting_id: string; meeting_date: string }>(
        `SELECT ag.guest_id, ag.meeting_id, meetings.meeting_date::text as meeting_date
         FROM attendance_guests ag
         JOIN meetings ON meetings.id = ag.meeting_id
         JOIN guest_visitors g ON g.id = ag.guest_id
         WHERE g.group_id = $1 AND g.created_at >= $2::date
           AND meetings.is_cancelled = FALSE`,
        [leader.group_id, startDateStr]
      ),
    ]);

    const funnel = computeVisitorFunnel({
      periodDays,
      today: new Date(),
      members,
      memberAttendance,
      guests,
      guestAttendance,
    });

    return NextResponse.json(funnel);
  } catch (error) {
    console.error('Erro ao calcular funil de visitantes:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
