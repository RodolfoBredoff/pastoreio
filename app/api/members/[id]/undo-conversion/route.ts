import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { evaluateUndoConversion, undoConversion, UndoConversionError } from '@/lib/guest-conversion';

type Params = { params: Promise<{ id: string }> };

async function authorize() {
  await requireAuth();
  const leader = await getCurrentLeader();
  if (!leader?.group_id) {
    return { error: NextResponse.json({ error: 'Líder não está vinculado a um grupo' }, { status: 400 }) };
  }
  return { groupId: leader.group_id };
}

/** GET: esta pessoa veio de uma conversão? Dá para desfazer com segurança? (não altera nada) */
export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await authorize();
    if ('error' in auth) return auth.error;
    const { id } = await params;
    const evaluation = await evaluateUndoConversion(id, auth.groupId);
    return NextResponse.json(evaluation);
  } catch (error) {
    console.error('Erro ao avaliar desfazer conversão:', error);
    return NextResponse.json({ error: 'Erro ao avaliar' }, { status: 500 });
  }
}

/** POST: desfaz a conversão (volta a ser visitante), se for seguro. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const auth = await authorize();
    if ('error' in auth) return auth.error;
    const { id } = await params;
    const result = await undoConversion(id, auth.groupId);
    return NextResponse.json({ success: true, guest_id: result.guestId, restored_meetings: result.restoredMeetings });
  } catch (error) {
    if (error instanceof UndoConversionError) {
      return NextResponse.json({ error: error.message, reasons: error.reasons }, { status: error.status });
    }
    console.error('Erro ao desfazer conversão:', error);
    return NextResponse.json({ error: 'Erro ao desfazer a conversão' }, { status: 500 });
  }
}
