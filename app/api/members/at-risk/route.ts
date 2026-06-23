import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';

export interface MemberAtRisk {
  id: string;
  full_name: string;
  member_type: 'participant' | 'visitor';
  phone: string | null;
  consecutive_absences: number;
  frequency_rate: number;
  total_meetings: number;
  attended: number;
  last_attendance_date: string | null;
  days_since_last: number | null;
  risk_level: 'medium' | 'high' | 'critical';
  risk_factors: string[];
}

/**
 * GET /api/members/at-risk
 * 
 * Retorna membros em risco de desengajamento baseado em:
 * - Ausências consecutivas (2+)
 * - Frequência de presença baixa (<60%)
 * - Tempo desde última presença (>30 dias)
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
        GROUP BY m.id
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
        END as days_since_last
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
        frequency_rate: number;
        last_attendance_date: string | null;
        days_since_last: number | null;
      }>(frequencyQuery, [leader.group_id, startDateStr]),
    ]);

    // Combinar dados e calcular nível de risco
    const memberMap = new Map(
      consecutiveResults.map((m) => [m.id, m])
    );

    const frequencyMap = new Map(
      frequencyResults.map((f) => [f.id, f])
    );

    const atRiskMembers: MemberAtRisk[] = [];

    for (const member of consecutiveResults) {
      const freq = frequencyMap.get(member.id);
      if (!freq) continue;

      const riskFactors: string[] = [];
      let riskScore = 0;

      // Fator 1: Ausências consecutivas (peso: 40 pontos)
      if (member.consecutive_absences >= 4) {
        riskFactors.push(`${member.consecutive_absences} ausências consecutivas`);
        riskScore += 40;
      } else if (member.consecutive_absences >= 3) {
        riskFactors.push(`${member.consecutive_absences} ausências consecutivas`);
        riskScore += 30;
      } else if (member.consecutive_absences >= 2) {
        riskFactors.push(`${member.consecutive_absences} ausências consecutivas`);
        riskScore += 20;
      }

      // Fator 2: Frequência baixa (peso: 30 pontos)
      if (freq.frequency_rate < 40) {
        riskFactors.push(`Frequência ${freq.frequency_rate}% (crítica)`);
        riskScore += 30;
      } else if (freq.frequency_rate < 60) {
        riskFactors.push(`Frequência ${freq.frequency_rate}% (baixa)`);
        riskScore += 20;
      }

      // Fator 3: Tempo desde última presença (peso: 30 pontos)
      if (freq.days_since_last && freq.days_since_last > 60) {
        riskFactors.push(`${freq.days_since_last} dias sem presença`);
        riskScore += 30;
      } else if (freq.days_since_last && freq.days_since_last > 30) {
        riskFactors.push(`${freq.days_since_last} dias sem presença`);
        riskScore += 15;
      }

      // Determinar nível de risco
      let riskLevel: 'medium' | 'high' | 'critical';
      if (riskScore >= 70) {
        riskLevel = 'critical';
      } else if (riskScore >= 50) {
        riskLevel = 'high';
      } else if (riskScore >= 30) {
        riskLevel = 'medium';
      } else {
        continue; // Não está em risco significativo
      }

      // Aplicar filtro de nível de risco
      if (riskLevelFilter !== 'all' && riskLevel !== riskLevelFilter) {
        continue;
      }

      atRiskMembers.push({
        id: member.id,
        full_name: member.full_name,
        member_type: member.member_type,
        phone: member.phone,
        consecutive_absences: member.consecutive_absences,
        frequency_rate: freq.frequency_rate,
        total_meetings: freq.total_meetings,
        attended: freq.attended,
        last_attendance_date: freq.last_attendance_date,
        days_since_last: freq.days_since_last,
        risk_level: riskLevel,
        risk_factors: riskFactors,
      });
    }

    // Ordenar por nível de risco (critical > high > medium) e depois por score implícito
    const riskLevelOrder = { critical: 3, high: 2, medium: 1 };
    atRiskMembers.sort((a, b) => {
      const levelDiff = riskLevelOrder[b.risk_level] - riskLevelOrder[a.risk_level];
      if (levelDiff !== 0) return levelDiff;
      return b.consecutive_absences - a.consecutive_absences;
    });

    return NextResponse.json({
      members: atRiskMembers,
      summary: {
        total: atRiskMembers.length,
        critical: atRiskMembers.filter((m) => m.risk_level === 'critical').length,
        high: atRiskMembers.filter((m) => m.risk_level === 'high').length,
        medium: atRiskMembers.filter((m) => m.risk_level === 'medium').length,
      },
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
