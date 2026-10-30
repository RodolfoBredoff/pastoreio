import { redirect } from 'next/navigation';
import { getCoordinatorSession } from '@/lib/auth/coordinator-session';
import { queryOne, queryMany } from '@/lib/db/postgres';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Group, Calendar, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { getPendingAttendance } from '@/lib/attendance-pending';
import { PendingAttendanceCard } from '@/components/dashboard/pending-attendance-card';

export default async function CoordinatorDashboardPage() {
  const coordinator = await getCoordinatorSession();
  if (!coordinator) redirect('/login');

  const [org, stats, recentGroups, pendingAttendance] = await Promise.all([
    queryOne<{ name: string }>(
      `SELECT name FROM organizations WHERE id = $1`,
      [coordinator.organization_id]
    ),
    queryOne<{
      total_groups: number;
      total_leaders: number;
      total_members: number;
      upcoming_meetings: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM groups WHERE organization_id = $1) AS total_groups,
         (SELECT COUNT(*)::int FROM leaders WHERE organization_id = $1 AND role IN ('leader','secretary')) AS total_leaders,
         (SELECT COUNT(*)::int FROM members m JOIN groups g ON g.id = m.group_id
          WHERE g.organization_id = $1 AND m.is_active = TRUE) AS total_members,
         (SELECT COUNT(*)::int FROM meetings mt JOIN groups g ON g.id = mt.group_id
          WHERE g.organization_id = $1 AND mt.meeting_date >= CURRENT_DATE AND mt.is_cancelled = FALSE) AS upcoming_meetings`,
      [coordinator.organization_id]
    ),
    queryMany<{
      id: string;
      name: string;
      member_count: number;
      leader_name: string | null;
    }>(
      `SELECT g.id, g.name,
              COUNT(DISTINCT m.id) FILTER (WHERE m.is_active = TRUE) AS member_count,
              l.full_name AS leader_name
       FROM groups g
       LEFT JOIN members m ON m.group_id = g.id
       LEFT JOIN leaders l ON l.group_id = g.id AND l.role = 'leader'
       WHERE g.organization_id = $1
       GROUP BY g.id, g.name, l.full_name
       ORDER BY g.name ASC
       LIMIT 10`,
      [coordinator.organization_id]
    ),
    getPendingAttendance({ organizationId: coordinator.organization_id }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{org?.name ?? 'Minha Organização'}</h1>
        <p className="text-muted-foreground mt-1">Visão geral da sua organização</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Grupos</CardTitle>
            <Group className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.total_groups ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Líderes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.total_leaders ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Membros</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.total_members ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Encontros</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.upcoming_meetings ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">agendados</p>
          </CardContent>
        </Card>
      </div>

      <PendingAttendanceCard items={pendingAttendance} variant="coordinator" />

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/org/grupos">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Group className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Gerenciar Grupos</CardTitle>
                  <p className="text-sm text-muted-foreground">Ver e editar todos os grupos</p>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/org/lideres">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Líderes e Secretários</CardTitle>
                  <p className="text-sm text-muted-foreground">Cadastrar e vincular líderes</p>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/org/engajamento">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Engajamento</CardTitle>
                  <p className="text-sm text-muted-foreground">Análise de presença</p>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {recentGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Group className="h-5 w-5" />
              Grupos da Organização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {recentGroups.map((group) => (
                <Link key={group.id} href={`/org/grupos/${group.id}`}>
                  <div className="flex items-center justify-between py-3 border-b last:border-0 hover:bg-muted/30 transition-colors px-1 rounded-md cursor-pointer gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{group.name}</p>
                      {group.leader_name && (
                        <p className="text-xs text-muted-foreground">Líder: {group.leader_name}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {group.member_count} membro{group.member_count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
