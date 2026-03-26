'use client';

import { MemberTagsForm } from '@/components/pessoas/member-tags-form';

interface MemberTagsEditorProps {
  memberId: string;
}

export function MemberTagsEditor({ memberId }: MemberTagsEditorProps) {
  return <MemberTagsForm memberId={memberId} showIntro />;
}
