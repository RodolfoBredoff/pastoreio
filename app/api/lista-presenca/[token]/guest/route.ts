import { NextResponse } from 'next/server';
import { query, queryOne, queryMany } from '@/lib/db/postgres';

/**
 * POST /api/lista-presenca/[token]/guest
 * Público: cadastra um visitante que será levado ao encontro (nome, sobrenome + e-mail de quem cadastra).
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
    const { first_name, last_name, email } = body as {
      first_name?: string;
      last_name?: string;
      email?: string;
    };

    const firstName = typeof first_name === 'string' ? first_name.trim() : '';
    const lastName = typeof last_name === 'string' ? last_name.trim() : '';
    const emailTrim = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!firstName) {
      return NextResponse.json({ error: 'Informe o nome do visitante' }, { status: 400 });
    }
    if (!lastName) {
      return NextResponse.json({ error: 'Informe o sobrenome do visitante' }, { status: 400 });
    }
    if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      return NextResponse.json({ error: 'Informe um e-mail válido de quem está cadastrando' }, { status: 400 });
    }

    const meeting = await queryOne<{ id: string }>(
      `SELECT id FROM meetings WHERE attendance_list_token = $1 AND is_cancelled = FALSE`,
      [token]
    );

    if (!meeting) {
      return NextResponse.json({ error: 'Lista não encontrada ou indisponível' }, { status: 404 });
    }

    await query(
      `INSERT INTO attendance_list_guests (meeting_id, first_name, last_name, registered_by_email)
       VALUES ($1, $2, $3, $4)`,
      [meeting.id, firstName, lastName, emailTrim]
    );

    const guests = await queryMany<{ id: string }>(
      `SELECT id FROM attendance_list_guests WHERE meeting_id = $1`,
      [meeting.id]
    );

    return NextResponse.json({
      ok: true,
      count_guests: guests.length,
    });
  } catch (error) {
    console.error('Erro ao cadastrar visitante na lista de presença:', error);
    return NextResponse.json({ error: 'Erro ao cadastrar visitante' }, { status: 500 });
  }
}
