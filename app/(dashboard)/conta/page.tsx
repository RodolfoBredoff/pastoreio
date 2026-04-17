import { getCurrentLeader } from '@/lib/db/queries';
import { queryOne } from '@/lib/db/postgres';
import { Badge } from '@/components/ui/badge';
import { ChangePasswordForm } from '@/components/account/change-password-form';
import { ProfileForm } from '@/components/account/profile-form';
import { getSession } from '@/lib/auth/session';

const roleLabel: Record<string, string> = {
  leader: 'Líder',
  secretary: 'Secretário(a)',
  coordinator: 'Coordenador(a)',
};

export default async function ContaPage() {
  const [leader, session] = await Promise.all([
    getCurrentLeader(),
    getSession(),
  ]);

  if (!leader || !session) {
    return <div>Acesso negado.</div>;
  }

  const user = await queryOne<{ password_hash: string | null; must_change_password: boolean | null }>(
    `SELECT password_hash, must_change_password FROM users WHERE id = $1`,
    [session.id]
  );
  const mustChangePassword = user?.must_change_password === true;

  // Verifica se as credenciais WhatsApp estão configuradas no sistema (SSM já carregou para process.env)
  const whatsappEnabled = !!(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold mb-2">Minha Conta</h1>
        <p className="text-muted-foreground">Gerencie suas informações e segurança</p>
      </div>

      {/* E-mail e função — somente leitura (gerenciados pelo admin) */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">E-mail</p>
            <p className="text-sm font-medium">{leader.email}</p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {roleLabel[leader.role] ?? leader.role}
          </Badge>
        </div>
      </div>

      {/* Perfil editável: nome e telefone */}
      <ProfileForm
        initialName={leader.full_name}
        initialPhone={leader.phone}
        whatsappEnabled={whatsappEnabled}
      />

      <ChangePasswordForm
        hasExistingPassword={!!user?.password_hash}
        mustChangePassword={mustChangePassword}
      />
    </div>
  );
}
