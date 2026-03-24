import { getCurrentLeader, getMembersByLeaderGroup } from '@/lib/db/queries';
import { canDeleteMembers } from '@/lib/auth/permissions';
import { PessoasListClient } from '@/components/pessoas/pessoas-list-client';

export default async function PessoasPage() {
  const [leader, members] = await Promise.all([
    getCurrentLeader(),
    getMembersByLeaderGroup(),
  ]);
  const canDelete = leader ? canDeleteMembers(leader.role) : false;

  return <PessoasListClient members={members ?? []} canDelete={canDelete} />;
}
