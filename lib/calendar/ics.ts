/**
 * Gerador de arquivos .ics (RFC 5545) para exportação de calendário.
 * Funciona com Google Calendar, Apple Calendar e Outlook — sem OAuth.
 */

interface MeetingForICS {
  id: string;
  meeting_date: string;
  meeting_time: string | null;
  title: string | null;
  notes: string | null;
  location?: string | null;
}

function escapeICS(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function formatICSDate(dateStr: string, timeStr: string | null): string {
  const [year, month, day] = dateStr.split('-');
  if (!timeStr) {
    return `${year}${month}${day}`;
  }
  const [hour, minute] = timeStr.split(':');
  return `${year}${month}${day}T${hour}${minute}00`;
}

function formatICSDateEnd(dateStr: string, timeStr: string | null): string {
  if (!timeStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${dd}`;
  }
  const [year, month, day] = dateStr.split('-');
  const [hour, minute] = timeStr.split(':');
  const endHour = (parseInt(hour) + 2) % 24;
  return `${year}${month}${day}T${String(endHour).padStart(2, '0')}${minute}00`;
}

function generateVEVENT(meeting: MeetingForICS, groupName: string): string {
  const dtstart = formatICSDate(meeting.meeting_date, meeting.meeting_time);
  const dtend = formatICSDateEnd(meeting.meeting_date, meeting.meeting_time);
  const isAllDay = !meeting.meeting_time;

  const title = meeting.title
    ? `${escapeICS(meeting.title)} — ${escapeICS(groupName)}`
    : `Encontro — ${escapeICS(groupName)}`;

  const lines = [
    'BEGIN:VEVENT',
    `UID:${meeting.id}@pequenos-grupos`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    isAllDay ? `DTSTART;VALUE=DATE:${dtstart}` : `DTSTART:${dtstart}`,
    isAllDay ? `DTEND;VALUE=DATE:${dtend}` : `DTEND:${dtend}`,
    `SUMMARY:${title}`,
  ];

  if (meeting.notes) {
    lines.push(`DESCRIPTION:${escapeICS(meeting.notes)}`);
  }

  if (meeting.location) {
    lines.push(`LOCATION:${escapeICS(meeting.location)}`);
  }

  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

export function generateICS(meetings: MeetingForICS[], groupName: string): string {
  const vevents = meetings.map((m) => generateVEVENT(m, groupName)).join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Pequenos Grupos//${groupName}//PT`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(groupName)}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
    vevents,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function generateSingleICS(meeting: MeetingForICS, groupName: string): string {
  return generateICS([meeting], groupName);
}
