import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader, getGuestVisitorById, upsertGuestPhoto } from '@/lib/db/queries';
import { query, queryOne } from '@/lib/db/postgres';
import { parseGuestPhotoDataUrl } from '@/lib/guest-photo';

type Params = { params: Promise<{ id: string }> };

/** Autentica e garante que o visitante é do grupo do líder. */
async function authorize(params: Params['params']) {
  await requireAuth();
  const leader = await getCurrentLeader();
  if (!leader?.group_id) {
    return { error: NextResponse.json({ error: 'Líder não está vinculado a um grupo' }, { status: 400 }) };
  }
  const { id } = await params;
  const guest = await getGuestVisitorById(id);
  if (!guest || guest.group_id !== leader.group_id) {
    return { error: NextResponse.json({ error: 'Visitante não encontrado' }, { status: 404 }) };
  }
  return { leader, guestId: id };
}

/** GET /api/guests/[id]/photo: miniatura (somente usuário autenticado do mesmo grupo). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await authorize(params);
    if ('error' in auth) return auth.error;

    const row = await queryOne<{ mime_type: string; data: Buffer }>(
      `SELECT mime_type, data FROM guest_visitor_photos WHERE guest_id = $1`,
      [auth.guestId]
    );
    if (!row) return NextResponse.json({ error: 'Sem foto' }, { status: 404 });

    return new NextResponse(new Uint8Array(row.data), {
      status: 200,
      headers: {
        'Content-Type': row.mime_type,
        'Content-Length': String(row.data.length),
        // Privada: nunca em cache compartilhado (CloudFront/proxy). O navegador pode guardar por pouco tempo.
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Erro ao buscar foto do visitante:', error);
    return NextResponse.json({ error: 'Erro ao buscar foto' }, { status: 500 });
  }
}

/**
 * PUT /api/guests/[id]/photo
 * Body: { photo: "data:image/webp;base64,...", consent: true }
 * Sem consentimento explícito a foto não é gravada.
 */
export async function PUT(request: Request, { params }: Params) {
  try {
    const auth = await authorize(params);
    if ('error' in auth) return auth.error;

    const body = (await request.json().catch(() => ({}))) as { photo?: unknown; consent?: unknown };
    if (body.consent !== true) {
      return NextResponse.json(
        { error: 'Confirme que o visitante autorizou o registro da foto' },
        { status: 400 }
      );
    }
    const parsed = parseGuestPhotoDataUrl(body.photo);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    await upsertGuestPhoto({ query }, auth.guestId, parsed.photo, auth.leader.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar foto do visitante:', error);
    return NextResponse.json({ error: 'Erro ao salvar foto' }, { status: 500 });
  }
}

/** DELETE /api/guests/[id]/photo: remove a foto (e o consentimento junto). */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await authorize(params);
    if ('error' in auth) return auth.error;
    await query(`DELETE FROM guest_visitor_photos WHERE guest_id = $1`, [auth.guestId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover foto do visitante:', error);
    return NextResponse.json({ error: 'Erro ao remover foto' }, { status: 500 });
  }
}
