import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';

interface MemberByStage {
  id: string;
  full_name: string;
  phone: string;
  integration_stage: string;
  marked_not_returned: boolean;
  created_at: string;
}

/**
 * GET /api/integration-stages/members?stage=retornou&period=all
 * Retorna lista de membros em um estágio específico
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
    const stage = searchParams.get('stage');
    const period = searchParams.get('period') || 'all';
    const includeNotReturned = searchParams.get('include_not_returned') === 'true';

    if (!stage) {
      return NextResponse.json(
        { error: 'stage é obrigatório' },
        { status: 400 }
      );
    }

    // Se o stage for "nao_retornou", buscar visitantes marcados como não retornou
    if (stage === 'nao_retornou') {
      const members = await queryMany<MemberByStage>(
        `SELECT id, full_name, phone, integration_stage, marked_not_returned, created_at::text
         FROM members
         WHERE group_id = $1
           AND member_type = 'visitor'
           AND is_active = TRUE
           AND marked_not_returned = TRUE
         ORDER BY full_name ASC`,
        [leader.group_id]
      );

      return NextResponse.json({ members, stage: 'nao_retornou' });
    }

    // Se o stage for "nao_participou_ano", buscar todos sem presença no ano vigente
    if (stage === 'nao_participou_ano') {
      const currentYear = new Date().getFullYear();
      const members = await queryMany<MemberByStage>(
        `SELECT m.id, m.full_name, m.phone, m.integration_stage, m.marked_not_returned, m.created_at::text
         FROM members m
         WHERE m.group_id = $1
           AND m.is_active = TRUE
           AND NOT EXISTS (
             SELECT 1
             FROM attendance a
             JOIN meetings mt ON mt.id = a.meeting_id
             WHERE a.member_id = m.id
               AND a.is_present = TRUE
               AND mt.group_id = $1
               AND mt.is_cancelled = FALSE
               AND EXTRACT(YEAR FROM mt.meeting_date) = $2
           )
         ORDER BY m.full_name ASC`,
        [leader.group_id, currentYear]
      );

      return NextResponse.json({ members, stage: 'nao_participou_ano' });
    }

    // Validar estágio
    const validStages = ['novo_visitante', 'retornou', 'integrando', 'membro'];
    if (!validStages.includes(stage)) {
      return NextResponse.json(
        { error: 'Estágio inválido' },
        { status: 400 }
      );
    }

    // Construir condição de data baseada no período
    let dateCondition = '';
    if (period !== 'all') {
      const days = parseInt(period, 10);
      if (!isNaN(days) && days > 0) {
        dateCondition = `AND m.created_at >= NOW() - INTERVAL '${days} days'`;
      }
    }

    // Buscar membros no estágio específico
    const members = await queryMany<MemberByStage>(
      `SELECT m.id, m.full_name, m.phone, m.integration_stage, m.marked_not_returned, m.created_at::text
       FROM members m
       WHERE m.group_id = $1
         AND m.member_type = 'visitor'
         AND m.is_active = TRUE
         AND m.integration_stage = $2
         ${dateCondition}
       ORDER BY m.full_name ASC`,
      [leader.group_id, stage]
    );

    return NextResponse.json({ members, stage });
  } catch (error) {
    console.error('Erro ao buscar membros por estágio:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar membros' },
      { status: 500 }
    );
  }
}
