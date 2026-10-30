import { queryMany } from '@/lib/db/postgres';

export type PendingAttendanceMeeting = {
  meeting_id: string;
  meeting_date: string;
  title: string | null;
  group_id: string;
  group_name: string;
  leader_name: string | null;
  leader_phone: string | null;
};

/** Janela considerada para "chamada pendente" (dias para trás, sem contar hoje). */
export const PENDING_ATTENDANCE_DAYS = 14;

/**
 * Encontros regulares já realizados (últimos 14 dias) sem nenhuma presença registrada.
 * Filtra por grupo (líder) ou por organização (coordenador).
 */
export async function getPendingAttendance(
  filter: { groupId: string } | { organizationId: string }
): Promise<PendingAttendanceMeeting[]> {
  const byGroup = 'groupId' in filter;
  return queryMany<PendingAttendanceMeeting>(
    `SELECT mt.id AS meeting_id, mt.meeting_date::text AS meeting_date, mt.title,
            g.id AS group_id, g.name AS group_name,
            l.full_name AS leader_name, l.phone AS leader_phone
     FROM meetings mt
     JOIN groups g ON g.id = mt.group_id
     LEFT JOIN LATERAL (
       SELECT full_name, phone FROM leaders
       WHERE group_id = g.id AND role = 'leader'
       ORDER BY created_at NULLS LAST LIMIT 1
     ) l ON TRUE
     WHERE ${byGroup ? 'mt.group_id = $1' : 'g.organization_id = $1'}
       AND mt.is_cancelled = FALSE
       AND COALESCE(mt.meeting_type, 'regular') = 'regular'
       AND mt.meeting_date BETWEEN CURRENT_DATE - ${PENDING_ATTENDANCE_DAYS} AND CURRENT_DATE - 1
       AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.meeting_id = mt.id)
     ORDER BY g.name, mt.meeting_date DESC`,
    [byGroup ? filter.groupId : filter.organizationId]
  ).catch((e) => {
    console.error('[attendance-pending] erro:', e);
    return [];
  });
}

export function formatMeetingDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Link wa.me para o coordenador falar com o líder sobre a chamada pendente. */
export function whatsappReminderLink(p: PendingAttendanceMeeting): string | null {
  const digits = (p.leader_phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const phone = digits.length <= 11 ? `55${digits}` : digits;
  const first = (p.leader_name ?? '').split(' ')[0];
  const text =
    `Olá${first ? `, ${first}` : ''}! Tudo bem? A chamada do encontro de ` +
    `${formatMeetingDate(p.meeting_date)} do ${p.group_name} ainda não foi lançada no Pastoreio. ` +
    `Consegue lançar quando puder? Obrigado!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
