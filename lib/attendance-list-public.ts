import { query, queryOne, queryMany } from '@/lib/db/postgres';
import {
  getMeetingExtraFields,
  normalizeExtraValues,
  type AttendanceExtraFieldConfig,
  type ExtraValuesEntry,
} from '@/lib/attendance-list-extra';
import {
  isAttendanceLimitReached,
  isMeetingExpired,
  isValidRg,
  normalizeRg,
} from '@/lib/attendance-list-rules';

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
            invite_cover_image_url
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
 */
export async function getExtraOptionCounts(
  meetingId: string,
  fields: AttendanceExtraFieldConfig[]
): Promise<Record<string, Record<string, number>>> {
  const taken: Record<string, Record<string, number>> = {};
  if (fields.length === 0) return taken;

  const rows = await queryMany<{ extra_values: unknown }>(
    `SELECT extra_values FROM attendance_list_responses WHERE meeting_id = $1 AND status = 'present'
     UNION ALL
     SELECT extra_values FROM attendance_list_public_entries WHERE meeting_id = $1
     UNION ALL
     SELECT extra_values FROM attendance_list_guests WHERE meeting_id = $1`,
    [meetingId]
  ).catch(() => []);

  const optionsByField = new Map<string, Map<string, string>>();
  for (const f of fields) {
    if (!f.options) continue;
    const lower = new Map<string, string>();
    for (const o of f.options) lower.set(o.toLowerCase(), o);
    optionsByField.set(f.id, lower);
    taken[f.id] = {};
  }
  if (optionsByField.size === 0) return taken;

  for (const row of rows) {
    const entries = Array.isArray(row.extra_values) ? row.extra_values : [];
    for (const item of entries) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Record<string, unknown>;
      if (typeof e.field_id !== 'string' || !Array.isArray(e.values)) continue;
      const lower = optionsByField.get(e.field_id);
      if (!lower) continue;
      for (const v of e.values) {
        if (typeof v !== 'string') continue;
        const canonical = lower.get(v.trim().toLowerCase());
        if (!canonical) continue;
        taken[e.field_id][canonical] = (taken[e.field_id][canonical] ?? 0) + 1;
      }
    }
  }
  return taken;
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
  let extraValues: ExtraValuesEntry[] = [];
  if (extraFields.length > 0) {
    const extraRes = normalizeExtraValues(extraFields, args.extra_values);
    if (!extraRes.ok) return { error: extraRes.error, status: 400 };
    extraValues = extraRes.values;
  }

  const phoneVal = typeof args.phone === 'string' ? args.phone.replace(/\D/g, '').trim() : '';
  const emailVal = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  const hasPhone = phoneVal.length >= 10;
  const hasEmail = emailVal && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);

  if (!hasPhone && !hasEmail) {
    return { error: 'Informe um telefone (com DDD) ou um e-mail válido.', status: 400 };
  }

  const member = await queryOne<{ id: string }>(
    hasPhone
      ? `SELECT m.id
         FROM members m
         JOIN meetings mt ON mt.group_id = m.group_id
         WHERE mt.id = $1 AND m.is_active = TRUE
           AND regexp_replace(m.phone, '\\\\D', '', 'g') = $2
         LIMIT 1`
      : `SELECT m.id FROM members m WHERE FALSE`,
    hasPhone ? [meeting.id, phoneVal] : []
  );

  if (!member) {
    return { error: 'Não encontramos um participante com esse telefone neste grupo.', status: 404 };
  }

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
    `INSERT INTO attendance_list_responses (meeting_id, member_id, status, email, phone, extra_values)
     VALUES ($1, $2, 'present', $3, $4, $5::jsonb)
     ON CONFLICT (meeting_id, member_id) DO UPDATE SET status = 'present', email = $3, phone = $4, extra_values = $5::jsonb`,
    [meeting.id, member.id, hasEmail ? emailVal : null, hasPhone ? phoneVal : null, JSON.stringify(extraValues)]
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
  let extraValues: ExtraValuesEntry[] = [];
  if (extraFields.length > 0) {
    const extraRes = normalizeExtraValues(extraFields, args.extra_values);
    if (!extraRes.ok) return { error: extraRes.error, status: 400 };
    extraValues = extraRes.values;
  }

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
    `INSERT INTO attendance_list_public_entries (meeting_id, first_name, last_name, email, phone, rg, extra_values)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      meeting.id,
      firstName,
      lastName,
      hasEmail ? emailVal : null,
      hasPhone ? phoneVal : null,
      meeting.attendance_list_require_rg ? rgVal : null,
      JSON.stringify(extraValues),
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

  const extraFields = await getMeetingExtraFields(meeting.id);
  let extraValues: ExtraValuesEntry[] = [];
  if (extraFields.length > 0) {
    const res = normalizeExtraValues(extraFields, args.extra_values);
    if (!res.ok) return { ok: false, error: `Campos adicionais: ${res.error}` };
    extraValues = res.values;
  }

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
