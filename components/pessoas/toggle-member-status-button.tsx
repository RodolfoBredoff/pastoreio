'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, UserX, UserCheck } from 'lucide-react';

interface ToggleMemberStatusButtonProps {
  memberId: string;
  memberName: string;
  isActive: boolean;
}

export function ToggleMemberStatusButton({ 
  memberId, 
  memberName, 
  isActive 
}: ToggleMemberStatusButtonProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleToggleStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/members/${memberId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !isActive }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao alterar status');
      }

      const data = await res.json();
      alert(data.message || 'Status alterado com sucesso');
      setDialogOpen(false);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao alterar status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Ativo' : 'Inativo'}
        </Badge>
        <Button
          type="button"
          variant={isActive ? 'destructive' : 'default'}
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
          {isActive ? (
            <>
              <UserX className="h-4 w-4 mr-2" />
              Marcar como Inativo
            </>
          ) : (
            <>
              <UserCheck className="h-4 w-4 mr-2" />
              Reativar
            </>
          )}
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isActive ? 'Marcar como Inativo' : 'Reativar Membro'}
            </DialogTitle>
            <DialogDescription>
              {isActive ? (
                <>
                  <p className="mb-2">
                    Tem certeza que deseja marcar <strong>{memberName}</strong> como inativo?
                  </p>
                  <p className="text-sm border-l-4 border-yellow-500 pl-3 py-2 bg-yellow-50 dark:bg-yellow-950/20">
                    Esta pessoa <strong>não aparecerá mais nas chamadas</strong> de presença, 
                    mas todo o histórico de presenças passadas será preservado.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Tem certeza que deseja reativar <strong>{memberName}</strong>?
                  </p>
                  <p className="text-sm mt-2">
                    Esta pessoa voltará a aparecer nas chamadas de presença.
                  </p>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={isActive ? 'destructive' : 'default'}
              onClick={handleToggleStatus}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : isActive ? (
                'Sim, Marcar como Inativo'
              ) : (
                'Sim, Reativar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
