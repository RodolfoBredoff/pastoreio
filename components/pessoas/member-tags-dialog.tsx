'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MemberTagsForm } from '@/components/pessoas/member-tags-form';
import { Tags } from 'lucide-react';

interface MemberTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName: string;
  onTagsChanged?: () => void;
}

export function MemberTagsDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
  onTagsChanged,
}: MemberTagsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Tags className="h-4 w-4 shrink-0" />
            Tags — {memberName}
          </DialogTitle>
        </DialogHeader>
        <MemberTagsForm
          memberId={memberId}
          onChanged={onTagsChanged}
          showIntro={false}
        />
      </DialogContent>
    </Dialog>
  );
}
