import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader, getMemberByIdAndGroup } from '@/lib/db/queries';
import { query, queryOne } from '@/lib/db/postgres';

/**
 * POST /api/members/[id]/status
 * Body: { active: boolean }
 * Alterna o status ativo/inativo de um membro.
 * Quando inativado, adiciona tag Status=Inativo automaticamente.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json(
        { error: 'Líder não vinculado a um grupo' },
        { status: 400 }
      );
    }

    const { id: memberId } = await params;
    const body = await request.json();
    const active = body.active === true;

    const member = await getMemberByIdAndGroup(memberId, leader.group_id);
    if (!member) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    // Atualizar status is_active
    await query(
      `UPDATE members SET is_active = $1, updated_at = NOW() WHERE id = $2`,
      [active, memberId]
    );

    // Adicionar/atualizar tag de Status
    const statusValue = active ? 'Ativo' : 'Inativo';
    
    // Remove tags de Status existentes
    await query(
      `DELETE FROM member_tags WHERE member_id = $1 AND tag_key = 'Status'`,
      [memberId]
    );
    
    // Adiciona nova tag de Status
    await query(
      `INSERT INTO member_tags (member_id, tag_key, tag_value, updated_at)
       VALUES ($1, 'Status', $2, NOW())`,
      [memberId, statusValue]
    );

    // Buscar membro atualizado
    const updatedMember = await getMemberByIdAndGroup(memberId, leader.group_id);

    return NextResponse.json({
      success: true,
      member: updatedMember,
      message: active
        ? 'Membro reativado com sucesso'
        : 'Membro marcado como inativo. Não aparecerá mais nas chamadas, mas o histórico foi preservado.',
    });
  } catch (error) {
    console.error('Erro ao alternar status do membro:', error);
    return NextResponse.json(
      { error: 'Erro ao alternar status' },
      { status: 500 }
    );
  }
}
