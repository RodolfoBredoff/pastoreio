'use client';

import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import type { MetricMember } from '@/lib/api/fetch-members-by-ids';

interface MetricMembersListProps {
  members: MetricMember[];
  loading: boolean;
  error: string | null;
  emptyLabel?: string;
  loadingLabel?: string;
  showFrequency?: boolean;
  showRetentionStatus?: boolean;
}

export function MetricMembersList({
  members,
  loading,
  error,
  emptyLabel = 'Nenhum membro encontrado.',
  loadingLabel = 'Carregando...',
  showFrequency = false,
  showRetentionStatus = false,
}: MetricMembersListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {loadingLabel}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {members.map((member) => (
        <div
          key={member.id}
          className={`flex items-center justify-between gap-2 p-3 rounded-lg border bg-white dark:bg-card ${
            showRetentionStatus && member.status === 'retained'
              ? 'bg-green-50/30 dark:bg-green-950/10'
              : showRetentionStatus && member.status === 'churned'
                ? 'bg-red-50/30 dark:bg-red-950/10'
                : ''
          }`}
        >
          <p className="font-medium text-sm truncate">{member.full_name}</p>
          <div className="flex items-center gap-2 shrink-0">
            {showFrequency && (
              <Badge variant="outline">{member.frequency_rate}%</Badge>
            )}
            {showRetentionStatus && (
              <Badge
                variant={member.status === 'retained' ? 'default' : 'destructive'}
                className="text-xs"
              >
                {member.status === 'retained' ? '✓ Retido' : '✗ Saiu'}
              </Badge>
            )}
            {!showRetentionStatus && member.phone && (
              <a
                href={`https://wa.me/${member.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-600 hover:text-green-700 whitespace-nowrap"
              >
                {member.phone}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
