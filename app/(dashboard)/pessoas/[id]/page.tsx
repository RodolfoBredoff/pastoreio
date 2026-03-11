import { getCurrentLeader, getMemberById, getMembersByLeaderGroup } from '@/lib/db/queries';
import { canDeleteMembers, canManageDiscipleship } from '@/lib/auth/permissions';
import { PessoaForm } from '@/components/pessoas/pessoa-form';
import { MemberAttendanceStats } from '@/components/pessoas/member-attendance-stats';
import { DeleteMemberButton } from '@/components/pessoas/delete-member-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notFound } from 'next/navigation';

export default async function EditarPessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [leader, member, allMembers] = await Promise.all([
    getCurrentLeader(),
    getMemberById(id),
    getMembersByLeaderGroup(),
  ]);

  if (!leader?.group_id) {
    return <div>Grupo não encontrado.</div>;
  }

  if (!member) {
    notFound();
  }

  const canDelete = canDeleteMembers(leader.role);
  const canDiscipleship = canManageDiscipleship(leader.role);
  const otherMembers = (allMembers ?? []).map((m) => ({ id: m.id, full_name: m.full_name }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Editar Pessoa</h1>
          <p className="text-muted-foreground">{member.full_name}</p>
        </div>
        <DeleteMemberButton
          memberId={id}
          memberName={member.full_name}
          canDelete={canDelete}
        />
      </div>

      {(member.discipulador_full_name || (member.discipulador_de?.length ?? 0) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Discipulado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {member.discipulador_full_name && (
              <p>
                <span className="text-muted-foreground">Discipulado por:</span>{' '}
                {member.discipulador_full_name}
              </p>
            )}
            {(member.discipulador_de?.length ?? 0) > 0 && (
              <p>
                <span className="text-muted-foreground">Discipulador de:</span>{' '}
                {member.discipulador_de!.join(', ')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <MemberAttendanceStats memberId={id} />

      <Card>
        <CardHeader>
          <CardTitle>Informações da Pessoa</CardTitle>
        </CardHeader>
        <CardContent>
          <PessoaForm
            groupId={leader.group_id}
            initialData={member}
            otherMembers={otherMembers}
            canManageDiscipleship={canDiscipleship}
          />
        </CardContent>
      </Card>
    </div>
  );
}
