import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, queryOne } from '@/lib/db/postgres';

export type Period = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

export type MemberFilter = 'total' | 'participants' | 'visitors';

function getPeriodConfig(period: Period): { interval: string; truncate: string; limit: number } {
  switch (period) {
    case 'weekly':
      return { interval: '8 weeks', truncate: 'week', limit: 8 };
    case 'monthly':
      return { interval: '6 months', truncate: 'month', limit: 6 };
    case 'quarterly':
      return { interval: '12 months', truncate: 'quarter', limit: 4 };
    case 'semiannual':
      return { interval: '24 months', truncate: 'month', limit: 4 }; // 4 semestres = agrupar 6 meses
    case 'yearly':
      return { interval: '3 years', truncate: 'year', limit: 3 };
  }
}

function formatPeriodLabel(dateStr: string, period: Period): string {
  const date = new Date(dateStr + 'T12:00:00Z');
  switch (period) {
    case 'weekly': {
      const day = date.getUTCDate().toString().padStart(2, '0');
      const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
      return `${day}/${month}`;
    }
    case 'monthly':
      return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    case 'quarterly': {
      const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
      const year = date.getUTCFullYear().toString().slice(-2);
      return `T${quarter}/${year}`;
    }
    case 'semiannual': {
      const sem = date.getUTCMonth() < 6 ? 1 : 2;
      const year = date.getUTCFullYear().toString().slice(-2);
      return `S${sem}/${year}`;
    }
    case 'yearly':
      return String(date.getUTCFullYear());
  }
}

