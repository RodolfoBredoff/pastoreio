import { query, queryOne, queryMany } from '@/lib/db/postgres';
import {
  getMeetingExtraFields,
  type AttendanceExtraFieldConfig,
  type ExtraValuesEntry,
} from '@/lib/attendance-list-extra';
import {
  countExtraAnswers,
  isAttendanceLimitReached,
  isMeetingExpired,
  isValidRg,
  normalizeRg,
  resolveExtraAndPayment,
} from '@/lib/attendance-list-rules';
import { receiptObjectExists } from '@/lib/payment-receipts';

// Reexportadas para manter os imports existentes.
export { isAttendanceLimitReached, isMeetingExpired, isValidRg, normalizeRg };

export type AttendanceListMode = 'prefilled' | 'open';

export type PublicAttendanceListMeeting = {
  id: string;
  title: string | null;
  meeting_date: string;
  meeting_time: string | null;
  location: string | null;
  notes: string | null;
  attendance_list_deadline: string | null;
  attendance_list_mode: AttendanceListMode;
  attendance_list_require_rg: boolean;
  attendance_list_limit: number | null;
  invite_cover_image_url?: string | null;
  is_paid_event: boolean;
  payment_pix_key: string | null;
};

export type PublicAttendanceListPayload = {
  meeting: PublicAttendanceListMeeting;
  extra_fields: AttendanceExtraFieldConfig[];
  extra_options_taken: Record<string, Record<string, number>>;
  count_confirmed: number;
  count_guests: number;
  is_expired: boolean;
  is_limit_reached: boolean;
  public_summary_only: true;
};

type MeetingRow = {
  id: string;
  title: string | null;
  meeting_date: string;
  meeting_time: string | null;
  location: string | null;
  notes: string | null;
  attendance_list_deadline: string | null;
  attendance_list_mode: AttendanceListMode | null;
  attendance_list_require_rg: boolean;
  attendance_list_limit: number | null;
  invite_cover_image_url: string | null;
  is_paid_event: boolean;
  payment_pix_key: string | null;
};

