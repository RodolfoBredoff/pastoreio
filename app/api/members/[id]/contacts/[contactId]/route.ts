import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryOne } from '@/lib/db/postgres';

const VALID_TYPES = ['whatsapp', 'ligacao', 'presencial', 'email', 'outro'] as const;

/**
 * PATCH /api/members/[id]/contacts/[contactId]
 * Atualiza um registro do histórico de contatos (tipo, observação e data).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 400 });
    }

    const { id: memberId, contactId } = await params;

    const member = await queryOne<{ id: string; group_id: string }>(
      `SELECT id, group_id FROM members WHERE id = $1`,
      [memberId]
    );

    if (!member || member.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM contact_log
       WHERE id = $1 AND member_id = $2 AND group_id = $3`,
      [contactId, memberId, leader.group_id]
    );

    if (!existing) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (body.contact_type !== undefined) {
      const contactType = body.contact_type as string;
      if (!VALID_TYPES.includes(contactType as (typeof VALID_TYPES)[number])) {
        return NextResponse.json({ error: 'Tipo de contato inválido' }, { status: 400 });
      }
      updates.push(`contact_type = $${i++}`);
      values.push(contactType);
    }

    if (body.note !== undefined) {
      const note =
        body.note === null
          ? null
          : typeof body.note === 'string'
            ? body.note.trim() || null
            : null;
      updates.push(`note = $${i++}`);
      values.push(note);
    }

    if (body.contacted_at !== undefined && body.contacted_at !== null) {
      const ts = new Date(body.contacted_at as string);
      if (Number.isNaN(ts.getTime())) {
        return NextResponse.json({ error: 'Data/hora inválida' }, { status: 400 });
      }
      updates.push(`contacted_at = $${i++}`);
      values.push(ts.toISOString());
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    values.push(contactId, memberId, leader.group_id);

    const row = await queryOne<Record<string, unknown>>(
      `UPDATE contact_log
       SET ${updates.join(', ')}
       WHERE id = $${i++} AND member_id = $${i++} AND group_id = $${i}
       RETURNING *`,
      values
    );

    return NextResponse.json(row);
  } catch (error) {
    console.error('Erro ao atualizar contato:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
