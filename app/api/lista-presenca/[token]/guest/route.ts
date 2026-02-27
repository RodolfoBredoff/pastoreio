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
    const { first_name, last_name, email, phone } = body as {
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
    };

    const firstName = typeof first_name === 'string' ? first_name.trim() : '';
    const lastName = typeof last_name === 'string' ? last_name.trim() : '';
    const emailVal = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const phoneVal = typeof phone === 'string' ? phone.replace(/\D/g, '').trim() : '';
    const hasEmail = emailVal && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
    const hasPhone = phoneVal.length >= 10;

    if (!firstName) {
      return NextResponse.json({ error: 'Informe o nome do visitante' }, { status: 400 });
    }
    if (!lastName) {
      return NextResponse.json({ error: 'Informe o sobrenome do visitante' }, { status: 400 });
    }
    if (!hasEmail && !hasPhone) {
      return NextResponse.json(
        { error: 'Informe um e-mail válido ou telefone (com DDD) de quem está cadastrando' },
        { status: 400 }
      );
    }

    const meeting = await queryOne<{ id: string; attendance_list_deadline: string | null }>(
      `SELECT id, attendance_list_deadline FROM meetings WHERE attendance_list_token = $1 AND is_cancelled = FALSE`,
      [token]
    );

    if (!meeting) {
      return NextResponse.json({ error: 'Lista não encontrada ou indisponível' }, { status: 404 });
    }

    if (meeting.attendance_list_deadline) {
      const now = new Date();
      const deadline = new Date(meeting.attendance_list_deadline);
      if (now > deadline) {
        return NextResponse.json(
          { error: 'O prazo para confirmação deste encontro já foi encerrado.' },
          { status: 400 }
        );
      }
    }

    await query(
      `INSERT INTO attendance_list_guests (meeting_id, first_name, last_name, registered_by_email, registered_by_phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [meeting.id, firstName, lastName, hasEmail ? emailVal : null, hasPhone ? phoneVal : null]
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
