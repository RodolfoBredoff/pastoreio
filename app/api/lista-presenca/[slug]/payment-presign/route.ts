import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/postgres';
import { findMemberByPhone, getMeetingBySlugOrToken, isMeetingExpired } from '@/lib/attendance-list-public';
import {
  RECEIPT_ALLOWED_TYPES,
  RECEIPT_MAX_BYTES,
  buildReceiptObjectKey,
  createReceiptUploadUrl,
  getReceiptBucket,
} from '@/lib/payment-receipts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/lista-presenca/[slug]/payment-presign
 * Público. Gera a URL pré-assinada (PUT) para o upload do comprovante de pagamento.
 *
 * Body: { mode: 'open' | 'prefilled', contentType, size, first_name?, last_name?, email?, phone? }
 *  - open:      nome, sobrenome e e-mail OU telefone digitados pela pessoa.
 *  - prefilled: telefone; o nome vem do cadastro do membro no grupo.
 *
 * O arquivo é salvo como <evento>__<nome-sobrenome>__<email|telefone>__<uuid>.<ext>.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });

    const meeting = await getMeetingBySlugOrToken(slug);
    if (!meeting) return NextResponse.json({ error: 'Lista não encontrada ou indisponível' }, { status: 404 });
    if (!meeting.is_paid_event) {
      return NextResponse.json({ error: 'Este evento não requer pagamento' }, { status: 400 });
    }
    if (isMeetingExpired(meeting.attendance_list_deadline)) {
      return NextResponse.json({ error: 'O prazo para confirmação deste encontro já foi encerrado.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');

    const contentType = str(body.contentType);
    const size = typeof body.size === 'number' ? body.size : NaN;
    if (!RECEIPT_ALLOWED_TYPES[contentType]) {
      return NextResponse.json({ error: 'Formato não suportado (use JPG, PNG, WEBP ou PDF)' }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });
    }
    if (size > RECEIPT_MAX_BYTES) {
      return NextResponse.json({ error: 'Arquivo muito grande (máx. 10MB)' }, { status: 400 });
    }
    if (!getReceiptBucket()) {
      return NextResponse.json({ error: 'Armazenamento de comprovantes não configurado' }, { status: 500 });
    }

    const mode = meeting.attendance_list_mode;
    const phone = str(body.phone).replace(/\D/g, '');
    const email = str(body.email).trim().toLowerCase();
    const hasPhone = phone.length >= 10;
    const hasEmail = EMAIL_RE.test(email);

    let firstName = '';
    let lastName = '';
    let contact = '';

    if (mode === 'prefilled') {
      if (!hasPhone) {
        return NextResponse.json({ error: 'Informe um telefone com DDD (mín. 10 dígitos).' }, { status: 400 });
      }
      const member = await findMemberByPhone(meeting.id, phone);
      if (!member) {
        return NextResponse.json(
          { error: 'Não encontramos um participante com esse telefone neste grupo.' },
          { status: 404 }
        );
      }
      const parts = member.full_name.trim().split(/\s+/);
      firstName = parts[0] ?? '';
      lastName = parts.slice(1).join(' ');
      contact = phone;
    } else {
      firstName = str(body.first_name).trim().slice(0, 120);
      lastName = str(body.last_name).trim().slice(0, 120);
      if (!firstName) return NextResponse.json({ error: 'Informe o nome.' }, { status: 400 });
      if (!lastName) return NextResponse.json({ error: 'Informe o sobrenome.' }, { status: 400 });
      if (!hasEmail && !hasPhone) {
        return NextResponse.json({ error: 'Informe um e-mail válido ou telefone (com DDD).' }, { status: 400 });
      }
      contact = hasEmail ? email : phone;
    }

    // Um único UUID: id do comprovante e sufixo do nome do arquivo
    const receiptId = randomUUID();
    const key = buildReceiptObjectKey({
      meetingId: meeting.id,
      eventTitle: meeting.title,
      firstName,
      lastName,
      contact,
      contentType,
      uuid: receiptId,
    });

    const uploadUrl = await createReceiptUploadUrl({ key, contentType, size });

    await queryOne(
      `INSERT INTO payment_receipts
         (id, meeting_id, user_first_name, user_last_name, user_email, user_phone, receipt_url, receipt_object_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        receiptId,
        meeting.id,
        firstName,
        lastName,
        hasEmail ? email : null,
        hasPhone ? phone : null,
        `s3://${getReceiptBucket()}/${key}`,
        key,
      ]
    );

    return NextResponse.json({ uploadUrl, receiptId });
  } catch (error) {
    console.error('Erro ao gerar presign de comprovante:', error);
    return NextResponse.json({ error: 'Erro ao gerar link de upload' }, { status: 500 });
  }
}
