import { getCurrentLeader, getAllNotifications } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';
import { AlertasPanelFull } from '@/components/dashboard/alertas-panel-full';

export default async function AlertasPage() {
  const leader = await getCurrentLeader();

  if (!leader?.group_id) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-3xl font-bold">Alertas e Notificações</h1>
        <p className="text-muted-foreground">
          Nenhum grupo vinculado. Entre em contato com o administrador.
        </p>
      </div>
    );
  }

  const [notifications, upcomingMeetings, upcomingBirthdays] = await Promise.all([
    getAllNotifications(100),
    queryMany<{ id: string; meeting_date: string; title: string | null; meeting_time: string | null }>(
      `SELECT id, meeting_date, title, meeting_time
       FROM meetings
       WHERE group_id = $1
         AND meeting_date >= CURRENT_DATE
         AND is_cancelled = FALSE
       ORDER BY meeting_date ASC
       LIMIT 10`,
      [leader.group_id]
    ).catch(() => []),
    queryMany<{ id: string; full_name: string; birth_date: string; member_type: string; phone: string | null }>(
      `SELECT id, full_name, birth_date, member_type, phone
       FROM members
       WHERE group_id = $1
         AND is_active = TRUE
         AND birth_date IS NOT NULL
       ORDER BY
         CASE
           WHEN TO_DATE(
             TO_CHAR(CURRENT_DATE, 'YYYY') || TO_CHAR(birth_date, '-MM-DD'),
             'YYYY-MM-DD'
           ) >= CURRENT_DATE
           THEN TO_DATE(
             TO_CHAR(CURRENT_DATE, 'YYYY') || TO_CHAR(birth_date, '-MM-DD'),
             'YYYY-MM-DD'
           ) - CURRENT_DATE
           ELSE TO_DATE(
             TO_CHAR(CURRENT_DATE + INTERVAL '1 year', 'YYYY') || TO_CHAR(birth_date, '-MM-DD'),
             'YYYY-MM-DD'
           ) - CURRENT_DATE
         END
       LIMIT 10`,
      [leader.group_id]
    ).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Alertas e Notificações</h1>
        <p className="text-muted-foreground text-sm">
          Acompanhe faltantes, presenças, aniversários e notificações do grupo.
        </p>
      </div>

      <AlertasPanelFull
        notifications={notifications}
        upcomingMeetings={upcomingMeetings}
        upcomingBirthdays={upcomingBirthdays}
      />
    </div>
  );
}
