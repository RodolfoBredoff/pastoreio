import { NextResponse } from 'next/server';
import { query, queryOne, queryMany } from '@/lib/db/postgres';

/**
 * GET /api/lista-presenca/[token]
 * Público: retorna dados do encontro (título, data, local), lista de membros e respostas já registradas + contadores.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
    }

    const meeting = await queryOne<{
      id: string;
      title: string | null;
      meeting_date: string;
      meeting_time: string | null;
      location: string | null;
      group_id: string;
    }>(
      `SELECT id, title, meeting_date, meeting_time, location, group_id
       FROM meetings
       WHERE attendance_list_token = $1 AND is_cancelled = FALSE`,
      [token]
    );

    if (!meeting) {
      return NextResponse.json({ error: 'Lista não encontrada ou indisponível' }, { status: 404 });
    }

    const members = await queryMany<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM members WHERE group_id = $1 AND is_active = TRUE ORDER BY full_name ASC`,
      [meeting.group_id]
    );

    const responses = await queryMany<{ member_id: string; status: string; email: string }>(
      `SELECT member_id, status, email FROM attendance_list_responses WHERE meeting_id = $1`,
      [meeting.id]
    );

    const responseMap: Record<string, { status: 'present' | 'absent'; email: string }> = {};
    let countPresent = 0;
    let countAbsent = 0;
    for (const r of responses) {
      responseMap[r.member_id] = { status: r.status as 'present' | 'absent', email: r.email };
      if (r.status === 'present') countPresent++;
      else countAbsent++;
    }

    let guests: { id: string; first_name: string; last_name: string; registered_by_email: string }[] = [];
    try {
      guests = await queryMany(
        `SELECT id, first_name, last_name, registered_by_email FROM attendance_list_guests WHERE meeting_id = $1 ORDER BY created_at ASC`,
        [meeting.id]
      );
    } catch {
      // Tabela pode não existir se a migration 012 não foi aplicada
    }

    return NextResponse.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        meeting_date: meeting.meeting_date,
        meeting_time: meeting.meeting_time,
        location: meeting.location,
      },
      members: members.map((m) => ({
        id: m.id,
        full_name: m.full_name,
        response: responseMap[m.id] ?? null,
      })),
      guests: guests.map((g) => ({
        id: g.id,
        first_name: g.first_name,
        last_name: g.last_name,
        full_name: `${g.first_name} ${g.last_name}`.trim(),
        registered_by_email: g.registered_by_email,
      })),
      count_present: countPresent,
      count_absent: countAbsent,
      count_guests: guests.length,
    });
  } catch (error) {
    console.error('Erro ao buscar lista de presença:', error);
    return NextResponse.json({ error: 'Erro ao carregar lista' }, { status: 500 });
  }
}

/**
 * POST /api/lista-presenca/[token]
 * Público: registra ou atualiza a resposta (Estarei presente / Vou me ausentar) do membro, com e-mail.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
    }

    const body = await request.json();
    const { member_id, status, email } = body as { member_id?: string; status?: string; email?: string };

    if (!member_id || !status || !email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'É obrigatório informar member_id, status e email' },
        { status: 400 }
      );
    }

    const statusNorm = status === 'present' || status === 'absent' ? status : null;
    if (!statusNorm) {
      return NextResponse.json({ error: 'status deve ser "present" ou "absent"' }, { status: 400 });
    }

    const emailTrim = email.trim().toLowerCase();
    if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      return NextResponse.json({ error: 'Informe um e-mail válido' }, { status: 400 });
    }

    const meeting = await queryOne<{ id: string; group_id: string }>(
      `SELECT id, group_id FROM meetings WHERE attendance_list_token = $1 AND is_cancelled = FALSE`,
      [token]
    );

    if (!meeting) {
      return NextResponse.json({ error: 'Lista não encontrada ou indisponível' }, { status: 404 });
    }

    // Garantir que o membro pertence ao grupo do encontro
    const member = await queryOne<{ id: string }>(
      `SELECT id FROM members WHERE id = $1 AND group_id = $2 AND is_active = TRUE`,
      [member_id, meeting.group_id]
    );

    if (!member) {
      return NextResponse.json({ error: 'Membro não encontrado nesta lista' }, { status: 404 });
    }

    await query(
      `INSERT INTO attendance_list_responses (meeting_id, member_id, status, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (meeting_id, member_id) DO UPDATE SET status = $3, email = $4`,
      [meeting.id, member_id, statusNorm, emailTrim]
    );

    const counts = await queryOne<{ count_present: string; count_absent: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'present')::text as count_present,
         COUNT(*) FILTER (WHERE status = 'absent')::text as count_absent
       FROM attendance_list_responses WHERE meeting_id = $1`,
      [meeting.id]
    );

    return NextResponse.json({
      ok: true,
      count_present: parseInt(counts?.count_present ?? '0', 10),
      count_absent: parseInt(counts?.count_absent ?? '0', 10),
    });
  } catch (error) {
    console.error('Erro ao salvar resposta da lista de presença:', error);
    return NextResponse.json({ error: 'Erro ao registrar resposta' }, { status: 500 });
  }
}
