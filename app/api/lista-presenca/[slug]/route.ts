import { NextResponse } from 'next/server';
import { getPublicAttendanceList, publicConfirmPrefilledByPhoneOrEmail, publicCreateOpenEntry } from '@/lib/attendance-list-public';

/**
 * GET /api/lista-presenca/[slug]
 * Público: SEM PII. Retorna apenas metadados e contadores.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });

    const payload = await getPublicAttendanceList(slug);
    if (!payload) return NextResponse.json({ error: 'Lista não encontrada ou indisponível' }, { status: 404 });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Erro ao buscar lista pública:', error);
    return NextResponse.json({ error: 'Erro ao carregar lista' }, { status: 500 });
  }
}

/**
 * POST /api/lista-presenca/[slug]
 * Público:
 * - mode=open: cria um registro de confirmação (Nome/Sobrenome + Email/Telefone)
 * - mode=prefilled: confirma presença via telefone/e-mail (sem listar nomes publicamente)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const { mode } = body as { mode?: 'open' | 'prefilled' };

    if (mode === 'open') {
      const { first_name, last_name, email, phone } = body as {
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
      };
      const res = await publicCreateOpenEntry({ identifier: slug, first_name: first_name ?? '', last_name: last_name ?? '', email, phone });
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    // Default: prefilled confirmation (present) by phone/email
    const { phone, email } = body as { phone?: string; email?: string };
    const res = await publicConfirmPrefilledByPhoneOrEmail({ identifier: slug, phone, email });
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Erro ao registrar confirmação pública:', error);
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 });
  }
}

