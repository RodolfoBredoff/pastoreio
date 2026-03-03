import { getCurrentLeader, getMembersByLeaderGroup } from '@/lib/db/queries';
import { canDeleteMembers } from '@/lib/auth/permissions';
import { PessoaCard } from '@/components/pessoas/pessoa-card';
import { BroadcastDialogClient } from '@/components/pessoas/broadcast-dialog-client';
import { LinkButton } from '@/components/ui/link-button';
import { UserPlus, Users } from 'lucide-react';

export default async function PessoasPage() {
  const [leader, members] = await Promise.all([
    getCurrentLeader(),
    getMembersByLeaderGroup(),
  ]);
  const canDelete = leader ? canDeleteMembers(leader.role) : false;

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Pessoas</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {members?.length || 0} {members?.length === 1 ? 'pessoa' : 'pessoas'} no grupo
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {members && members.length > 0 && (
            <BroadcastDialogClient members={members} />
          )}
          <LinkButton href="/pessoas/novo" className="w-full sm:w-auto">
            <UserPlus className="mr-2 h-4 w-4 shrink-0" />
            Nova Pessoa
          </LinkButton>
        </div>
      </div>

      {members && members.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <PessoaCard key={member.id} member={member} canDelete={canDelete} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma pessoa cadastrada</h3>
          <p className="text-muted-foreground mb-4">
            Comece adicionando membros ao seu grupo
          </p>
          <LinkButton href="/pessoas/novo">
            <UserPlus className="mr-2 h-4 w-4" />
            Cadastrar Primeira Pessoa
          </LinkButton>
        </div>
      )}
    </div>
  );
}
