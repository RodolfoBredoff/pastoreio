import { getCurrentLeader } from '@/lib/db/queries';
import { queryOne, queryMany } from '@/lib/db/postgres';
import { AgendaClient } from '@/components/agenda/agenda-client';

type MeetingRow = {
  id: string;
  group_id: string;
  meeting_date: string;
  meeting_time: string | null;
  is_cancelled: boolean;
  title: string | null;
  notes: string | null;
  meeting_type: 'regular' | 'special_event';
  created_at: string;
  location: string | null;
  attendance_list_token?: string | null;
  attendance_list_deadline?: string | null;
  attendance_list_slug?: string | null;
  attendance_list_mode?: 'prefilled' | 'open' | null;
  invite_cover_image_url?: string | null;
};

type PastMeetingRow = MeetingRow & {
  attendance_count: number;
};

export default async function AgendaPage() {
  const leader = await getCurrentLeader();

  if (!leader?.group_id) {
    return <div>Grupo não encontrado.</div>;
  }

  // Verificar se a coluna attendance_list_token existe (migration 011)
  const hasAttendanceListColumn = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'attendance_list_token'
     ) as exists`
  ).then((r) => r?.exists === true);

  // Verificar se a coluna attendance_list_deadline existe (migration 014)
  const hasAttendanceDeadlineColumn = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'attendance_list_deadline'
     ) as exists`
  ).then((r) => r?.exists === true);

  const hasAttendanceSlugColumn = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'attendance_list_slug'
     ) as exists`
  ).then((r) => r?.exists === true);
  // #region agent log
  fetch('http://127.0.0.1:7855/ingest/9ae56e2b-dd3e-4c99-8d52-723e69ab8fcd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'790123'},body:JSON.stringify({sessionId:'790123',location:'agenda/page.tsx:50',message:'Column checks',data:{hasAttendanceSlugColumn,hasAttendanceModeColumn:undefined,hasInviteCoverColumn:undefined},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion

  const hasAttendanceModeColumn = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'attendance_list_mode'
     ) as exists`
  ).then((r) => r?.exists === true);

  const hasInviteCoverColumn = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'invite_cover_image_url'
     ) as exists`
  ).then((r) => r?.exists === true);

  const groupPromise = queryOne<{ default_meeting_day: number; default_meeting_time: string }>(
    `SELECT default_meeting_day, default_meeting_time FROM groups WHERE id = $1`,
    [leader.group_id]
  );

  const meetingsPromise = hasAttendanceListColumn
    ? queryMany<MeetingRow>(
        `SELECT id, group_id, meeting_date, meeting_time, is_cancelled, title, notes, meeting_type, created_at, location, attendance_list_token${
          hasAttendanceDeadlineColumn ? ', attendance_list_deadline' : ''
        }${
          hasAttendanceSlugColumn ? ', attendance_list_slug' : ''
        }${
          hasAttendanceModeColumn ? ', attendance_list_mode' : ''
        }${
          hasInviteCoverColumn ? ', invite_cover_image_url' : ''
        }
         FROM meetings
         WHERE group_id = $1 AND meeting_date >= CURRENT_DATE AND is_cancelled = FALSE
         ORDER BY meeting_date ASC LIMIT 30`,
        [leader.group_id]
      )
    : queryMany<MeetingRow>(
        `SELECT id, group_id, meeting_date, meeting_time, is_cancelled, title, notes, meeting_type, created_at, location
         FROM meetings
         WHERE group_id = $1 AND meeting_date >= CURRENT_DATE AND is_cancelled = FALSE
         ORDER BY meeting_date ASC LIMIT 30`,
        [leader.group_id]
      ).then((rows) =>
        rows.map((r) => ({
          ...r,
          attendance_list_token: null as string | null,
          attendance_list_deadline: null as string | null,
          attendance_list_slug: null as string | null,
          attendance_list_mode: null as 'prefilled' | 'open' | null,
          invite_cover_image_url: null as string | null,
        }))
      );

  const pastMeetingsPromise = hasAttendanceListColumn
    ? queryMany<PastMeetingRow>(
        `SELECT m.id, m.group_id, m.meeting_date, m.meeting_time, m.is_cancelled,
                m.title, m.notes, m.meeting_type, m.created_at, m.location, m.attendance_list_token${
                  hasAttendanceDeadlineColumn ? ', m.attendance_list_deadline' : ''
                }${
                  hasAttendanceSlugColumn ? ', m.attendance_list_slug' : ''
                }${
                  hasAttendanceModeColumn ? ', m.attendance_list_mode' : ''
                }${
                  hasInviteCoverColumn ? ', m.invite_cover_image_url' : ''
                },
                (COUNT(a.id)::int + COALESCE(MAX(ag.guest_count), 0)) as attendance_count
         FROM meetings m
         LEFT JOIN attendance a ON a.meeting_id = m.id
         LEFT JOIN (SELECT meeting_id, COUNT(*)::int as guest_count FROM attendance_guests GROUP BY meeting_id) ag ON ag.meeting_id = m.id
         WHERE m.group_id = $1 AND m.meeting_date < CURRENT_DATE
         GROUP BY m.id, m.group_id, m.meeting_date, m.meeting_time, m.is_cancelled,
                  m.title, m.notes, m.meeting_type, m.created_at, m.attendance_list_token${
                    hasAttendanceDeadlineColumn ? ', m.attendance_list_deadline' : ''
                  }${
                    hasAttendanceSlugColumn ? ', m.attendance_list_slug' : ''
                  }${
                    hasAttendanceModeColumn ? ', m.attendance_list_mode' : ''
                  }${
                    hasInviteCoverColumn ? ', m.invite_cover_image_url' : ''
                  }
         ORDER BY m.meeting_date DESC LIMIT 10`,
        [leader.group_id]
      )
    : queryMany<{ attendance_count: number } & Omit<PastMeetingRow, 'attendance_list_token'>>(
        `SELECT m.id, m.group_id, m.meeting_date, m.meeting_time, m.is_cancelled,
                m.title, m.notes, m.meeting_type, m.created_at, m.location,
                (COUNT(a.id)::int + COALESCE(MAX(ag.guest_count), 0)) as attendance_count
         FROM meetings m
         LEFT JOIN attendance a ON a.meeting_id = m.id
         LEFT JOIN (SELECT meeting_id, COUNT(*)::int as guest_count FROM attendance_guests GROUP BY meeting_id) ag ON ag.meeting_id = m.id
         WHERE m.group_id = $1 AND m.meeting_date < CURRENT_DATE
         GROUP BY m.id, m.group_id, m.meeting_date, m.meeting_time, m.is_cancelled,
                  m.title, m.notes, m.meeting_type, m.created_at, m.location
         ORDER BY m.meeting_date DESC LIMIT 10`,
        [leader.group_id]
      ).then((rows) =>
        rows.map((r) => ({
          ...r,
          attendance_list_token: null as string | null,
          attendance_list_deadline: null as string | null,
          attendance_list_slug: null as string | null,
          attendance_list_mode: null as 'prefilled' | 'open' | null,
          invite_cover_image_url: null as string | null,
        }))
      );

  const membersPromise = queryMany<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM members WHERE group_id = $1 AND is_active = TRUE ORDER BY full_name ASC`,
    [leader.group_id]
  );

  const [group, meetings, pastMeetings, members] = await Promise.all([
    groupPromise,
    meetingsPromise,
    pastMeetingsPromise,
    membersPromise,
  ]);
  // #region agent log
  fetch('http://127.0.0.1:7855/ingest/9ae56e2b-dd3e-4c99-8d52-723e69ab8fcd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'790123'},body:JSON.stringify({sessionId:'790123',location:'agenda/page.tsx:167',message:'Fetched meetings data',data:{meetingsCount:meetings.length,firstMeeting:meetings[0]||null,hasSlugInFirst:meetings[0]?.attendance_list_slug||null},timestamp:Date.now(),hypothesisId:'H2,H5'})}).catch(()=>{});
  // #endregion

  if (!group) {
    return <div>Configuração do grupo não encontrada.</div>;
  }

  const pastMeetingsWithAttendance = pastMeetings.map((m) => ({
    ...m,
    attendanceCount: m.attendance_count,
  }));

  // Both leaders and secretaries can edit meetings; only leader manages group settings
  const canSettings = leader.role !== 'secretary';

  return (
    <AgendaClient
      meetings={meetings}
      pastMeetings={pastMeetingsWithAttendance}
      group={group}
      members={members}
      readOnly={false}
      canEdit={true}
      canSettings={canSettings}
    />
  );
}
