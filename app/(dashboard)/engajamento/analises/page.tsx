import { getCurrentLeader } from '@/lib/db/queries';
import { EngagementAnalisesClient } from '@/components/dashboard/engagement-analises-client';

export default async function EngajamentoAnalisesPage() {
  const leader = await getCurrentLeader();

  if (!leader?.group_id) {
    return <div>Grupo não encontrado.</div>;
  }

  return <EngagementAnalisesClient groupId={leader.group_id} />;
}
