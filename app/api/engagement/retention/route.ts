import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, queryOne } from '@/lib/db/postgres';

export interface RetentionMetric {
  period: '3_months' | '6_months' | '12_months';
  label: string;
  cohort_start_date: string;
  cohort_end_date: string;
  total_members: number;
  retained_members: number;
  retention_rate: number;
  churned_members: number;
  churn_rate: number;
  benchmark: number; // % esperado baseado em benchmarks de mercado
  health_status: 'excellent' | 'good' | 'warning' | 'critical';
}

export interface RetentionAnalysis {
  metrics: RetentionMetric[];
  overall_trend: 'improving' | 'stable' | 'declining';
  avg_retention_rate: number;
}

/**
 * GET /api/engagement/retention
 * 
 * Retorna métricas de retenção de membros em diferentes períodos
 * (3, 6 e 12 meses)
 * 
 * Retenção = % de membros que entraram há X meses e ainda estão ativos
 * 
 * Query params:
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
    const memberFilter = searchParams.get('member_filter') || 'total';

    // Períodos para análise
    const periods: Array<{
      key: '3_months' | '6_months' | '12_months';
      label: string;
      months: number;
      benchmark: number;
    }> = [
      { key: '3_months', label: '3 Meses', months: 3, benchmark: 80 }, // 80% é saudável
      { key: '6_months', label: '6 Meses', months: 6, benchmark: 70 }, // 70% é saudável
      { key: '12_months', label: '12 Meses', months: 12, benchmark: 60 }, // 60% é saudável
    ];

    const metrics: RetentionMetric[] = [];

    for (const period of periods) {
      const cohortStartDate = new Date();
      cohortStartDate.setMonth(cohortStartDate.getMonth() - period.months - 1);
      const cohortEndDate = new Date();
      cohortEndDate.setMonth(cohortEndDate.getMonth() - period.months);

      const cohortStartStr = cohortStartDate.toISOString().split('T')[0];
      const cohortEndStr = cohortEndDate.toISOString().split('T')[0];

      // Membros que entraram no período do cohort
      const cohortMembersQuery = `
        SELECT 
          m.id,
          m.full_name,
          m.member_type,
          m.is_active,
          m.created_at,
          COUNT(DISTINCT CASE 
            WHEN a.is_present 
              AND mt.meeting_date >= CURRENT_DATE - INTERVAL '30 days'
            THEN mt.id 
          END) as recent_attendance
        FROM members m
        LEFT JOIN attendance a ON a.member_id = m.id
        LEFT JOIN meetings mt ON mt.id = a.meeting_id AND mt.is_cancelled = FALSE
        WHERE m.group_id = $1
          AND m.created_at >= $2
          AND m.created_at < $3
          ${memberFilter === 'participants' ? "AND m.member_type = 'participant'" : ''}
          ${memberFilter === 'visitors' ? "AND m.member_type = 'visitor'" : ''}
        GROUP BY m.id, m.full_name, m.member_type, m.is_active, m.created_at
      `;

      const cohortMembers = await queryMany<{
        id: string;
        full_name: string;
        member_type: string;
        is_active: boolean;
        created_at: string;
        recent_attendance: number;
      }>(cohortMembersQuery, [leader.group_id, cohortStartStr, cohortEndStr]);

      const totalMembers = cohortMembers.length;
      
      // Considerar retido se:
      // 1. Ainda está ativo (is_active = true)
      // 2. OU teve pelo menos 1 presença nos últimos 30 dias
      const retainedMembers = cohortMembers.filter(
        (m) => m.is_active && m.recent_attendance > 0
      );

      const retainedCount = retainedMembers.length;
      const churnedCount = totalMembers - retainedCount;
      const retentionRate = totalMembers > 0 ? Math.round((100 * retainedCount) / totalMembers) : 0;
      const churnRate = totalMembers > 0 ? Math.round((100 * churnedCount) / totalMembers) : 0;

      // Determinar health status
      let healthStatus: 'excellent' | 'good' | 'warning' | 'critical';
      if (retentionRate >= period.benchmark) {
        healthStatus = 'excellent';
      } else if (retentionRate >= period.benchmark - 10) {
        healthStatus = 'good';
      } else if (retentionRate >= period.benchmark - 20) {
        healthStatus = 'warning';
      } else {
        healthStatus = 'critical';
      }

      metrics.push({
        period: period.key,
        label: period.label,
        cohort_start_date: cohortStartStr,
        cohort_end_date: cohortEndStr,
        total_members: totalMembers,
        retained_members: retainedCount,
        retention_rate: retentionRate,
        churned_members: churnedCount,
        churn_rate: churnRate,
        benchmark: period.benchmark,
        health_status: healthStatus,
      });
    }

    // Calcular tendência geral
    let overallTrend: 'improving' | 'stable' | 'declining';
    if (metrics.length >= 2) {
      const rates = metrics.map((m) => m.retention_rate);
      const first = rates[0];
      const last = rates[rates.length - 1];
      const diff = last - first;

      if (diff > 5) {
        overallTrend = 'improving';
      } else if (diff < -5) {
        overallTrend = 'declining';
      } else {
        overallTrend = 'stable';
      }
    } else {
      overallTrend = 'stable';
    }

    const avgRetentionRate =
      metrics.length > 0
        ? Math.round(metrics.reduce((sum, m) => sum + m.retention_rate, 0) / metrics.length)
        : 0;

    const analysis: RetentionAnalysis = {
      metrics,
      overall_trend: overallTrend,
      avg_retention_rate: avgRetentionRate,
    };

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Erro ao calcular retenção:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
