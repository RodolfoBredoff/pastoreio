import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getCoordinatorSession } from '@/lib/auth/coordinator-session';
import { queryOne } from '@/lib/db/postgres';
import { CoordinatorNav } from '@/components/coordinator/coordinator-nav';
import { ForceChangePasswordRedirect } from '@/components/dashboard/force-change-password-redirect';

export default async function CoordinatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  const coordinator = await getCoordinatorSession();

  if (!coordinator) {
    redirect('/dashboard');
  }

  const [org, userRow] = await Promise.all([
    queryOne<{ name: string }>(
      `SELECT name FROM organizations WHERE id = $1`,
      [coordinator.organization_id]
    ),
    queryOne<{ must_change_password: boolean | null }>(
      `SELECT must_change_password FROM users WHERE id = $1`,
      [user.id]
    ),
  ]);

  const mustChangePassword = userRow?.must_change_password === true;

  return (
    <div className="min-h-screen bg-background">
      <ForceChangePasswordRedirect mustChangePassword={mustChangePassword} />
      <header className="lg:hidden sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="font-semibold">{org?.name ?? 'Minha Organização'}</h1>
        </div>
      </header>

      <div className="flex">
        <CoordinatorNav
          orgName={org?.name ?? 'Minha Organização'}
          coordinatorName={coordinator.full_name || user.email || ''}
        />

        <main className="flex-1 min-w-0 w-full">
          <div className="container max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 pb-24 lg:pb-8">
            {children}
          </div>
        </main>
      </div>

      <div className="lg:hidden h-16 flex-shrink-0" />
    </div>
  );
}