export async function getAttendanceConfirmedCount(meetingId: string, mode: AttendanceListMode): Promise<number> {
  if (mode === 'open') {
    const row = await queryOne<{ c: string }>(
      `SELECT COUNT(*)::text as c FROM attendance_list_public_entries WHERE meeting_id = $1`,
      [meetingId]
    );
    return parseInt(row?.c ?? '0', 10);
  }

  const presentRow = await queryOne<{ c: string }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'present')::text as c
     FROM attendance_list_responses WHERE meeting_id = $1`,
    [meetingId]
  );
  const guestsRow = await queryOne<{ c: string }>(
    `SELECT COUNT(*)::text as c FROM attendance_list_guests WHERE meeting_id = $1`,
    [meetingId]
  ).catch(() => ({ c: '0' }));

  return parseInt(presentRow?.c ?? '0', 10) + parseInt(guestsRow?.c ?? '0', 10);
}

export async function getMeetingBySlugOrToken(identifier: string): Promise<MeetingRow | null> {
  const meeting = await queryOne<MeetingRow>(
    `SELECT id, title, meeting_date, meeting_time, location, notes,
            attendance_list_deadline,
            COALESCE(attendance_list_mode, 'prefilled') as attendance_list_mode,
            COALESCE(attendance_list_require_rg, FALSE) as attendance_list_require_rg,
            attendance_list_limit,
            invite_cover_image_url,
            COALESCE(is_paid_event, FALSE) as is_paid_event,
            payment_pix_key
     FROM meetings
     WHERE (attendance_list_slug = $1 OR attendance_list_token::text = $1)
       AND is_cancelled = FALSE`,
    [identifier]
  );
  return meeting ?? null;
}

/**
 * Conta quantas vezes cada opção dos campos adicionais já foi escolhida.
 * Agrega respostas de membros (só 'present'), autocadastro e visitantes.
 * Expõe apenas CONTAGENS por opção — nenhum dado pessoal (padrão "somente totais").
 * 
 * IMPORTANTE: Inclui tanto opções pré-definidas quanto itens personalizados digitados pelos usuários.
 */
export async function getExtraOptionCounts(
  meetingId: string,
  fields: AttendanceExtraFieldConfig[]
): Promise<Record<string, Record<string, number>>> {
  if (fields.length === 0) return {};

  const rows = await queryMany<{ extra_values: unknown }>(
    `SELECT extra_values FROM attendance_list_responses WHERE meeting_id = $1 AND status = 'present'
     UNION ALL
     SELECT extra_values FROM attendance_list_public_entries WHERE meeting_id = $1
     UNION ALL
     SELECT extra_values FROM attendance_list_guests WHERE meeting_id = $1`,
    [meetingId]
  ).catch(() => []);

  return countExtraAnswers(fields, rows);
}

/**
 * Localiza o membro ativo do grupo do encontro pelo telefone (só dígitos).
 * Compara apenas os dígitos do cadastro, então funciona com telefone salvo formatado.
 */
export async function findMemberByPhone(
  meetingId: string,
  phoneDigits: string
): Promise<{ id: string; full_name: string } | null> {
  const member = await queryOne<{ id: string; full_name: string }>(
    `SELECT m.id, m.full_name
     FROM members m
     JOIN meetings mt ON mt.group_id = m.group_id
     WHERE mt.id = $1 AND m.is_active = TRUE
       AND regexp_replace(m.phone, '\\D', '', 'g') = $2
     LIMIT 1`,
    [meetingId, phoneDigits]
  );
  return member ?? null;
}

type ReceiptCheck = { ok: true; receiptId: string | null } | { ok: false; error: string; status: number };

/**
 * Valida o comprovante enviado na confirmação: pertence a este encontro, ainda não foi
 * usado por outra confirmação e o arquivo realmente existe no S3 (upload concluído).
 */
async function checkReceipt(
  receiptId: string | undefined,
  meetingId: string,
  exceptMemberId?: string
): Promise<ReceiptCheck> {
  if (!receiptId) return { ok: true, receiptId: null };

  const receipt = await queryOne<{ id: string; meeting_id: string; receipt_object_key: string; used: boolean }>(
    `SELECT r.id, r.meeting_id, r.receipt_object_key,
            (EXISTS (SELECT 1 FROM attendance_list_public_entries e WHERE e.payment_receipt_id = r.id)
             OR EXISTS (SELECT 1 FROM attendance_list_responses a
                        WHERE a.payment_receipt_id = r.id AND ($2::uuid IS NULL OR a.member_id <> $2::uuid))) AS used
     FROM payment_receipts r WHERE r.id = $1::uuid`,
    [receiptId, exceptMemberId ?? null]
  ).catch(() => null);

  if (!receipt || receipt.meeting_id !== meetingId) {
    return { ok: false, error: 'Comprovante de pagamento inválido.', status: 400 };
  }
  if (receipt.used) {
    return { ok: false, error: 'Este comprovante já foi utilizado. Envie um novo comprovante.', status: 400 };
  }
  if (!(await receiptObjectExists(receipt.receipt_object_key))) {
    return { ok: false, error: 'Não encontramos o arquivo do comprovante. Envie-o novamente.', status: 400 };
  }
  return { ok: true, receiptId: receipt.id };
}

export async function getPublicAttendanceList(identifier: string): Promise<PublicAttendanceListPayload | null> {
  const meeting = await getMeetingBySlugOrToken(identifier);
  if (!meeting) return null;

  const mode = meeting.attendance_list_mode ?? 'prefilled';
  const expired = isMeetingExpired(meeting.attendance_list_deadline);
  const countConfirmed = await getAttendanceConfirmedCount(meeting.id, mode);
  const extraFields = await getMeetingExtraFields(meeting.id);

  const meetingPayload: PublicAttendanceListMeeting = {
    id: meeting.id,
    title: meeting.title,
    meeting_date: meeting.meeting_date,
    meeting_time: meeting.meeting_time,
    location: meeting.location,
    notes: meeting.notes,
    attendance_list_deadline: meeting.attendance_list_deadline,
    attendance_list_mode: mode,
    attendance_list_require_rg: meeting.attendance_list_require_rg ?? false,
    attendance_list_limit: meeting.attendance_list_limit,
    invite_cover_image_url: meeting.invite_cover_image_url,
    is_paid_event: meeting.is_paid_event ?? false,
    payment_pix_key: meeting.payment_pix_key,
  };

  const guestsRow = await queryOne<{ c: string }>(
    `SELECT COUNT(*)::text as c FROM attendance_list_guests WHERE meeting_id = $1`,
    [meeting.id]
  ).catch(() => ({ c: '0' }));

  const extraOptionsTaken = await getExtraOptionCounts(meeting.id, extraFields);

  return {
    meeting: meetingPayload,
    extra_fields: extraFields,
    extra_options_taken: extraOptionsTaken,
    count_confirmed: countConfirmed,
    count_guests: parseInt(guestsRow?.c ?? '0', 10),
    is_expired: expired,
    is_limit_reached: isAttendanceLimitReached(countConfirmed, meeting.attendance_list_limit),
    public_summary_only: true,
  };
}

export async function publicConfirmPrefilledByPhoneOrEmail(args: {
  identifier: string;
  phone?: string;
  email?: string;
  extra_values?: unknown;
  payment_receipt_id?: string;
}) {
  const meeting = await getMeetingBySlugOrToken(args.identifier);
  if (!meeting) return { error: 'Lista não encontrada ou indisponível', status: 404 };

  const mode: AttendanceListMode = (meeting.attendance_list_mode ?? 'prefilled') as AttendanceListMode;
  if (mode !== 'prefilled') {
    return { error: 'Este link está configurado como lista vazia.', status: 400 };
  }

  if (isMeetingExpired(meeting.attendance_list_deadline)) {
    return { error: 'O prazo para confirmação deste encontro já foi encerrado.', status: 400 };
  }

  const extraFields = await getMeetingExtraFields(meeting.id);
  const resolved = resolveExtraAndPayment({
    fields: extraFields,
    rawExtraValues: args.extra_values,
    isPaidEvent: meeting.is_paid_event,
    hasReceipt: Boolean(args.payment_receipt_id),
  });
  if (!resolved.ok) return { error: resolved.error, status: 400 };
  const extraValues = resolved.values;

  const phoneVal = typeof args.phone === 'string' ? args.phone.replace(/\D/g, '').trim() : '';
  const emailVal = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  const hasPhone = phoneVal.length >= 10;
  const hasEmail = emailVal && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);

  if (!hasPhone && !hasEmail) {
    return { error: 'Informe um telefone (com DDD) ou um e-mail válido.', status: 400 };
  }

  const member = hasPhone ? await findMemberByPhone(meeting.id, phoneVal) : null;

  if (!member) {
    return { error: 'Não encontramos um participante com esse telefone neste grupo.', status: 404 };
  }

  const receiptCheck = await checkReceipt(args.payment_receipt_id, meeting.id, member.id);
  if (!receiptCheck.ok) return { error: receiptCheck.error, status: receiptCheck.status };
  const paymentReceiptId = receiptCheck.receiptId;

  const existing = await queryOne<{ status: string }>(
    `SELECT status FROM attendance_list_responses WHERE meeting_id = $1 AND member_id = $2`,
    [meeting.id, member.id]
  );

  if (!existing || existing.status !== 'present') {
    const count = await getAttendanceConfirmedCount(meeting.id, mode);
    if (isAttendanceLimitReached(count, meeting.attendance_list_limit)) {
      return { error: 'O limite de inscrições para este evento já foi atingido.', status: 400 };
    }
  }

  await query(
    `INSERT INTO attendance_list_responses (meeting_id, member_id, status, email, phone, extra_values, payment_receipt_id)
     VALUES ($1, $2, 'present', $3, $4, $5::jsonb, $6)
     ON CONFLICT (meeting_id, member_id) DO UPDATE SET status = 'present', email = $3, phone = $4, extra_values = $5::jsonb, payment_receipt_id = $6`,
    [meeting.id, member.id, hasEmail ? emailVal : null, hasPhone ? phoneVal : null, JSON.stringify(extraValues), paymentReceiptId]
  );

  return { ok: true, status: 200 };
}

export async function publicCreateOpenEntry(args: {
  identifier: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  rg?: string;
  extra_values?: unknown;
  payment_receipt_id?: string;
}) {
  const meeting = await getMeetingBySlugOrToken(args.identifier);
  if (!meeting) return { error: 'Lista não encontrada ou indisponível', status: 404 };

  const mode: AttendanceListMode = (meeting.attendance_list_mode ?? 'prefilled') as AttendanceListMode;
  if (mode !== 'open') {
    return { error: 'Este link está configurado como lista pré-preenchida.', status: 400 };
  }

  if (isMeetingExpired(meeting.attendance_list_deadline)) {
    return { error: 'O prazo para confirmação deste encontro já foi encerrado.', status: 400 };
  }

  const extraFields = await getMeetingExtraFields(meeting.id);
  const resolved = resolveExtraAndPayment({
    fields: extraFields,
    rawExtraValues: args.extra_values,
    isPaidEvent: meeting.is_paid_event,
    hasReceipt: Boolean(args.payment_receipt_id),
  });
  if (!resolved.ok) return { error: resolved.error, status: 400 };
  const extraValues = resolved.values;

  const receiptCheck = await checkReceipt(args.payment_receipt_id, meeting.id);
  if (!receiptCheck.ok) return { error: receiptCheck.error, status: receiptCheck.status };
  const paymentReceiptId = receiptCheck.receiptId;

  const count = await getAttendanceConfirmedCount(meeting.id, mode);
  if (isAttendanceLimitReached(count, meeting.attendance_list_limit)) {
    return { error: 'O limite de inscrições para este evento já foi atingido.', status: 400 };
  }

  const firstName = typeof args.first_name === 'string' ? args.first_name.trim() : '';
  const lastName = typeof args.last_name === 'string' ? args.last_name.trim() : '';
  const emailVal = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  const phoneVal = typeof args.phone === 'string' ? args.phone.replace(/\D/g, '').trim() : '';
  const hasEmail = emailVal && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
  const hasPhone = phoneVal.length >= 10;
  const rgVal = typeof args.rg === 'string' ? normalizeRg(args.rg) : '';

  if (!firstName) return { error: 'Informe o nome.', status: 400 };
  if (!lastName) return { error: 'Informe o sobrenome.', status: 400 };
  if (!hasEmail && !hasPhone) {
    return { error: 'Informe um e-mail válido ou telefone (com DDD).', status: 400 };
  }
  if (meeting.attendance_list_require_rg) {
    if (!rgVal) return { error: 'Informe o RG.', status: 400 };
    if (!isValidRg(rgVal)) return { error: 'Informe um RG válido.', status: 400 };
  }

  await query(
    `INSERT INTO attendance_list_public_entries (meeting_id, first_name, last_name, email, phone, rg, extra_values, payment_receipt_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      meeting.id,
      firstName,
      lastName,
      hasEmail ? emailVal : null,
      hasPhone ? phoneVal : null,
      meeting.attendance_list_require_rg ? rgVal : null,
      JSON.stringify(extraValues),
      paymentReceiptId,
    ]
  );

  return { ok: true, status: 201 };
}

