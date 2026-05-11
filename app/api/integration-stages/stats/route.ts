import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';

interface StageStatsRow {
  stage: string;
  count: string;
  marked_not_returned_count: string;
}

interface FunnelMetrics {
  novo_visitante: number;
  retornou: number;
  integrando: number;
  membro: number;
  nao_retornou: number;
  taxa_retorno: number;
  taxa_integracao: number;
  taxa_conversao_membro: number;
}

function calculateFunnelMetrics(stats: StageStatsRow[]): FunnelMetrics {
  const counts = {
    novo_visitante: 0,
    retornou: 0,
    integrando: 0,
    membro: 0,
    nao_retornou: 0,
  };

  stats.forEach((row) => {
    const count = parseInt(row.count, 10) || 0;
    const notReturned = parseInt(row.marked_not_returned_count, 10) || 0;

    if (row.stage in counts) {
      counts[row.stage as keyof typeof counts] = count;
    }
    if (row.stage === 'novo_visitante') {
      counts.nao_retornou = notReturned;
    }
  });

  const total = counts.novo_visitante + counts.retornou + counts.integrando + counts.membro;
  
  return {
    ...counts,
    taxa_retorno: counts.novo_visitante > 0 ? (counts.retornou / counts.novo_visitante) * 100 : 0,
    taxa_integracao: counts.novo_visitante > 0 ? (counts.integrando / counts.novo_visitante) * 100 : 0,
    taxa_conversao_membro: total > 0 ? (counts.membro / total) * 100 : 0,
  };
}

/**
 * GET /api/integration-stages/stats
 * Retorna estatísticas dos estágios de integração de visitantes
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json(
        { error: 'Líder não está vinculado a um grupo' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'all'; // all, 30, 60, 90 days

    // Construir condição de data baseada no período
    let dateCondition = '';
    if (period !== 'all') {
      const days = parseInt(period, 10);
      if (!isNaN(days) && days > 0) {
        dateCondition = `AND m.created_at >= NOW() - INTERVAL '${days} days'`;
      }
    }

    // Query para contar por estágio
    const stageStats = await queryMany<StageStatsRow>(
      `SELECT 
        integration_stage as stage,
        COUNT(*) as count,
        SUM(CASE WHEN marked_not_returned THEN 1 ELSE 0 END) as marked_not_returned_count
       FROM members m
       WHERE group_id = $1 
         AND member_type = 'visitor' 
         AND is_active = TRUE
         ${dateCondition}
       GROUP BY integration_stage
       ORDER BY 
         CASE integration_stage
           WHEN 'novo_visitante' THEN 1
           WHEN 'retornou' THEN 2
           WHEN 'integrando' THEN 3
           WHEN 'membro' THEN 4
           ELSE 5
         END`,
      [leader.group_id]
    );

    // Calcular métricas do funil
    const funnel = calculateFunnelMetrics(stageStats);

    // Converter para números para o response
    const stageStatsFormatted = stageStats.map((row) => ({
      stage: row.stage,
      count: parseInt(row.count, 10),
      marked_not_returned_count: parseInt(row.marked_not_returned_count, 10),
    }));

    const totalVisitors = stageStatsFormatted.reduce((sum, s) => sum + s.count, 0);

    return NextResponse.json({
      stageStats: stageStatsFormatted,
      funnel,
      totalVisitors,
      period,
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas de estágios:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar estatísticas' },
      { status: 500 }
    );
  }
}
