import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader, getGuestVisitorById } from '@/lib/db/queries';
import { query } from '@/lib/db/postgres';

/**
 * POST /api/guests/[id]/convert
 * Converte um visitante não cadastrado em membro (tipo visitor).
 */
export async function POST(
  _request: Request,
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

    const { id: guestId } = await params;
    const guest = await getGuestVisitorById(guestId);
    if (!guest) {
      return NextResponse.json({ error: 'Visitante não encontrado' }, { status: 404 });
    }
    if (guest.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Visitante de outro grupo' }, { status: 403 });
    }

    // Verificar quantas vezes o guest apareceu
    const appearancesResult = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT meeting_id)::text as count 
       FROM attendance_guests 
       WHERE guest_id = $1`,
      [guestId]
    );
    const appearances = parseInt(appearancesResult.rows[0]?.count || '0', 10);
    
    // Se apareceu 2+ vezes, marcar como "retornou", senão "novo_visitante"
    const integrationStage = appearances >= 2 ? 'retornou' : 'novo_visitante';

    const result = await query(
      `INSERT INTO members (group_id, full_name, phone, birth_date, member_type, integration_stage)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        guest.group_id,
        guest.full_name,
        guest.phone ?? '',
        null,
        'visitor',
        integrationStage,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Erro ao converter visitante em membro:', error);
    return NextResponse.json(
      { error: 'Erro ao converter em membro' },
      { status: 500 }
    );
  }
}
