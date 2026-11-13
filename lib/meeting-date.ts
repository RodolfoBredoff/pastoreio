/**
 * Helpers de data para a tela de chamada. Funções puras (sem acesso a relógio ou banco):
 * quem chama informa "hoje" no formato YYYY-MM-DD.
 */

export const APP_TIME_ZONE = 'America/Sao_Paulo';

/** Data de hoje (YYYY-MM-DD) no fuso do app, independente do fuso do servidor/navegador. */
export function todayInAppTimeZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function dayNumber(date: string): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Diferença em dias entre a data do encontro e hoje (positivo = futuro). */
export function diffDaysFromToday(meetingDate: string, today: string): number {
  return dayNumber(meetingDate) - dayNumber(today);
}

export interface MeetingDateInfo {
  diffDays: number;
  isFuture: boolean;
  isToday: boolean;
  /** "hoje", "amanhã", "ontem", "daqui a 16 dias", "há 3 dias" */
  relativeLabel: string;
}

export function describeMeetingDate(meetingDate: string, today: string): MeetingDateInfo {
  const diffDays = diffDaysFromToday(meetingDate, today);
  let relativeLabel: string;
  if (diffDays === 0) relativeLabel = 'hoje';
  else if (diffDays === 1) relativeLabel = 'amanhã';
  else if (diffDays === -1) relativeLabel = 'ontem';
  else if (diffDays > 1) relativeLabel = `daqui a ${diffDays} dias`;
  else relativeLabel = `há ${-diffDays} dias`;
  return { diffDays, isFuture: diffDays > 0, isToday: diffDays === 0, relativeLabel };
}

/**
 * Encontro que a chamada deve abrir por padrão:
 * 1) o de hoje; 2) o mais recente que já aconteceu; 3) o mais próximo no futuro.
 * Nunca o futuro mais distante (a lista vem em ordem decrescente de data).
 */
export function pickDefaultMeetingId<T extends { id: string; meeting_date: string }>(
  meetings: T[],
  today: string,
  requestedId?: string | null
): string | null {
  if (meetings.length === 0) return null;
  if (requestedId && meetings.some((m) => m.id === requestedId)) return requestedId;

  const sameDay = meetings.find((m) => m.meeting_date.slice(0, 10) === today);
  if (sameDay) return sameDay.id;

  const past = meetings
    .filter((m) => m.meeting_date.slice(0, 10) < today)
    .sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : -1));
  if (past.length > 0) return past[0].id;

  const future = [...meetings].sort((a, b) => (a.meeting_date < b.meeting_date ? -1 : 1));
  return future[0].id;
}
