'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Pencil, Trash2, KeyRound } from 'lucide-react';

interface GroupOption {
  id: string;
  name: string;
}

interface LeaderData {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  group_id: string | null;
}

export function AdminLeaderActions({
  leader,
  groups,
}: {
  leader: LeaderData;
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwError, setResetPwError] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  // Formulário de edição
  const [fullName, setFullName] = useState(leader.full_name);
  const [phone, setPhone] = useState(leader.phone ?? '');
  const [groupId, setGroupId] = useState(leader.group_id ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/leaders/${leader.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          phone: phone || null,
          group_id: groupId || null,
          ...(password ? { password } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro ao salvar');
      }
      setEditOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await fetch(`/api/admin/leaders/${leader.id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const handleResetPassword = async () => {
    setResetPwError('');
    setResetPwLoading(true);
    setTemporaryPassword(null);
    try {
      const res = await fetch(`/api/admin/leaders/${leader.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao redefinir senha');
      setTemporaryPassword(data.temporary_password ?? null);
      router.refresh();
    } catch (e) {
      setResetPwError(e instanceof Error ? e.message : 'Erro ao redefinir senha');
    } finally {
      setResetPwLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => { setResetPwOpen(true); setTemporaryPassword(null); setResetPwError(''); }}
        title="Redefinir senha"
      >
        <KeyRound className="h-3.5 w-3.5" />
      </Button>
      {/* Botão Editar */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setEditOpen(true)}
        title="Editar líder"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      {/* Botão Excluir */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={() => setConfirmOpen(true)}
        title="Excluir líder"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      {/* Dialog: Editar */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Líder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>
            )}
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={leader.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado.</p>
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label>Grupo</Label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">— Sem grupo —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Nova senha (opcional)</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Deixe em branco para não alterar"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={loading}>Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Redefinir senha */}
      <Dialog open={resetPwOpen} onOpenChange={(v) => { setResetPwOpen(v); if (!v) setTemporaryPassword(null); setResetPwError(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
          </DialogHeader>
          {temporaryPassword ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
                Senha redefinida. O usuário deverá alterá-la no próximo login.
              </p>
              <div className="space-y-2">
                <Label>Senha temporária (passe ao usuário)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={temporaryPassword} className="font-mono" />
                  <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(temporaryPassword); alert('Copiado!'); }}>
                    Copiar
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setResetPwOpen(false)}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Será gerada uma nova senha para <strong>{leader.full_name}</strong>. O usuário precisará alterá-la no próximo login.
              </p>
              {resetPwError && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{resetPwError}</p>}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" disabled={resetPwLoading}>Cancelar</Button>
                </DialogClose>
                <Button onClick={handleResetPassword} disabled={resetPwLoading}>
                  {resetPwLoading ? 'Redefinindo...' : 'Gerar nova senha'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Líder</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir o líder{' '}
            <strong>{leader.full_name}</strong>?
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={loading}>Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
