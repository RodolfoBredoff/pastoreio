import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryOne } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { createReceiptDownloadUrl } from '@/lib/payment-receipts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/meetings/[id]/payment-receipts/[receiptId]
 * Líder/secretário do grupo: devolve uma URL temporária (2 min) para abrir o comprovante.
 * Os comprovantes são privados; nunca há link público permanente.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; receiptId: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não está vinculado a um grupo' }, { status: 400 });
    }
    if (!canManageMeetings(leader.role)) {
      return NextResponse.json({ error: SECRETARY_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const { id: meetingId, receiptId } = await params;
    if (!UUID_RE.test(meetingId) || !UUID_RE.test(receiptId)) {
      return NextResponse.json({ error: 'Comprovante não encontrado' }, { status: 404 });
    }

    // O comprovante precisa pertencer a um encontro DO GRUPO do líder
    const receipt = await queryOne<{ receipt_object_key: string }>(
      `SELECT r.receipt_object_key
       FROM payment_receipts r
       JOIN meetings m ON m.id = r.meeting_id
       WHERE r.id = $1 AND r.meeting_id = $2 AND m.group_id = $3`,
      [receiptId, meetingId, leader.group_id]
    );
    if (!receipt) {
      return NextResponse.json({ error: 'Comprovante não encontrado' }, { status: 404 });
    }

    const url = await createReceiptDownloadUrl(receipt.receipt_object_key);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Erro ao gerar link do comprovante:', error);
    return NextResponse.json({ error: 'Erro ao abrir comprovante' }, { status: 500 });
  }
}
