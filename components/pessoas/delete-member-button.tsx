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
  isActive?: boolean;
  variant?: 'button' | 'icon';
  className?: string;
}

export function DeleteMemberButton({
  memberId,
  memberName,
  canDelete,
  isActive = true,
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
          aria-label={isActive ? 'Excluir pessoa' : 'Remover da lista'}
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
          {isActive ? 'Excluir pessoa' : 'Remover da lista'}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isActive ? 'Excluir pessoa do grupo?' : 'Remover da lista de Pessoas?'}
            </DialogTitle>
            <DialogDescription>
              {isActive ? (
                <>
                  Marcar <strong>{memberName}</strong> como inativa? Ela permanecerá na lista de Pessoas com
                  status inativo, mas não aparecerá nas chamadas. O histórico de presenças será preservado e
                  você poderá reativá-la depois.
                </>
              ) : (
                <>
                  Remover <strong>{memberName}</strong> da lista de Pessoas? Ela deixará de aparecer nesta
                  lista, mas o histórico de presenças e demais registros serão preservados.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Processando…' : isActive ? 'Marcar como inativa' : 'Remover da lista'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
