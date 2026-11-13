'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PresenceChecklist } from './presence-checklist';
import { MeetingReport, type MeetingReportData } from './meeting-report';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate, getDayOfWeekName } from '@/lib/utils';
import { Calendar, AlertTriangle } from 'lucide-react';
import { describeMeetingDate } from '@/lib/meeting-date';

interface Meeting extends MeetingReportData {
  id: string;
  meeting_date: string;
  title: string | null;
  meeting_time: string | null;
  is_cancelled: boolean;
}

interface Member {
  id: string;
  full_name: string;
}

interface Attendance {
  member_id: string;
  is_present: boolean;
}

export interface GuestVisitor {
  id: string;
  group_id: string;
  full_name: string;
  phone: string | null;
  description?: string | null;
  has_photo?: boolean;
  created_at?: string;
}

interface ChamadaWithSelectorProps {
  meetings: Meeting[];
  members: Member[];
  /** Hoje (YYYY-MM-DD) no fuso do app, calculado no servidor */
  today: string;
  defaultMeetingId: string;
  defaultAttendance: Attendance[];
  defaultGuests?: GuestVisitor[];
  onMembersRefresh?: () => void;
}

export function ChamadaWithSelector({
  meetings,
  members,
  today,
  defaultMeetingId,
  defaultAttendance,
  defaultGuests = [],
  onMembersRefresh,
}: ChamadaWithSelectorProps) {
  const router = useRouter();
  const [selectedMeetingId, setSelectedMeetingId] = useState(defaultMeetingId);
  const [attendance, setAttendance] = useState<Attendance[]>(defaultAttendance);
  const [guests, setGuests] = useState<GuestVisitor[]>(defaultGuests);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  const handleConvertToMember = () => {
    router.refresh();
    onMembersRefresh?.();
  };

  const selectedMeeting = meetings.find((m) => m.id === selectedMeetingId);

  const fetchAttendance = (meetingId: string) => {
    return fetch(`/api/attendance?meeting_id=${meetingId}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { attendance: [], guests: [] }))
      .then((data: { attendance?: Attendance[]; guests?: GuestVisitor[] }) => ({
        attendance: Array.isArray(data.attendance) ? data.attendance : [],
        guests: Array.isArray(data.guests) ? data.guests : [],
      }));
  };

  useEffect(() => {
    if (selectedMeetingId === defaultMeetingId) {
      setAttendance(defaultAttendance);
      setGuests(defaultGuests);
      return;
    }
    setLoadingAttendance(true);
    fetchAttendance(selectedMeetingId)
      .then(({ attendance: a, guests: g }) => {
        setAttendance(a);
        setGuests(g);
      })
      .catch(() => {
        setAttendance([]);
        setGuests([]);
      })
      .finally(() => setLoadingAttendance(false));
  }, [selectedMeetingId, defaultMeetingId, defaultAttendance, defaultGuests]);

  const handleSaved = () => {
    if (!selectedMeetingId) return;
    fetchAttendance(selectedMeetingId).then(({ attendance: a, guests: g }) => {
      setAttendance(a);
      setGuests(g);
    });
  };

  if (meetings.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-lg">Nenhum encontro cadastrado.</p>
        <p className="text-muted-foreground mt-2">
          Crie encontros na agenda primeiro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Selecione o encontro
        </label>
        <select
          value={selectedMeetingId}
          onChange={(e) => setSelectedMeetingId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {meetings.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title
                ? `${m.title} — ${formatDate(m.meeting_date)}`
                : formatDate(m.meeting_date)}
            </option>
          ))}
        </select>
      </div>

      {selectedMeeting && (
        <>
          {(() => {
            const info = describeMeetingDate(selectedMeeting.meeting_date, today);
            return (
              <div
                role="status"
                data-testid="meeting-banner"
                className={
                  info.isFuture
                    ? 'rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900'
                    : 'rounded-md border bg-muted/40 p-3 text-sm'
                }
              >
                <p className="font-semibold text-base">
                  {selectedMeeting.title || 'Encontro'}
                </p>
                <p>
                  {getDayOfWeekName(new Date(`${selectedMeeting.meeting_date.slice(0, 10)}T12:00:00`).getDay())},{' '}
                  {formatDate(selectedMeeting.meeting_date)}
                  {selectedMeeting.meeting_time && (
                    <span> — {selectedMeeting.meeting_time.toString().substring(0, 5)}</span>
                  )}
                  <span className="ml-2 font-medium">({info.relativeLabel})</span>
                </p>
                {info.isFuture && (
                  <p className="mt-1 flex items-start gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    Este encontro ainda não aconteceu. Confirme se é o encontro certo antes de salvar.
                  </p>
                )}
              </div>
            );
          })()}

          {members.length > 0 ? (
            loadingAttendance ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando presenças...
              </div>
            ) : (
              <PresenceChecklist
                meetingId={selectedMeeting.id}
                meetingLabel={`${selectedMeeting.title ? selectedMeeting.title + ' — ' : ''}${formatDate(selectedMeeting.meeting_date)}`}
                isFutureMeeting={describeMeetingDate(selectedMeeting.meeting_date, today).isFuture}
                members={members}
                attendance={attendance}
                guests={guests}
                onSaved={handleSaved}
                onConvertToMember={handleConvertToMember}
              />
            )
          ) : (
            <div className="text-center py-12 border rounded-lg">
              <p className="text-lg">Nenhum membro cadastrado no grupo.</p>
              <p className="text-muted-foreground mt-2">
                Cadastre pessoas primeiro para fazer a chamada.
              </p>
            </div>
          )}

          <MeetingReport key={selectedMeeting.id} meetingId={selectedMeeting.id} initial={selectedMeeting} />
        </>
      )}
    </div>
  );
}
