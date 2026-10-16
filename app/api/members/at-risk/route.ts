import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';
import { computeAtRiskMembers, type MemberAtRisk } from '@/lib/member-at-risk';

export type { MemberAtRisk };

/**
 * GET /api/members/at-risk
 *
 * Retorna membros em risco de desengajamento. Regras FLEXIBILIZADAS:
 * - Ausências consecutivas só pontuam a partir de 3 (2 faltas seguidas é ritmo
 *   normal de quem aparece de vez em quando).
 * - Frequência só penaliza abaixo de 40% (crítica abaixo de 25%).
 * - 30 dias sem presença não é mais fator; só 60+ dias — ou nenhuma presença
 *   em todo o período (para quem já existia antes da janela).
 *
 * Query params:
 * - period: '30' | '60' | '90' (dias)
 * - member_filter: 'total' | 'participants' | 'visitors'
 * - risk_level: 'all' | 'medium' | 'high' | 'critical'
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const periodDays = parseInt(searchParams.get('period') || '90', 10);
    const memberFilter = searchParams.get('member_filter') || 'total';
    const riskLevelFilter = searchParams.get('risk_level') || 'all';

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);
    const startDateStr = startDate.toISOString().split('T')[0];

    // 1. Calcular ausências consecutivas (últimos 5 encontros)
    const consecutiveAbsencesQuery = `
      WITH recent_meetings AS (
        SELECT id, meeting_date
        FROM meetings
        WHERE group_id = $1
          AND is_cancelled = FALSE
          AND meeting_date <= CURRENT_DATE
        ORDER BY meeting_date DESC
        LIMIT 5
      ),
      member_attendance AS (
        SELECT 
          m.id as member_id,
          rm.id as meeting_id,
          rm.meeting_date,
          COALESCE(a.is_present, FALSE) as is_present,
          ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY rm.meeting_date DESC) as rn
        FROM members m
        CROSS JOIN recent_meetings rm
        LEFT JOIN attendance a ON a.member_id = m.id AND a.meeting_id = rm.id
        WHERE m.group_id = $1
          AND m.is_active = TRUE
          ${memberFilter === 'participants' ? "AND m.member_type = 'participant'" : ''}
          ${memberFilter === 'visitors' ? "AND m.member_type = 'visitor'" : ''}
      ),
      consecutive_count AS (
        SELECT 
          member_id,
          COUNT(*) as consecutive_absences
        FROM member_attendance
        WHERE rn <= 5 AND is_present = FALSE
        GROUP BY member_id
        HAVING COUNT(*) >= 2
      )
      SELECT 
        m.id,
        m.full_name,
        m.member_type,
        m.phone,
        COALESCE(cc.consecutive_absences, 0) as consecutive_absences
      FROM members m
      LEFT JOIN consecutive_count cc ON cc.member_id = m.id
      WHERE m.group_id = $1
        AND m.is_active = TRUE
        ${memberFilter === 'participants' ? "AND m.member_type = 'participant'" : ''}
        ${memberFilter === 'visitors' ? "AND m.member_type = 'visitor'" : ''}
    `;

    // 2. Calcular frequência e última presença
    const frequencyQuery = `
      WITH member_stats AS (
        SELECT 
          m.id,
          m.created_at,
          COUNT(DISTINCT mt.id) as total_meetings,
          COUNT(DISTINCT CASE WHEN a.is_present THEN mt.id END) as attended,
          ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.is_present THEN mt.id END) / 
            NULLIF(COUNT(DISTINCT mt.id), 0), 1) as frequency_rate,
          MAX(CASE WHEN a.is_present THEN mt.meeting_date END) as last_attendance_date
        FROM members m
        LEFT JOIN attendance a ON a.member_id = m.id
        LEFT JOIN meetings mt ON mt.id = a.meeting_id
        WHERE m.group_id = $1
          AND m.is_active = TRUE
          AND mt.is_cancelled = FALSE
          AND mt.meeting_date >= $2
          AND mt.meeting_date <= CURRENT_DATE
          ${memberFilter === 'participants' ? "AND m.member_type = 'participant'" : ''}
          ${memberFilter === 'visitors' ? "AND m.member_type = 'visitor'" : ''}
        GROUP BY m.id, m.created_at
      )
      SELECT 
        id,
        total_meetings,
        attended,
        frequency_rate,
        last_attendance_date,
        CASE 
          WHEN last_attendance_date IS NULL THEN NULL
          ELSE CURRENT_DATE - last_attendance_date
        END as days_since_last,
        to_char(created_at, 'YYYY-MM-DD') as created_at
      FROM member_stats
    `;

    const [consecutiveResults, frequencyResults] = await Promise.all([
      queryMany<{
        id: string;
        full_name: string;
        member_type: 'participant' | 'visitor';
        phone: string | null;
        consecutive_absences: number;
      }>(consecutiveAbsencesQuery, [leader.group_id]),
      queryMany<{
        id: string;
        total_meetings: number;
        attended: number;
        frequency_rate: number | null;
        last_attendance_date: string | null;
        days_since_last: number | null;
        created_at: string;
      }>(frequencyQuery, [leader.group_id, startDateStr]),
    ]);

    const result = computeAtRiskMembers({
      consecutiveRows: consecutiveResults,
      frequencyRows: frequencyResults,
      riskLevelFilter: riskLevelFilter as 'all' | 'medium' | 'high' | 'critical',
      windowStartIso: startDateStr,
    });

    return NextResponse.json({
      members: result.members,
      summary: result.summary,
      benchmark: {
        threshold: 0.15, // 15% do total é o limite saudável
        period_days: periodDays,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar membros em risco:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
