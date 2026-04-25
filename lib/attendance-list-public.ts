import { query, queryOne } from '@/lib/db/postgres';

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
  invite_cover_image_url?: string | null;
};

export type PublicAttendanceListPayload = {
  meeting: PublicAttendanceListMeeting;
  count_confirmed: number;
  count_guests: number;
  is_expired: boolean;
  public_summary_only: true;
};

export async function getMeetingBySlugOrToken(identifier: string) {
  // Identifier can be slug (new) or UUID token (legacy).
  // We try slug first; if not found, fall back to token.
  const meeting = await queryOne<{
    id: string;
    title: string | null;
    meeting_date: string;
    meeting_time: string | null;
    location: string | null;
    notes: string | null;
    attendance_list_deadline: string | null;
    attendance_list_mode: AttendanceListMode | null;
    invite_cover_image_url: string | null;
  }>(
    `SELECT id, title, meeting_date, meeting_time, location, notes,
            attendance_list_deadline,
            COALESCE(attendance_list_mode, 'prefilled') as attendance_list_mode,
            invite_cover_image_url
     FROM meetings
     WHERE (attendance_list_slug = $1 OR attendance_list_token::text = $1)
       AND is_cancelled = FALSE`,
    [identifier]
  );
  return meeting ?? null;
}

export function isMeetingExpired(deadline: string | null): boolean {
  return (
    deadline !== null &&
    !Number.isNaN(new Date(deadline).getTime()) &&
    new Date() > new Date(deadline)
  );
}

export async function getPublicAttendanceList(identifier: string): Promise<PublicAttendanceListPayload | null> {
  const meeting = await getMeetingBySlugOrToken(identifier);
  if (!meeting) return null;

  const expired = isMeetingExpired(meeting.attendance_list_deadline);

  const meetingPayload: PublicAttendanceListMeeting = {
    id: meeting.id,
    title: meeting.title,
    meeting_date: meeting.meeting_date,
    meeting_time: meeting.meeting_time,
    location: meeting.location,
    notes: meeting.notes,
    attendance_list_deadline: meeting.attendance_list_deadline,
    attendance_list_mode: meeting.attendance_list_mode ?? 'prefilled',
    invite_cover_image_url: meeting.invite_cover_image_url,
  };

  // Counts:
  // - prefilled: confirmed = responses with status='present'
  // - open: confirmed = public entries count
  const confirmedRow = await queryOne<{ c: string }>(
    meetingPayload.attendance_list_mode === 'open'
      ? `SELECT COUNT(*)::text as c FROM attendance_list_public_entries WHERE meeting_id = $1`
      : `SELECT COUNT(*) FILTER (WHERE status = 'present')::text as c
         FROM attendance_list_responses WHERE meeting_id = $1`,
    [meeting.id]
  );

  const guestsRow = await queryOne<{ c: string }>(
    `SELECT COUNT(*)::text as c FROM attendance_list_guests WHERE meeting_id = $1`,
    [meeting.id]
  ).catch(() => ({ c: '0' }));

  return {
    meeting: meetingPayload,
    count_confirmed: parseInt(confirmedRow?.c ?? '0', 10),
    count_guests: parseInt(guestsRow?.c ?? '0', 10),
    is_expired: expired,
    public_summary_only: true,
  };
}

export async function publicConfirmPrefilledByPhoneOrEmail(args: {
  identifier: string;
  phone?: string;
  email?: string;
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

  const phoneVal = typeof args.phone === 'string' ? args.phone.replace(/\D/g, '').trim() : '';
  const emailVal = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  const hasPhone = phoneVal.length >= 10;
  const hasEmail = emailVal && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);

  if (!hasPhone && !hasEmail) {
    return { error: 'Informe um telefone (com DDD) ou um e-mail válido.', status: 400 };
  }

  // Find member within the meeting's group.
  // Phone is required in members schema; we match by normalized digits.
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

  await query(
    `INSERT INTO attendance_list_responses (meeting_id, member_id, status, email, phone)
     VALUES ($1, $2, 'present', $3, $4)
     ON CONFLICT (meeting_id, member_id) DO UPDATE SET status = 'present', email = $3, phone = $4`,
    [meeting.id, member.id, hasEmail ? emailVal : null, hasPhone ? phoneVal : null]
  );

  return { ok: true, status: 200 };
}

export async function publicCreateOpenEntry(args: {
  identifier: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
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

  const firstName = typeof args.first_name === 'string' ? args.first_name.trim() : '';
  const lastName = typeof args.last_name === 'string' ? args.last_name.trim() : '';
  const emailVal = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  const phoneVal = typeof args.phone === 'string' ? args.phone.replace(/\D/g, '').trim() : '';
  const hasEmail = emailVal && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
  const hasPhone = phoneVal.length >= 10;

  if (!firstName) return { error: 'Informe o nome.', status: 400 };
  if (!lastName) return { error: 'Informe o sobrenome.', status: 400 };
  if (!hasEmail && !hasPhone) {
    return { error: 'Informe um e-mail válido ou telefone (com DDD).', status: 400 };
  }

  await query(
    `INSERT INTO attendance_list_public_entries (meeting_id, first_name, last_name, email, phone)
     VALUES ($1, $2, $3, $4, $5)`,
    [meeting.id, firstName, lastName, hasEmail ? emailVal : null, hasPhone ? phoneVal : null]
  );

  return { ok: true, status: 201 };
}

