import { redirect } from 'next/navigation';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryOne, queryMany } from '@/lib/db/postgres';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LeaderGroupSettingsForm } from '@/components/dashboard/leader-group-settings-form';
import { SecretarySection } from '@/components/configuracoes/secretary-section';
import { NotificationSettingsForm } from '@/components/configuracoes/notification-settings-form';

export default async function ConfiguracoesPage() {
  const leader = await getCurrentLeader();

  if (!leader?.group_id) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-3xl font-bold">Configurações do Grupo</h1>
        <p className="text-muted-foreground">
          Você não está vinculado a um grupo. Entre em contato com o administrador.
        </p>
      </div>
    );
  }

  // Secretários não têm acesso a esta página
  if (leader.role === 'secretary') {
    redirect('/dashboard');
  }

  const [group, secretaries] = await Promise.all([
    queryOne<{
      id: string;
      name: string;
      default_meeting_day: number;
      default_meeting_time: string;
      reminder_enabled: boolean;
      absence_whatsapp_enabled: boolean;
      weekly_summary_enabled: boolean;
    }>(
      `SELECT id, name, default_meeting_day, default_meeting_time,
              reminder_enabled, absence_whatsapp_enabled, weekly_summary_enabled
       FROM groups WHERE id = $1`,
      [leader.group_id]
    ),
    queryMany<{
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      created_at: string;
    }>(
      `SELECT id, full_name, email, phone, created_at
       FROM leaders
       WHERE group_id = $1 AND role = 'secretary'
       ORDER BY full_name ASC`,
      [leader.group_id]
    ),
  ]);

  if (!group) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-3xl font-bold">Configurações do Grupo</h1>
        <p className="text-muted-foreground">Grupo não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold mb-2">Configurações do Grupo</h1>
        <p className="text-muted-foreground">
          Gerencie as configurações do grupo <strong>{group.name}</strong>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dia e Horário das Reuniões</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaderGroupSettingsForm
            defaultMeetingDay={group.default_meeting_day}
            defaultMeetingTime={group.default_meeting_time}
          />
        </CardContent>
      </Card>

      <NotificationSettingsForm
        groupId={group.id}
        initialReminderEnabled={group.reminder_enabled ?? false}
        initialAbsenceWhatsappEnabled={group.absence_whatsapp_enabled ?? false}
        initialWeeklySummaryEnabled={group.weekly_summary_enabled ?? true}
      />

      <SecretarySection initialSecretaries={secretaries} />
    </div>
  );
}
