import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader, getGuestVisitorById } from '@/lib/db/queries';
import { query, transaction } from '@/lib/db/postgres';

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

    // Usar transação para garantir que tudo seja feito atomicamente
    const newMember = await transaction(async (client) => {
      // Criar o novo membro sempre como 'novo_visitante'
      // O sistema de estágios automático calculará o estágio correto após a conversão
      const result = await client.query<{ id: string; full_name: string }>(
        `INSERT INTO members (group_id, full_name, phone, birth_date, member_type, integration_stage)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          guest.group_id,
          guest.full_name,
          guest.phone ?? '',
          null,
          'visitor',
          'novo_visitante',
        ]
      );
      const newMember = result.rows[0];

      // Migrar todos os registros de presença do guest para o novo membro
      const guestAttendances = await client.query<{ meeting_id: string }>(
        `SELECT meeting_id FROM attendance_guests WHERE guest_id = $1`,
        [guestId]
      );
      
      // Criar registros de attendance (is_present=TRUE) para cada encontro
      for (const att of guestAttendances.rows) {
        await client.query(
          `INSERT INTO attendance (meeting_id, member_id, is_present)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (meeting_id, member_id) DO UPDATE SET is_present = TRUE`,
          [att.meeting_id, newMember.id]
        );
      }
      
      // Remover os registros antigos de guest
      await client.query(
        `DELETE FROM attendance_guests WHERE guest_id = $1`,
        [guestId]
      );
      await client.query(
        `DELETE FROM guest_visitors WHERE id = $1`,
        [guestId]
      );

      return newMember;
    });

    // Atualizar os estágios de integração para recalcular baseado nas presenças
    try {
      await query(
        `UPDATE members
         SET integration_stage = CASE
           WHEN (
             SELECT COUNT(*) FROM attendance a
             JOIN meetings m ON m.id = a.meeting_id
             WHERE a.member_id = members.id AND a.is_present = TRUE AND m.group_id = $1
           ) >= 4 THEN 'integrando'
           WHEN (
             SELECT COUNT(*) FROM attendance a
             JOIN meetings m ON m.id = a.meeting_id
             WHERE a.member_id = members.id AND a.is_present = TRUE AND m.group_id = $1
           ) >= 2 THEN 'retornou'
           ELSE 'novo_visitante'
         END
         WHERE id = $2 AND member_type = 'visitor' AND integration_stage != 'membro'`,
        [guest.group_id, newMember.id]
      );
    } catch (err) {
      console.error('Erro ao atualizar estágio de integração:', err);
    }

    return NextResponse.json(newMember, { status: 201 });
  } catch (error) {
    console.error('Erro ao converter visitante em membro:', error);
    return NextResponse.json(
      { error: 'Erro ao converter em membro' },
      { status: 500 }
    );
  }
}
