'use client';

import { useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addHours } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import 'react-big-calendar/lib/css/react-big-calendar.css';

export interface AgendaMeeting {
  id: string;
  meeting_date: string;
  meeting_time: string | null;
  title: string | null;
  is_cancelled: boolean;
  meeting_type: 'regular' | 'special_event';
}

interface AgendaCalendarEvent {
  start: Date;
  end: Date;
  title: string;
  resource: AgendaMeeting;
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 0 }),
  getDay,
  locales: { 'pt-BR': ptBR },
});

function meetingToEvent(
  meeting: AgendaMeeting,
  defaultTime: string
): AgendaCalendarEvent {
  const [h = 19, m = 0] = (meeting.meeting_time || defaultTime)
    .substring(0, 5)
    .split(':')
    .map(Number);
  const start = new Date(meeting.meeting_date + 'T00:00:00');
  start.setHours(h, m, 0, 0);
  const end = addHours(start, 1);
  return {
    start,
    end,
    title: meeting.title || 'Reunião',
    resource: meeting,
  };
}

interface AgendaCalendarProps {
  meetings: AgendaMeeting[];
  pastMeetings: AgendaMeeting[];
  defaultTime: string;
  onSelectEvent: (meeting: AgendaMeeting) => void;
  onSelectSlot?: (date: Date) => void;
}

export function AgendaCalendar({
  meetings,
  pastMeetings,
  defaultTime,
  onSelectEvent,
  onSelectSlot,
}: AgendaCalendarProps) {
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<View>('month');

  const events: AgendaCalendarEvent[] = useMemo(() => {
    const all = [...(meetings || []), ...(pastMeetings || [])];
    return all
      .filter((m) => !m.is_cancelled)
      .map((m) => meetingToEvent(m, defaultTime));
  }, [meetings, pastMeetings, defaultTime]);

  return (
    <div className="h-[500px] rounded-lg border bg-card p-2">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        titleAccessor="title"
        date={date}
        onNavigate={setDate}
        view={view}
        onView={setView}
        onSelectEvent={(evt: AgendaCalendarEvent) => onSelectEvent(evt.resource)}
        onSelectSlot={
          onSelectSlot
            ? (slot) => onSelectSlot(slot.start)
            : undefined
        }
        selectable={!!onSelectSlot}
        messages={{
          today: 'Hoje',
          previous: 'Anterior',
          next: 'Próximo',
          month: 'Mês',
          week: 'Semana',
          day: 'Dia',
          agenda: 'Agenda',
          date: 'Data',
          time: 'Hora',
          event: 'Evento',
          noEventsInRange: 'Nenhum encontro neste período.',
        }}
      />
    </div>
  );
}
