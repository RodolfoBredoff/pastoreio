import { getCurrentLeader, getMemberById, getMembersByLeaderGroup } from '@/lib/db/queries';
import { canDeleteMembers, canManageDiscipleship } from '@/lib/auth/permissions';
import { PessoaForm } from '@/components/pessoas/pessoa-form';
import { MemberAttendanceStats } from '@/components/pessoas/member-attendance-stats';
import { MemberTagsEditor } from '@/components/pessoas/member-tags-editor';
import { DeleteMemberButton } from '@/components/pessoas/delete-member-button';
import { ToggleMemberStatusButton } from '@/components/pessoas/toggle-member-status-button';
import { ContactLog } from '@/components/pessoas/contact-log';
import { VisitorStageCard } from '@/components/pessoas/visitor-stage-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
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
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
          <ToggleMemberStatusButton
            memberId={id}
            memberName={member.full_name}
            isActive={member.is_active}
          />
          <DeleteMemberButton
            memberId={id}
            memberName={member.full_name}
            canDelete={canDelete}
            isActive={member.is_active}
          />
        </div>
      </div>

      {!member.is_active && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="pt-6 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">Inativo</Badge>
            {member.deactivated_at ? (
              <span className="text-muted-foreground">
                Inativado em {formatDate(member.deactivated_at)}
              </span>
            ) : (
              <span className="text-muted-foreground">Sem data de inativação registrada</span>
            )}
          </CardContent>
        </Card>
      )}

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

      {member.member_type === 'visitor' && (
        <VisitorStageCard
          memberId={id}
          memberName={member.full_name}
          currentStage={member.integration_stage ?? 'novo_visitante'}
          markedNotReturned={member.marked_not_returned}
        />
      )}

      <ContactLog memberId={id} memberName={member.full_name} />

      <Card>
        <CardHeader>
          <CardTitle>Tags (chave / valor)</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberTagsEditor memberId={id} />
        </CardContent>
      </Card>

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