/**
 * GET /api/engagement
 *
 * Modos:
 *  1. ?period=weekly|monthly|quarterly|semiannual|yearly  → dados agrupados por período
 *  2. ?meeting_id=uuid                                    → presença detalhada de um encontro
 *  3. ?group_id=uuid (admin)                              → dados de um grupo específico
 *  4. ?title_filter=texto                                 → filtrar encontros por título (com outros filtros)
 *  5. ?mode=title_groups                                  → lista títulos distintos para o seletor
 *  6. ?title_group=texto                                  → agrega todos os encontros com aquele título exato
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') as Period | null;
    const meetingId = searchParams.get('meeting_id');
    const groupIdParam = searchParams.get('group_id');
    const titleFilter = searchParams.get('title_filter')?.trim() || null;
    const mode = searchParams.get('mode');
    const titleGroup = searchParams.get('title_group')?.trim() || null;
    const yearMonth = searchParams.get('year_month')?.trim() || null;
    const publicToken = searchParams.get('public_token')?.trim() || null;
    const memberFilterParam = searchParams.get('member_filter');
    const memberFilter: MemberFilter =
      memberFilterParam === 'participants' || memberFilterParam === 'visitors'
        ? memberFilterParam
        : 'total';

    let groupId: string | null = null;
    let isCoordinator = false;

    if (publicToken) {
      // Modo público: não exige autenticação, mas valida token e se o compartilhamento está ativo
      const group = await queryOne<{ id: string; engagement_share_enabled: boolean }>(
        `SELECT id, engagement_share_enabled FROM groups WHERE engagement_share_token = $1`,
        [publicToken]
      );
      if (!group || !group.engagement_share_enabled) {
        return NextResponse.json({ error: 'Link de engajamento inválido ou desativado' }, { status: 404 });
      }
      groupId = group.id;
    } else {
      // Modo autenticado (líder/coordenador/admin)
      await requireAuth();
      const leader = await getCurrentLeader();

      groupId = leader?.group_id ?? null;

      // Coordenadores podem filtrar por qualquer grupo da organização
      if (leader?.role === 'coordinator') {
        isCoordinator = true;
        if (groupIdParam) {
          // Verificar se o grupo pertence à organização do coordenador
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
      } else if (groupIdParam) {
        // Admins também podem filtrar por grupo
        const { getAdminSession } = await import('@/lib/auth/admin-session');
        const admin = await getAdminSession();
        if (admin) {
          groupId = groupIdParam;
        }
      }
    }

    if (!groupId) {
      if (isCoordinator) {
        return NextResponse.json({ error: 'Selecione um grupo para visualizar os dados de engajamento' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }

    // ─── Modo: meses disponíveis (para filtro mensal no ano)
    if (mode === 'available_months') {
      const rows = await queryMany<{ year_month: string }>(
        `SELECT DISTINCT to_char(meeting_date, 'YYYY-MM') as year_month
         FROM meetings
         WHERE group_id = $1
           AND is_cancelled = FALSE
           AND meeting_date <= CURRENT_DATE
         ORDER BY year_month DESC
         LIMIT 24`,
        [groupId]
      );
      return NextResponse.json({ yearMonths: rows.map((r) => r.year_month) });
    }

    // ─── Modo: lista de títulos agrupados ──────────────────────────────────
    if (mode === 'title_groups') {
      const titleGroups = await queryMany<{ title: string; count: number; latest_date: string }>(
        `SELECT TRIM(title) as title, COUNT(*)::int as count, MAX(meeting_date)::text as latest_date
         FROM meetings
         WHERE group_id = $1
           AND title IS NOT NULL
           AND TRIM(title) <> ''
           AND is_cancelled = FALSE
           AND meeting_date <= CURRENT_DATE
         GROUP BY TRIM(title)
         HAVING COUNT(*) > 0
         ORDER BY MAX(meeting_date) DESC`,
        [groupId]
      );
      return NextResponse.json({ mode: 'title_groups', titleGroups });
    }

    // ─── Modo: agregar por nome de encontro específico ─────────────────────
    if (titleGroup) {
      const trimmedTitle = titleGroup.trim();
      const meetings = await queryMany<{
        id: string;
        meeting_date: string;
        title: string | null;
        meeting_time: string | null;
        meeting_type: string;
      }>(
        `SELECT id, meeting_date, title, meeting_time, meeting_type
         FROM meetings
         WHERE group_id = $1
           AND LOWER(TRIM(title)) = LOWER(TRIM($2))
           AND is_cancelled = FALSE
           AND meeting_date <= CURRENT_DATE
         ORDER BY meeting_date DESC`,
        [groupId, trimmedTitle]
      );

      if (meetings.length === 0) {
        return NextResponse.json({
          mode: 'title_group',
          title: titleGroup,
          meetings: [],
          memberStats: [],
          summary: { total: 0, totalPresent: 0, totalAbsent: 0, avgRate: 0 },
        });
      }

      const meetingIds = meetings.map((m) => m.id);

      const [attendance, guestCounts] = await Promise.all([
        queryMany<{
          meeting_id: string;
          member_id: string;
          member_name: string;
          member_type: string;
          is_present: boolean;
        }>(
          `SELECT a.meeting_id, a.member_id, m.full_name as member_name, m.member_type, a.is_present
           FROM attendance a
           JOIN members m ON m.id = a.member_id
           WHERE a.meeting_id = ANY($1::uuid[])`,
          [meetingIds]
        ),
        queryMany<{ meeting_id: string; cnt: number }>(
          `SELECT meeting_id, COUNT(*)::int as cnt FROM attendance_guests WHERE meeting_id = ANY($1::uuid[]) GROUP BY meeting_id`,
          [meetingIds]
        ),
      ]);

      const totalGuests = guestCounts.reduce((s, r) => s + r.cnt, 0);

      const filteredAttendance =
        memberFilter === 'participants'
          ? attendance.filter((a) => a.member_type === 'participant')
          : memberFilter === 'visitors'
            ? attendance.filter((a) => a.member_type === 'visitor')
            : attendance;
      const guestsForTotal = memberFilter === 'total' || memberFilter === 'visitors' ? totalGuests : 0;

      const memberMap = new Map<string, { name: string; type: string; presences: number; absences: number }>();
      for (const att of filteredAttendance) {
        if (!memberMap.has(att.member_id)) {
          memberMap.set(att.member_id, { name: att.member_name, type: att.member_type, presences: 0, absences: 0 });
        }
        if (att.is_present) memberMap.get(att.member_id)!.presences++;
        else memberMap.get(att.member_id)!.absences++;
      }

      const memberStats = Array.from(memberMap.values())
        .map((m) => ({ ...m, taxa: m.presences + m.absences > 0 ? Math.round((m.presences / (m.presences + m.absences)) * 100) : 0 }))
        .sort((a, b) => b.presences - a.presences);

      const totalPresent = filteredAttendance.filter((a) => a.is_present).length + guestsForTotal;
      const totalAbsent = filteredAttendance.filter((a) => !a.is_present).length;
      const total = filteredAttendance.length + guestsForTotal;

      return NextResponse.json({
        mode: 'title_group',
        title: titleGroup,
        meetings: meetings.map((m) => ({
          id: m.id,
          meeting_date: m.meeting_date,
          title: m.title,
          meeting_time: m.meeting_time,
          meeting_type: m.meeting_type,
          label: `${m.title ?? ''} — ${new Date(m.meeting_date + 'T12:00:00Z').toLocaleDateString('pt-BR')}`,
        })),
        memberStats,
        summary: {
          total,
          totalPresent,
          totalAbsent,
          avgRate: total > 0 ? Math.round((totalPresent / total) * 100) : 0,
        },
      });
    }

    // ─── Modo: encontro específico ─────────────────────────────────────────
    if (meetingId) {
      // Verificar que o encontro pertence ao grupo
      const meeting = await queryOne<{
        id: string;
        meeting_date: string;
        title: string | null;
        meeting_time: string | null;
        is_cancelled: boolean;
      }>(
        `SELECT id, meeting_date, title, meeting_time, is_cancelled
         FROM meetings WHERE id = $1 AND group_id = $2`,
        [meetingId, groupId]
      );

      if (!meeting) {
        return NextResponse.json({ error: 'Encontro não encontrado' }, { status: 404 });
      }

      const [attendance, guests] = await Promise.all([
        queryMany<{
          member_id: string;
          member_name: string;
          member_type: string;
          is_present: boolean;
        }>(
          `SELECT a.member_id, m.full_name as member_name, m.member_type, a.is_present
           FROM attendance a
           JOIN members m ON m.id = a.member_id
           WHERE a.meeting_id = $1
           ORDER BY m.full_name ASC`,
          [meetingId]
        ),
        queryMany<{ full_name: string; phone: string | null }>(
          `SELECT g.full_name, g.phone FROM attendance_guests ag JOIN guest_visitors g ON g.id = ag.guest_id WHERE ag.meeting_id = $1 ORDER BY g.full_name ASC`,
          [meetingId]
        ),
      ]);

      const filteredAttendance =
        memberFilter === 'participants'
          ? attendance.filter((a) => a.member_type === 'participant')
          : memberFilter === 'visitors'
            ? attendance.filter((a) => a.member_type === 'visitor')
            : attendance;
      const includeGuests = memberFilter === 'total' || memberFilter === 'visitors';
      const filteredGuests = includeGuests ? guests : [];
      const present = filteredAttendance.filter((a) => a.is_present);
      const absent = filteredAttendance.filter((a) => !a.is_present);
      const totalPresent = present.length + filteredGuests.length;
      const total = filteredAttendance.length + filteredGuests.length;

      return NextResponse.json({
        mode: 'meeting',
        meeting,
        attendance: filteredAttendance,
        guests: filteredGuests,
        summary: {
          total,
          present: totalPresent,
          absent: absent.length,
          rate: total > 0 ? Math.round((totalPresent / total) * 100) : 0,
        },
      });
    }

    // ─── Modo: período ─────────────────────────────────────────────────────
    const effectivePeriod: Period = period && ['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'].includes(period)
      ? period
      : 'monthly';

    const isSingleMonthFilter = effectivePeriod === 'monthly' && !!yearMonth && /^\d{4}-\d{2}$/.test(yearMonth);

    let meetings;

    if (isSingleMonthFilter) {
      // Filtro por mês específico (ano-mês). Considera apenas encontros daquele mês.
      const monthStart = `${yearMonth}-01`;
      const titleCond = titleFilter ? ' AND title ILIKE $3' : '';
      const params: unknown[] = [groupId, monthStart, ...(titleFilter ? [`%${titleFilter}%`] : [])];

      meetings = await queryMany<{
        id: string;
        meeting_date: string;
        title: string | null;
        meeting_type: string;
        period_start: string;
      }>(
        `SELECT id, meeting_date, title, meeting_type,
                date_trunc('month', meeting_date)::date::text as period_start
         FROM meetings
         WHERE group_id = $1
           AND is_cancelled = FALSE
           AND meeting_date >= $2::date
           AND meeting_date < ($2::date + INTERVAL '1 month')${titleCond}
         ORDER BY meeting_date ASC`,
        params as string[]
      );
    } else {
      const { interval, truncate } = getPeriodConfig(effectivePeriod);

      const periodStartExpr = effectivePeriod === 'semiannual'
        ? `(CASE WHEN EXTRACT(MONTH FROM meeting_date) < 7 
             THEN (EXTRACT(YEAR FROM meeting_date)::text || '-01-01') 
             ELSE (EXTRACT(YEAR FROM meeting_date)::text || '-07-01') 
           END)::date::text`
        : `date_trunc($1, meeting_date)::date::text`;

      const titleCond = titleFilter
        ? (effectivePeriod === 'semiannual' ? ` AND title ILIKE $3` : ` AND title ILIKE $4`)
        : '';
      const queryParams: unknown[] = effectivePeriod === 'semiannual'
        ? [groupId, interval, ...(titleFilter ? [`%${titleFilter}%`] : [])]
        : [truncate, groupId, interval, ...(titleFilter ? [`%${titleFilter}%`] : [])];

      const meetingsQuery = effectivePeriod === 'semiannual'
        ? `SELECT id, meeting_date, title, meeting_type, ${periodStartExpr} as period_start
           FROM meetings 
           WHERE group_id = $1 AND is_cancelled = FALSE
             AND meeting_date >= (CURRENT_DATE - $2::interval)
             AND meeting_date <= CURRENT_DATE${titleCond}
           ORDER BY meeting_date ASC`
        : `SELECT id, meeting_date, title, meeting_type, ${periodStartExpr} as period_start
           FROM meetings 
           WHERE group_id = $2 AND is_cancelled = FALSE
             AND meeting_date >= (CURRENT_DATE - $3::interval)
             AND meeting_date <= CURRENT_DATE${titleCond}
           ORDER BY meeting_date ASC`;

      meetings = await queryMany<{
      id: string;
      meeting_date: string;
      title: string | null;
      meeting_type: string;
      period_start: string;
      }>(meetingsQuery, queryParams as string[]);
    }

    if (meetings.length === 0) {
      return NextResponse.json({
        mode: 'period',
        period: effectivePeriod,
        periodData: [],
        memberStats: [],
        meetingList: [],
      });
    }

    const meetingIds = meetings.map((m) => m.id);

    // Buscar todas as presenças (membros) e contagem de visitantes por encontro
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
         WHERE a.meeting_id = ANY($1::uuid[])`,
        [meetingIds]
      ),
      queryMany<{ meeting_id: string; cnt: number }>(
        `SELECT meeting_id, COUNT(*)::int as cnt FROM attendance_guests WHERE meeting_id = ANY($1::uuid[]) GROUP BY meeting_id`,
        [meetingIds]
      ),
    ]);

    const guestCountByMeeting = new Map(guestCounts.map((r) => [r.meeting_id, r.cnt]));
    const includeGuestsInPeriod = memberFilter === 'total' || memberFilter === 'visitors';

    const attendanceByType =
      memberFilter === 'participants'
        ? attendance.filter((a) => a.member_type === 'participant')
        : memberFilter === 'visitors'
          ? attendance.filter((a) => a.member_type === 'visitor')
          : attendance;

    // Agrupar por período
    const periodMap = new Map<string, { presentes: number; ausentes: number; meetingCount: number }>();

    for (const meeting of meetings) {
      const key = meeting.period_start;
      if (!periodMap.has(key)) {
        periodMap.set(key, { presentes: 0, ausentes: 0, meetingCount: 0 });
      }
      periodMap.get(key)!.meetingCount++;

      const meetingAtt = attendanceByType.filter((a) => a.meeting_id === meeting.id);
      for (const att of meetingAtt) {
        if (att.is_present) {
          periodMap.get(key)!.presentes++;
        } else {
          periodMap.get(key)!.ausentes++;
        }
      }
      if (includeGuestsInPeriod) {
        const guestsInMeeting = guestCountByMeeting.get(meeting.id) ?? 0;
        periodMap.get(key)!.presentes += guestsInMeeting;
      }
    }

    // Construir array de dados por período, ordenado
    const periodData = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodStart, data]) => ({
        period: formatPeriodLabel(periodStart, effectivePeriod),
        periodStart,
        presentes: data.presentes,
        ausentes: data.ausentes,
        meetingCount: data.meetingCount,
        taxa: data.presentes + data.ausentes > 0
          ? Math.round((data.presentes / (data.presentes + data.ausentes)) * 100)
          : 0,
      }));

    // Estatísticas por membro (todo o período), já filtrado por tipo
    const memberMap = new Map<string, { name: string; type: string; presences: number; absences: number }>();

    for (const att of attendanceByType) {
      if (!memberMap.has(att.member_id)) {
        memberMap.set(att.member_id, {
          name: att.member_name,
          type: att.member_type,
          presences: 0,
          absences: 0,
        });
      }
      if (att.is_present) {
        memberMap.get(att.member_id)!.presences++;
      } else {
        memberMap.get(att.member_id)!.absences++;
      }
    }

    const memberStats = Array.from(memberMap.values())
      .filter((m) => m.presences + m.absences > 0)
      .map((m) => ({
        ...m,
        taxa: Math.round((m.presences / (m.presences + m.absences)) * 100),
      }))
      .sort((a, b) => b.presences - a.presences);

    // Lista de encontros para o seletor de filtro
    const meetingList = meetings.map((m) => ({
      id: m.id,
      meeting_date: m.meeting_date,
      title: m.title,
      meeting_type: (m as { meeting_type?: string }).meeting_type ?? 'regular',
      label: m.title
        ? `${m.title} — ${new Date(m.meeting_date + 'T12:00:00Z').toLocaleDateString('pt-BR')}`
        : new Date(m.meeting_date + 'T12:00:00Z').toLocaleDateString('pt-BR'),
    })).reverse(); // mais recente primeiro

    return NextResponse.json({
      mode: 'period',
      period: effectivePeriod,
      periodData,
      memberStats,
      meetingList,
    });
  } catch (error) {
    console.error('Erro ao buscar dados de engajamento:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
