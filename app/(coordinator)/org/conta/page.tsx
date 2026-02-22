import { requireCoordinator } from '@/lib/auth/coordinator-session';
import { queryOne } from '@/lib/db/postgres';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserCircle } from 'lucide-react';
import { ChangePasswordForm } from '@/components/account/change-password-form';
import { getSession } from '@/lib/auth/session';

export default async function CoordContaPage() {
  const [coordinator, session] = await Promise.all([
    requireCoordinator(),
    getSession(),
  ]);

  const [user, org] = await Promise.all([
    queryOne<{ password_hash: string | null; must_change_password: boolean | null }>(
      `SELECT password_hash, must_change_password FROM users WHERE id = $1`,
      [session!.id]
    ),
    queryOne<{ name: string }>(
      `SELECT name FROM organizations WHERE id = $1`,
      [coordinator.organization_id]
    ),
  ]);
  const mustChangePassword = user?.must_change_password === true;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold mb-2">Minha Conta</h1>
        <p className="text-muted-foreground">Gerencie suas informações e segurança</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCircle className="h-4 w-4" />
            Informações do Perfil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <p className="text-sm text-muted-foreground">Nome</p>
            <p className="font-medium">{coordinator.full_name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">E-mail</p>
            <p className="font-medium">{coordinator.email}</p>
          </div>
          {org && (
            <div>
              <p className="text-sm text-muted-foreground">Organização</p>
              <p className="font-medium">{org.name}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">Função</p>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">Coordenador(a)</Badge>
          </div>
        </CardContent>
      </Card>

      <ChangePasswordForm
        hasExistingPassword={!!user?.password_hash}
        mustChangePassword={mustChangePassword}
      />
    </div>
  );
}
