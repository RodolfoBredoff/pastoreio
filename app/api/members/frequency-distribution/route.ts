import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, queryOne } from '@/lib/db/postgres';

export interface FrequencySegment {
  segment: 'highly_engaged' | 'engaged' | 'occasional' | 'at_risk';
  label: string;
  count: number;
  percentage: number;
  benchmark: number;
  color: string;
  description: string;
  memberIds: string[];
}

export interface FrequencyDistribution {
  segments: FrequencySegment[];
  total_members: number;
  avg_frequency: number;
  median_frequency: number;
  period_days: number;
}

/**
 * GET /api/members/frequency-distribution
 * 
 * Retorna distribuição de frequência de presença dos membros
 * segmentada em: altamente engajados (>80%), engajados (60-80%),
 * ocasionais (40-60%), em risco (<40%)
 * 
 * Query params:
 * - period: '30' | '60' | '90' (dias)
 * - member_filter: 'total' | 'participants' | 'visitors'
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

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Calcular frequência por membro
    const query = `
      WITH member_frequency AS (
        SELECT 
          m.id,
          m.full_name,
          m.member_type,
          COUNT(DISTINCT mt.id) as total_meetings,
          COUNT(DISTINCT CASE WHEN a.is_present THEN mt.id END) as attended,
          ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.is_present THEN mt.id END) / 
            NULLIF(COUNT(DISTINCT mt.id), 0), 1) as frequency_rate
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
        GROUP BY m.id, m.full_name, m.member_type
        HAVING COUNT(DISTINCT mt.id) > 0
      ),
      segmented AS (
        SELECT 
          id,
          full_name,
          frequency_rate,
          CASE 
            WHEN frequency_rate >= 80 THEN 'highly_engaged'
            WHEN frequency_rate >= 60 THEN 'engaged'
            WHEN frequency_rate >= 40 THEN 'occasional'
            ELSE 'at_risk'
          END as segment
        FROM member_frequency
      )
      SELECT 
        segment,
        COUNT(*)::int as count,
        ARRAY_AGG(id) as member_ids,
        AVG(frequency_rate) as avg_freq
      FROM segmented
      GROUP BY segment
    `;

    const results = await queryMany<{
      segment: 'highly_engaged' | 'engaged' | 'occasional' | 'at_risk';
      count: number;
      member_ids: string[];
      avg_freq: number;
    }>(query, [leader.group_id, startDateStr]);

    // Calcular total de membros
    const totalResult = await queryOne<{ total: number }>(
      `SELECT COUNT(DISTINCT m.id)::int as total
       FROM members m
       JOIN attendance a ON a.member_id = m.id
       JOIN meetings mt ON mt.id = a.meeting_id
       WHERE m.group_id = $1
         AND m.is_active = TRUE
         AND mt.is_cancelled = FALSE
         AND mt.meeting_date >= $2
         AND mt.meeting_date <= CURRENT_DATE
         ${memberFilter === 'participants' ? "AND m.member_type = 'participant'" : ''}
         ${memberFilter === 'visitors' ? "AND m.member_type = 'visitor'" : ''}`,
      [leader.group_id, startDateStr]
    );

    const totalMembers = totalResult?.total || 0;

    // Calcular média e mediana
    const statsResult = await queryOne<{ avg_freq: number; median_freq: number }>(
      `WITH member_frequency AS (
        SELECT 
          ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.is_present THEN mt.id END) / 
            NULLIF(COUNT(DISTINCT mt.id), 0), 1) as frequency_rate
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
        HAVING COUNT(DISTINCT mt.id) > 0
      )
      SELECT 
        ROUND(AVG(frequency_rate), 1) as avg_freq,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY frequency_rate), 1) as median_freq
      FROM member_frequency`,
      [leader.group_id, startDateStr]
    );

    // Mapear resultados para segmentos
    const segmentMap = new Map(results.map((r) => [r.segment, r]));

    const segmentDefinitions: Array<{
      segment: 'highly_engaged' | 'engaged' | 'occasional' | 'at_risk';
      label: string;
      benchmark: number;
      color: string;
      description: string;
    }> = [
      {
        segment: 'highly_engaged',
        label: 'Altamente Engajados',
        benchmark: 30, // 30% do grupo deveria estar aqui
        color: '#10b981', // green-500
        description: 'Frequência ≥ 80%',
      },
      {
        segment: 'engaged',
        label: 'Engajados',
        benchmark: 40, // 40% do grupo
        color: '#3b82f6', // blue-500
        description: 'Frequência 60-79%',
      },
      {
        segment: 'occasional',
        label: 'Ocasionais',
        benchmark: 20, // 20% do grupo
        color: '#f59e0b', // amber-500
        description: 'Frequência 40-59%',
      },
      {
        segment: 'at_risk',
        label: 'Em Risco',
        benchmark: 10, // <10% do grupo (ideal)
        color: '#ef4444', // red-500
        description: 'Frequência < 40%',
      },
    ];

    const segments: FrequencySegment[] = segmentDefinitions.map((def) => {
      const data = segmentMap.get(def.segment);
      return {
        ...def,
        count: data?.count || 0,
        percentage: totalMembers > 0 ? Math.round((100 * (data?.count || 0)) / totalMembers) : 0,
        memberIds: data?.member_ids || [],
      };
    });

    const distribution: FrequencyDistribution = {
      segments,
      total_members: totalMembers,
      avg_frequency: statsResult?.avg_freq || 0,
      median_frequency: statsResult?.median_freq || 0,
      period_days: periodDays,
    };

    return NextResponse.json(distribution);
  } catch (error) {
    console.error('Erro ao calcular distribuição de frequência:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
