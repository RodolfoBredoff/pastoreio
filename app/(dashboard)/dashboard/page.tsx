import { redirect } from 'next/navigation';
import { getCurrentLeader, getGroupStats } from '@/lib/db/queries';
import { queryOne } from '@/lib/db/postgres';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { Bell } from 'lucide-react';
import Link from 'next/link';

export default async function DashboardPage() {
  const leader = await getCurrentLeader();

  // Coordinators have their own panel
  if (leader?.role === 'coordinator') {
    redirect('/org/dashboard');
  }

  if (!leader?.group_id) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-3xl font-bold">Bem-vindo!</h1>
        <p className="text-muted-foreground">
          O dashboard só aparece quando seu usuário está vinculado a um grupo.
        </p>
        <p className="text-sm text-muted-foreground">
          Entre em contato com o administrador para vincular seu usuário a um grupo.
        </p>
      </div>
    );
  }

  const [group, stats] = await Promise.all([
    queryOne<{ name: string }>(
      `SELECT name FROM groups WHERE id = $1`,
      [leader.group_id]
    ),
    getGroupStats(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">{group?.name ?? 'Meu Grupo'}</p>
        </div>
        <Link
          href="/alertas"
          className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm
                     text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        >
          <Bell className="h-4 w-4" />
          Alertas
        </Link>
      </div>

      <StatsCards
        totalMembers={stats.totalMembers}
        totalParticipants={stats.participants}
      />
    </div>
  );
}
