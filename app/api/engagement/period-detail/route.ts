import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, queryOne } from '@/lib/db/postgres';

export type Period = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
export type MemberFilter = 'total' | 'participants' | 'visitors';

const MEETING_ENGAGEMENT_VISIBILITY = `(
  meeting_date <= CURRENT_DATE
  OR EXISTS (SELECT 1 FROM attendance a WHERE a.meeting_id = meetings.id)
  OR EXISTS (SELECT 1 FROM attendance_guests ag WHERE ag.meeting_id = meetings.id)
)`;

function getPeriodEndDate(periodStart: string, period: Period): string {
  const start = new Date(periodStart + 'T12:00:00Z');
  
  switch (period) {
    case 'weekly': {
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      return end.toISOString().split('T')[0];
    }
    case 'monthly': {
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      return end.toISOString().split('T')[0];
    }
    case 'quarterly': {
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 3);
      return end.toISOString().split('T')[0];
    }
    case 'semiannual': {
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 6);
      return end.toISOString().split('T')[0];
    }
    case 'yearly': {
      const end = new Date(start);
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      return end.toISOString().split('T')[0];
    }
  }
}

/**
 * GET /api/engagement/period-detail
 * 
 * Retorna detalhes de um período específico com lista de membros presentes e ausentes
 * 
 * Query params:
 * - period_start: data de início do período (YYYY-MM-DD)
 * - period: tipo de período (weekly, monthly, quarterly, semiannual, yearly)
 * - member_filter: filtro de tipo de membro (total, participants, visitors)
 * - group_id: ID do grupo (admin/coordenador)
 * - public_token: token público (acesso sem autenticação)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const periodStart = searchParams.get('period_start');
    const period = searchParams.get('period') as Period;
    const groupIdParam = searchParams.get('group_id');
    const publicToken = searchParams.get('public_token')?.trim() || null;
    const memberFilterParam = searchParams.get('member_filter');
    const memberFilter: MemberFilter =
      memberFilterParam === 'participants' || memberFilterParam === 'visitors'
        ? memberFilterParam
        : 'total';

    if (!periodStart || !period) {
      return NextResponse.json({ error: 'period_start e period são obrigatórios' }, { status: 400 });
    }

    let groupId: string | null = null;
    let isAdmin = false;

    if (publicToken) {
      const group = await queryOne<{ id: string; engagement_share_enabled: boolean }>(
        `SELECT id, engagement_share_enabled FROM groups WHERE engagement_share_token = $1`,
        [publicToken]
      );
      if (!group || !group.engagement_share_enabled) {
        return NextResponse.json({ error: 'Link de engajamento inválido ou desativado' }, { status: 404 });
      }
      groupId = group.id;
    } else {
      const { getAdminSession } = await import('@/lib/auth/admin-session');
      const admin = await getAdminSession();

      if (admin) {
        isAdmin = true;
        if (groupIdParam) groupId = groupIdParam;
      }

      if (!isAdmin) {
        await requireAuth();
        const leader = await getCurrentLeader();
        groupId = leader?.group_id ?? null;

        if (leader?.role === 'coordinator' && groupIdParam) {
          const group = await queryOne<{ id: string; organization_id: string }>(
            `SELECT id, organization_id FROM groups WHERE id = $1`,
            [groupIdParam]
          );
          if (group && group.organization_id === leader.organization_id) {
            groupId = groupIdParam;
          } else {
            return NextResponse.json({ error: 'Grupo não encontrado ou não pertence à sua organização' }, { status: 403 });
          }
        }
      }
    }

    if (!groupId) {
      return NextResponse.json({ error: 'Grupo não identificado' }, { status: 400 });
    }

    const periodEnd = getPeriodEndDate(periodStart, period);

    // Buscar encontros do período
    const meetings = await queryMany<{
      id: string;
      meeting_date: string;
      title: string | null;
    }>(
      `SELECT id, meeting_date, title
       FROM meetings
       WHERE group_id = $1
         AND is_cancelled = FALSE
         AND ${MEETING_ENGAGEMENT_VISIBILITY.replace(/\n/g, ' ')}
         AND meeting_date >= $2::date
         AND meeting_date < $3::date
       ORDER BY meeting_date DESC`,
      [groupId, periodStart, periodEnd]
    );

    if (meetings.length === 0) {
      return NextResponse.json({
        periodLabel: periodStart,
        periodStart,
        meetingCount: 0,
        meetings: [],
        presentMembers: [],
        absentMembers: [],
        guestCount: 0,
      });
    }

    const meetingIds = meetings.map((m) => m.id);

    // Buscar presenças e contar visitantes
    const [attendance, guestCounts] = await Promise.all([
      queryMany<{
        meeting_id: string;
        member_id: string;
        member_name: string;
        member_type: string;
        is_present: boolean;
      }>(
        `SELECT 
           a.meeting_id, a.member_id,
           m.full_name as member_name, m.member_type,
           a.is_present
         FROM attendance a
         JOIN members m ON m.id = a.member_id
         JOIN meetings mt ON mt.id = a.meeting_id
         WHERE a.meeting_id = ANY($1::uuid[])
           AND m.group_id = mt.group_id`,
        [meetingIds]
      ),
      queryMany<{ meeting_id: string; cnt: number }>(
        `SELECT meeting_id, COUNT(*)::int as cnt FROM attendance_guests WHERE meeting_id = ANY($1::uuid[]) GROUP BY meeting_id`,
        [meetingIds]
      ),
    ]);

    const totalGuests = guestCounts.reduce((s, r) => s + r.cnt, 0);

    // Filtrar por tipo de membro
    const filteredAttendance =
      memberFilter === 'participants'
        ? attendance.filter((a) => a.member_type === 'participant')
        : memberFilter === 'visitors'
          ? attendance.filter((a) => a.member_type === 'visitor')
          : attendance;

    // Agrupar por membro e contar presenças/ausências
    const memberMap = new Map<string, {
      name: string;
      type: string;
      presenceCount: number;
      absenceCount: number;
    }>();

    for (const att of filteredAttendance) {
      if (!memberMap.has(att.member_id)) {
        memberMap.set(att.member_id, {
          name: att.member_name,
          type: att.member_type,
          presenceCount: 0,
          absenceCount: 0,
        });
      }
      if (att.is_present) {
        memberMap.get(att.member_id)!.presenceCount++;
      } else {
        memberMap.get(att.member_id)!.absenceCount++;
      }
    }

    const members = Array.from(memberMap.entries()).map(([id, data]) => ({
      id,
      ...data,
    }));

    const presentMembers = members
      .filter((m) => m.presenceCount > 0)
      .sort((a, b) => b.presenceCount - a.presenceCount);

    const absentMembers = members
      .filter((m) => m.absenceCount > 0)
      .sort((a, b) => b.absenceCount - a.absenceCount);

    return NextResponse.json({
      periodLabel: periodStart,
      periodStart,
      meetingCount: meetings.length,
      meetings: meetings.map((m) => ({
        id: m.id,
        date: m.meeting_date,
        title: m.title,
      })),
      presentMembers,
      absentMembers,
      guestCount: totalGuests,
    });
  } catch (error) {
    console.error('Erro ao buscar detalhes do período:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
