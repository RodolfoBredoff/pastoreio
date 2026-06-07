import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader, getMemberById, getMemberByIdAndGroup, updateMember, deleteMember } from '@/lib/db/queries';
import { canDeleteMembers, canManageDiscipleship, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { queryOne } from '@/lib/db/postgres';

/**
 * PUT /api/members/[id]
 * Atualiza um membro existente
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json(
        { error: 'Líder não está vinculado a um grupo' },
        { status: 400 }
      );
    }

    const { id } = await params;
    const data = await request.json();
    const { full_name, phone, birth_date, member_type, is_active, discipulador_id, integration_stage } = data;

    // Buscar membro atual para verificar se o tipo está mudando
    const currentMember = await getMemberById(id);
    if (!currentMember) {
      return NextResponse.json(
        { error: 'Membro não encontrado' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (phone !== undefined) updateData.phone = phone;
    if (birth_date !== undefined) updateData.birth_date = birth_date || null;
    if (member_type !== undefined) updateData.member_type = member_type;
    if (is_active !== undefined) updateData.is_active = is_active;

    // Se está mudando para 'visitor', calcular o integration_stage automaticamente
    if (member_type === 'visitor' && currentMember.member_type !== 'visitor') {
      // Contar quantas presenças o membro tem
      const presencesResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text as count 
         FROM attendance a
         JOIN meetings m ON m.id = a.meeting_id
         WHERE a.member_id = $1 
           AND a.is_present = TRUE 
           AND m.group_id = $2`,
        [id, leader.group_id]
      );
      
      const presences = parseInt(presencesResult?.count || '0', 10);
      
      // Calcular estágio baseado nas presenças
      let calculatedStage: string;
      let shouldMarkNotReturned = false;
      
      if (presences >= 4) {
        calculatedStage = 'integrando';
      } else if (presences >= 2) {
        calculatedStage = 'retornou';
      } else {
        calculatedStage = 'novo_visitante';
        
        // Se tem exatamente 1 presença, verificar se já passaram 3+ encontros
        if (presences === 1) {
          const meetingsAfterResult = await queryOne<{ count: string }>(
            `SELECT COUNT(*)::text as count 
             FROM meetings mt
             WHERE mt.group_id = $1 
               AND mt.is_cancelled = FALSE
               AND mt.meeting_date > (
                 SELECT MAX(mt2.meeting_date)
                 FROM attendance a2
                 JOIN meetings mt2 ON mt2.id = a2.meeting_id
                 WHERE a2.member_id = $2 
                   AND a2.is_present = TRUE
                   AND mt2.group_id = $1
               )`,
            [leader.group_id, id]
          );
          
          const meetingsAfter = parseInt(meetingsAfterResult?.count || '0', 10);
          
          // Se já passaram 3+ encontros sem ele aparecer, marcar como "não retornou"
          if (meetingsAfter >= 3) {
            shouldMarkNotReturned = true;
          }
        }
      }
      
      updateData.integration_stage = calculatedStage;
      updateData.marked_not_returned = shouldMarkNotReturned;
    }

    if (integration_stage !== undefined) {
      const validStages = ['novo_visitante', 'retornou', 'integrando', 'membro'];
      if (!validStages.includes(integration_stage)) {
        return NextResponse.json(
          { error: 'Estágio de integração inválido' },
          { status: 400 }
        );
      }
      updateData.integration_stage = integration_stage;
    }

    if (data.marked_not_returned !== undefined) {
      updateData.marked_not_returned = data.marked_not_returned;
    }

    if (discipulador_id !== undefined) {
      if (!canManageDiscipleship(leader.role)) {
        return NextResponse.json(
          { error: SECRETARY_FORBIDDEN_MESSAGE },
          { status: 403 }
        );
      }
      if (discipulador_id !== null && discipulador_id !== '') {
        if (discipulador_id === id) {
          return NextResponse.json(
            { error: 'O discipulador não pode ser a própria pessoa' },
            { status: 400 }
          );
        }
        const discipuladorMember = await getMemberByIdAndGroup(discipulador_id, leader.group_id);
        if (!discipuladorMember) {
          return NextResponse.json(
            { error: 'Discipulador não encontrado ou não pertence ao grupo' },
            { status: 400 }
          );
        }
        if (discipuladorMember.discipulador_id === id) {
          return NextResponse.json(
            { error: 'Não é possível criar ciclo de discipulado (A discipulado por B e B por A)' },
            { status: 400 }
          );
        }
      }
      updateData.discipulador_id = discipulador_id === null || discipulador_id === '' ? null : discipulador_id;
    }

    const member = await updateMember(id, updateData);

    if (!member) {
      return NextResponse.json(
        { error: 'Membro não encontrado' },
        { status: 404 }
      );
    }

    const fullMember = await getMemberById(id);
    return NextResponse.json(fullMember ?? member);
  } catch (error) {
    console.error('Erro ao atualizar membro:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar membro' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/members/[id]
 * Remove um membro da lista de Pessoas.
 * - Ativo: marca como inativo (permanece visível na lista).
 * - Inativo: remove da lista preservando histórico.
 * Apenas líder e coordenador podem excluir.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json(
        { error: 'Líder não está vinculado a um grupo' },
        { status: 400 }
      );
    }

    if (!canDeleteMembers(leader.role)) {
      return NextResponse.json(
        { error: SECRETARY_FORBIDDEN_MESSAGE },
        { status: 403 }
      );
    }

    const { id } = await params;
    const result = await deleteMember(id);

    if (!result) {
      return NextResponse.json(
        { error: 'Membro não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      action: result,
      message:
        result === 'excluded'
          ? 'Pessoa removida da lista de Pessoas. O histórico foi preservado.'
          : 'Pessoa marcada como inativa. Ela permanece na lista de Pessoas.',
    });
  } catch (error) {
    console.error('Erro ao remover membro:', error);
    return NextResponse.json(
      { error: 'Erro ao remover membro' },
      { status: 500 }
    );
  }
}
