import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryMany, queryOne } from '@/lib/db/postgres';

export interface ContactLogEntry {
  id: string;
  group_id: string;
  member_id: string;
  leader_id: string | null;
  leader_name: string | null;
  contact_type: 'whatsapp' | 'ligacao' | 'presencial' | 'email' | 'outro';
  note: string | null;
  contacted_at: string;
}

/**
 * GET /api/members/[id]/contacts
 * Lista o histórico de contatos de um membro
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 400 });
    }

    const { id: memberId } = await params;

    const member = await queryOne<{ id: string; group_id: string }>(
      `SELECT id, group_id FROM members WHERE id = $1`,
      [memberId]
    );

    if (!member || member.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    const contacts = await queryMany<ContactLogEntry>(
      `SELECT cl.*, l.full_name AS leader_name
       FROM contact_log cl
       LEFT JOIN leaders l ON l.id = cl.leader_id
       WHERE cl.member_id = $1
       ORDER BY cl.contacted_at DESC
       LIMIT 50`,
      [memberId]
    );

    return NextResponse.json(contacts);
  } catch (error) {
    console.error('Erro ao buscar histórico de contatos:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * POST /api/members/[id]/contacts
 * Registra um novo contato com o membro
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 400 });
    }

    const { id: memberId } = await params;

    const member = await queryOne<{ id: string; group_id: string }>(
      `SELECT id, group_id FROM members WHERE id = $1`,
      [memberId]
    );

    if (!member || member.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const contactType = body.contact_type as string;
    const note: string | null = body.note?.trim() || null;
    const contactedAt: string | null = body.contacted_at || null;

    const validTypes = ['whatsapp', 'ligacao', 'presencial', 'email', 'outro'];
    if (!validTypes.includes(contactType)) {
      return NextResponse.json(
        { error: 'Tipo de contato inválido' },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO contact_log (group_id, member_id, leader_id, contact_type, note, contacted_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))
       RETURNING *`,
      [leader.group_id, memberId, leader.id, contactType, note, contactedAt]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar contato:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
