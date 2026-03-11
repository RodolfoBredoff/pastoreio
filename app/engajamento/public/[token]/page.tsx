import { EngagementClient } from '@/components/dashboard/engagement-client';

export default async function EngajamentoPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <EngagementClient publicToken={token} />
      </div>
    </div>
  );
}
