import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader, getMemberById, getMemberByIdAndGroup, updateMember } from '@/lib/db/queries';
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
      if (presences >= 4) {
        calculatedStage = 'integrando';
      } else if (presences >= 2) {
        calculatedStage = 'retornou';
      } else {
        calculatedStage = 'novo_visitante';
      }
      
      updateData.integration_stage = calculatedStage;
      updateData.marked_not_returned = false; // Resetar marcação de "não retornou"
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
 * Remove um membro (soft delete). Apenas líder e coordenador podem excluir.
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
    const success = await updateMember(id, { is_active: false });

    if (!success) {
      return NextResponse.json(
        { error: 'Membro não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover membro:', error);
    return NextResponse.json(
      { error: 'Erro ao remover membro' },
      { status: 500 }
    );
  }
}
