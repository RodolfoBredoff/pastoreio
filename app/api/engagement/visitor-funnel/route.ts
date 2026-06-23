import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, queryOne } from '@/lib/db/postgres';

export interface VisitorFunnelStage {
  stage: 'visit_1' | 'visit_2' | 'visit_3' | 'visit_4' | 'converted';
  label: string;
  count: number;
  percentage: number; // % do stage anterior
  dropoff: number; // % que não passou para próximo stage
  memberIds: string[];
  benchmark: number; // % esperado baseado em benchmarks
}

export interface VisitorFunnel {
  stages: VisitorFunnelStage[];
  total_visitors: number;
  conversion_rate: number; // % que chegou a converted
  avg_visits_to_conversion: number;
  period_days: number;
}

/**
 * GET /api/engagement/visitor-funnel
 * 
 * Retorna funil de conversão de visitantes:
 * 1ª visita → 2ª visita → 3ª visita → 4ª visita → Conversão (virou participante)
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
    startDate.setDate(startDate.getDate() - periodDays);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Buscar visitantes e contar suas visitas
    const visitorVisitsQuery = `
      WITH visitor_visits AS (
        SELECT 
          m.id,
          m.full_name,
          m.member_type,
          m.created_at,
          COUNT(DISTINCT CASE WHEN a.is_present THEN mt.id END) as visit_count,
          MIN(CASE WHEN a.is_present THEN mt.meeting_date END) as first_visit_date,
          MAX(CASE WHEN a.is_present THEN mt.meeting_date END) as last_visit_date
        FROM members m
        LEFT JOIN attendance a ON a.member_id = m.id
        LEFT JOIN meetings mt ON mt.id = a.meeting_id
        WHERE m.group_id = $1
          AND m.member_type IN ('visitor', 'participant')
          AND m.created_at >= $2
          AND (mt.is_cancelled = FALSE OR mt.id IS NULL)
        GROUP BY m.id, m.full_name, m.member_type, m.created_at
      ),
      classified_visitors AS (
        SELECT 
          id,
          full_name,
          member_type,
          visit_count,
          first_visit_date,
          last_visit_date,
          CASE 
            WHEN member_type = 'participant' AND visit_count >= 4 THEN 'converted'
            WHEN visit_count >= 4 THEN 'visit_4'
            WHEN visit_count = 3 THEN 'visit_3'
            WHEN visit_count = 2 THEN 'visit_2'
            WHEN visit_count = 1 THEN 'visit_1'
            ELSE 'visit_0'
          END as stage
        FROM visitor_visits
        WHERE first_visit_date IS NOT NULL
      )
      SELECT 
        stage,
        COUNT(*)::int as count,
        ARRAY_AGG(id) as member_ids
      FROM classified_visitors
      WHERE stage != 'visit_0'
      GROUP BY stage
    `;

    const results = await queryMany<{
      stage: string;
      count: number;
      member_ids: string[];
    }>(visitorVisitsQuery, [leader.group_id, startDateStr]);

    // Calcular estatísticas de conversão
    const conversionStatsQuery = `
      WITH visitor_visits AS (
        SELECT 
          m.id,
          m.member_type,
          COUNT(DISTINCT CASE WHEN a.is_present THEN mt.id END) as visit_count
        FROM members m
        LEFT JOIN attendance a ON a.member_id = m.id
        LEFT JOIN meetings mt ON mt.id = a.meeting_id
        WHERE m.group_id = $1
          AND m.created_at >= $2
          AND (mt.is_cancelled = FALSE OR mt.id IS NULL)
        GROUP BY m.id, m.member_type
        HAVING COUNT(DISTINCT CASE WHEN a.is_present THEN mt.id END) > 0
      )
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE member_type = 'participant' AND visit_count >= 4)::int as converted,
        ROUND(AVG(CASE WHEN member_type = 'participant' AND visit_count >= 4 THEN visit_count END), 1) as avg_visits
      FROM visitor_visits
    `;

    const stats = await queryOne<{
      total: number;
      converted: number;
      avg_visits: number;
    }>(conversionStatsQuery, [leader.group_id, startDateStr]);

    // Mapear resultados
    const stageMap = new Map(results.map((r) => [r.stage, r]));

    const visit1Data = stageMap.get('visit_1');
    const visit2Data = stageMap.get('visit_2');
    const visit3Data = stageMap.get('visit_3');
    const visit4Data = stageMap.get('visit_4');
    const convertedData = stageMap.get('converted');

    const visit1Count = (visit1Data?.count || 0) + 
                        (visit2Data?.count || 0) + 
                        (visit3Data?.count || 0) + 
                        (visit4Data?.count || 0) + 
                        (convertedData?.count || 0);
    
    const visit2Count = (visit2Data?.count || 0) + 
                        (visit3Data?.count || 0) + 
                        (visit4Data?.count || 0) + 
                        (convertedData?.count || 0);
    
    const visit3Count = (visit3Data?.count || 0) + 
                        (visit4Data?.count || 0) + 
                        (convertedData?.count || 0);
    
    const visit4Count = (visit4Data?.count || 0) + 
                        (convertedData?.count || 0);
    
    const convertedCount = convertedData?.count || 0;

    const stages: VisitorFunnelStage[] = [
      {
        stage: 'visit_1',
        label: '1ª Visita',
        count: visit1Count,
        percentage: 100,
        dropoff: visit2Count > 0 ? Math.round((100 * (visit1Count - visit2Count)) / visit1Count) : 0,
        memberIds: [
          ...(visit1Data?.member_ids || []),
          ...(visit2Data?.member_ids || []),
          ...(visit3Data?.member_ids || []),
          ...(visit4Data?.member_ids || []),
          ...(convertedData?.member_ids || []),
        ],
        benchmark: 100, // Base
      },
      {
        stage: 'visit_2',
        label: '2ª Visita',
        count: visit2Count,
        percentage: visit1Count > 0 ? Math.round((100 * visit2Count) / visit1Count) : 0,
        dropoff: visit3Count > 0 ? Math.round((100 * (visit2Count - visit3Count)) / visit2Count) : 0,
        memberIds: [
          ...(visit2Data?.member_ids || []),
          ...(visit3Data?.member_ids || []),
          ...(visit4Data?.member_ids || []),
          ...(convertedData?.member_ids || []),
        ],
        benchmark: 40, // 40% dos visitantes devem retornar (benchmark de mercado)
      },
      {
        stage: 'visit_3',
        label: '3ª Visita',
        count: visit3Count,
        percentage: visit2Count > 0 ? Math.round((100 * visit3Count) / visit2Count) : 0,
        dropoff: visit4Count > 0 ? Math.round((100 * (visit3Count - visit4Count)) / visit3Count) : 0,
        memberIds: [
          ...(visit3Data?.member_ids || []),
          ...(visit4Data?.member_ids || []),
          ...(convertedData?.member_ids || []),
        ],
        benchmark: 60, // 60% dos que voltaram 2x devem voltar 3x
      },
      {
        stage: 'visit_4',
        label: '4ª Visita',
        count: visit4Count,
        percentage: visit3Count > 0 ? Math.round((100 * visit4Count) / visit3Count) : 0,
        dropoff: convertedCount > 0 ? Math.round((100 * (visit4Count - convertedCount)) / visit4Count) : 0,
        memberIds: [
          ...(visit4Data?.member_ids || []),
          ...(convertedData?.member_ids || []),
        ],
        benchmark: 70, // 70% dos que voltaram 3x devem voltar 4x
      },
      {
        stage: 'converted',
        label: 'Convertidos',
        count: convertedCount,
        percentage: visit4Count > 0 ? Math.round((100 * convertedCount) / visit4Count) : 0,
        dropoff: 0,
        memberIds: convertedData?.member_ids || [],
        benchmark: 20, // 20% do total inicial deve converter (benchmark de mercado)
      },
    ];

    const funnel: VisitorFunnel = {
      stages,
      total_visitors: visit1Count,
      conversion_rate: visit1Count > 0 ? Math.round((100 * convertedCount) / visit1Count) : 0,
      avg_visits_to_conversion: stats?.avg_visits || 0,
      period_days: periodDays,
    };

    return NextResponse.json(funnel);
  } catch (error) {
    console.error('Erro ao calcular funil de visitantes:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
