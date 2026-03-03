import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader, updateMember } from '@/lib/db/queries';
import { canDeleteMembers, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';

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
    const { id } = await params;

    const data = await request.json();
    const { full_name, phone, birth_date, member_type, is_active } = data;

    const updateData: Record<string, unknown> = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (phone !== undefined) updateData.phone = phone;
    if (birth_date !== undefined && birth_date) updateData.birth_date = birth_date;
    if (member_type !== undefined) updateData.member_type = member_type;
    if (is_active !== undefined) updateData.is_active = is_active;

    const member = await updateMember(id, updateData);

    if (!member) {
      return NextResponse.json(
        { error: 'Membro não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(member);
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
