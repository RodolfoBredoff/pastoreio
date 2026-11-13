import { getCurrentLeader } from '@/lib/db/queries';
import { getMeetingsForPresence, getMembersByLeaderGroup, getAttendanceByMeeting, getAttendanceGuestsByMeeting } from '@/lib/db/queries';
import { ChamadaWithSelector } from '@/components/chamada/chamada-with-selector';
import { formatDate } from '@/lib/utils';
import { pickDefaultMeetingId, todayInAppTimeZone } from '@/lib/meeting-date';

export default async function ChamadaPage({
  searchParams,
}: {
  searchParams: Promise<{ meeting?: string }>;
}) {
  const { meeting: requestedMeetingId } = await searchParams;
  const leader = await getCurrentLeader();

  if (!leader?.group_id) {
    return <div>Grupo não encontrado.</div>;
  }

  const [meetings, members] = await Promise.all([
    getMeetingsForPresence(50),
    getMembersByLeaderGroup(),
  ]);

  const today = todayInAppTimeZone();

  // ?meeting=<id> (link do lembrete) > encontro de hoje > mais recente que já aconteceu.
  // Nunca abre por padrão o encontro mais distante no futuro.
  const defaultMeetingId = pickDefaultMeetingId(meetings, today, requestedMeetingId);
  const defaultMeeting = meetings.find((m) => m.id === defaultMeetingId);

  if (!defaultMeeting) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Chamada</h1>
        <div className="text-center py-12 border rounded-lg">
          <p className="text-lg">Nenhum encontro cadastrado.</p>
          <p className="text-muted-foreground mt-2">
            Crie encontros na agenda primeiro.
          </p>
        </div>
      </div>
    );
  }

  const [attendance, defaultGuests] = await Promise.all([
    getAttendanceByMeeting(defaultMeeting.id),
    getAttendanceGuestsByMeeting(defaultMeeting.id),
  ]);

  const attendanceForClient = attendance.map((a) => ({
    member_id: a.member_id,
    is_present: a.is_present,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Chamada</h1>
        <p className="text-muted-foreground">
          Selecione o encontro e registre a presença dos participantes
        </p>
      </div>

      <ChamadaWithSelector
        meetings={meetings.map((m) => ({
          id: m.id,
          meeting_date: m.meeting_date,
          title: m.title,
          meeting_time: m.meeting_time,
          is_cancelled: m.is_cancelled,
          report_prayer_requests: m.report_prayer_requests ?? null,
          report_offering: m.report_offering ?? null,
          report_notes: m.report_notes ?? null,
          report_updated_at: m.report_updated_at ?? null,
        }))}
        members={members.map((m) => ({ id: m.id, full_name: m.full_name }))}
        today={today}
        defaultMeetingId={defaultMeeting.id}
        defaultAttendance={attendanceForClient}
        defaultGuests={defaultGuests}
      />
    </div>
  );
}