/**
 * Grava uma confirmação "open" recebida pela Lambda com a EC2 desligada
 * (buffer DynamoDB → Postgres). Prazo e limite já foram validados no momento
 * da confirmação, então não são checados de novo aqui; o restante é revalidado.
 * Idempotente: `entryId` é determinístico e o INSERT usa ON CONFLICT (id) DO NOTHING.
 */
export async function insertBufferedOpenEntry(args: {
  entryId: string;
  meetingId: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  rg?: string | null;
  extra_values: unknown;
  created_at: string;
}): Promise<{ ok: true; inserted: boolean } | { ok: false; error: string }> {
  const meeting = await queryOne<{
    id: string;
    attendance_list_mode: AttendanceListMode;
    attendance_list_require_rg: boolean;
  }>(
    `SELECT id, COALESCE(attendance_list_mode, 'prefilled') AS attendance_list_mode,
            COALESCE(attendance_list_require_rg, FALSE) AS attendance_list_require_rg
     FROM meetings WHERE id = $1`,
    [args.meetingId]
  );
  if (!meeting) return { ok: false, error: 'Encontro não existe mais' };
  if (meeting.attendance_list_mode !== 'open') return { ok: false, error: 'Lista não está mais no modo aberto' };

  // A Lambda já validou a confirmação com a configuração vigente no momento do envio.
  // Se o líder mudou os campos depois, a confirmação já aceita NÃO pode ser descartada:
  // gravamos as respostas como foram aceitas (apenas saneadas).
  const extraValues: ExtraValuesEntry[] = (Array.isArray(args.extra_values) ? args.extra_values : []).flatMap(
    (item): ExtraValuesEntry[] => {
      if (!item || typeof item !== 'object') return [];
      const e = item as Record<string, unknown>;
      if (typeof e.field_id !== 'string' || !Array.isArray(e.values)) return [];
      const values = e.values
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim().slice(0, 200));
      return values.length > 0 ? [{ field_id: e.field_id, values }] : [];
    }
  );

  const firstName = (args.first_name ?? '').trim();
  const lastName = (args.last_name ?? '').trim();
  const email = args.email?.trim().toLowerCase() || null;
  const phone = args.phone?.replace(/\D/g, '') || null;
  if (!firstName || !lastName || (!email && !phone)) return { ok: false, error: 'Dados incompletos' };
  const rg = meeting.attendance_list_require_rg ? normalizeRg(args.rg ?? '') || null : null;

  const result = await query(
    `INSERT INTO attendance_list_public_entries
       (id, meeting_id, first_name, last_name, email, phone, rg, extra_values, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     ON CONFLICT (id) DO NOTHING`,
    [args.entryId, meeting.id, firstName, lastName, email, phone, rg, JSON.stringify(extraValues), args.created_at]
  );
  return { ok: true, inserted: (result.rowCount ?? 0) > 0 };
}
