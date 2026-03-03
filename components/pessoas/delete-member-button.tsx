'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeleteMemberButtonProps {
  memberId: string;
  memberName: string;
  canDelete: boolean;
  variant?: 'button' | 'icon';
  className?: string;
}

export function DeleteMemberButton({
  memberId,
  memberName,
  canDelete,
  variant = 'button',
  className,
}: DeleteMemberButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!canDelete) return null;

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/members/${memberId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error ?? 'Erro ao excluir pessoa.');
        return;
      }
      setOpen(false);
      router.push('/pessoas');
      router.refresh();
    } catch {
      alert('Erro ao excluir pessoa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {variant === 'icon' ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={className}
          onClick={() => setOpen(true)}
          aria-label="Excluir pessoa"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          className={cn('text-destructive border-destructive/50 hover:bg-destructive/10', className)}
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir pessoa
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir pessoa do grupo?</DialogTitle>
            <DialogDescription>
              Excluir {memberName}? Ela deixará de aparecer na lista do grupo. Esta ação pode ser revertida
              posteriormente reativando a pessoa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
