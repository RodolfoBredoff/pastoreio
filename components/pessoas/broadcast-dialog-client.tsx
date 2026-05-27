'use client';

import dynamic from 'next/dynamic';

interface Member {
  id: string;
  full_name: string;
  phone: string;
  member_type: 'participant' | 'visitor';
}

const BroadcastDialogInner = dynamic(
  () => import('./broadcast-dialog').then((m) => ({ default: m.BroadcastDialog })),
  { ssr: false }
);

interface BroadcastDialogClientProps {
  members: Member[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preSelectedIds?: string[];
}

export function BroadcastDialogClient({ members, open, onOpenChange, preSelectedIds }: BroadcastDialogClientProps) {
  return (
    <BroadcastDialogInner
      members={members}
      open={open}
      onOpenChange={onOpenChange}
      preSelectedIds={preSelectedIds}
    />
  );
}
