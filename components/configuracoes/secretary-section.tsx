'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { UserPlus, Trash2, Mail, Phone, ShieldCheck } from 'lucide-react';
import { formatPhone } from '@/lib/utils';

interface Secretary {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
}

interface SecretarySectionProps {
  initialSecretaries: Secretary[];
}

const PASSWORD_HINT = 'Mais de 10 caracteres, uma maiúscula, uma minúscula e um número.';

function AddSecretaryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (s: Secretary) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [generatePassword, setGeneratePassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [createdSecretary, setCreatedSecretary] = useState<Secretary | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  function reset() {
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setGeneratePassword(false);
    setError('');
    setCreatedPassword(null);
    setCreatedSecretary(null);
  }

  async function handleSubmit() {
    if (!fullName.trim() || !email.trim()) {
      setError('Nome e e-mail são obrigatórios.');
      return;
    }
    if (!generatePassword && !password.trim()) {
      setError('Defina uma senha para o primeiro acesso ou marque "Gerar senha aleatória".');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/secretaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          password: generatePassword ? undefined : password,
          generate_password: generatePassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar secretário');
      if (data.temporary_password) {
        setCreatedPassword(data.temporary_password);
        setCreatedSecretary({
          id: data.id,
          full_name: data.full_name,
          email: data.email,
          phone: data.phone ?? null,
          created_at: data.created_at ?? '',
        });
        return;
      }
      onCreated(data);
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar secretário');
    } finally {
      setIsLoading(false);
    }
  }

  function handleClose() {
    if (createdSecretary) {
      onCreated(createdSecretary);
      startTransition(() => router.refresh());
    }
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Secretário(a)</DialogTitle>
        </DialogHeader>
        {createdPassword ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
              Secretário(a) criado(a). Passe a senha abaixo para o primeiro acesso. Após o primeiro login, ele(a) deverá cadastrar uma nova senha.
            </p>
            <div className="space-y-2">
              <Label>Senha temporária (copie e envie ao secretário)</Label>
              <div className="flex gap-2">
                <Input readOnly value={createdPassword} className="font-mono" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(createdPassword);
                    alert('Senha copiada!');
                  }}
                >
                  Copiar
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="sec-name">Nome completo *</Label>
                <Input
                  id="sec-name"
                  placeholder="Ex: Maria Silva"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sec-email">E-mail *</Label>
                <Input
                  id="sec-email"
                  type="email"
                  placeholder="maria@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O secretário usará este e-mail e a senha definida para o primeiro acesso.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sec-phone">Telefone (opcional)</Label>
                <Input
                  id="sec-phone"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sec-generate"
                    checked={generatePassword}
                    onChange={(e) => setGeneratePassword(e.target.checked)}
                  />
                  <Label htmlFor="sec-generate" className="cursor-pointer">Gerar senha aleatória</Label>
                </div>
                {!generatePassword && (
                  <>
                    <Label htmlFor="sec-password">Senha para primeiro acesso *</Label>
                    <Input
                      id="sec-password"
                      type="password"
                      placeholder="Senha do secretário"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
                  </>
                )}
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={isLoading}>Cancelar</Button>
              </DialogClose>
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? 'Criando...' : 'Adicionar'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SecretarySection({ initialSecretaries }: SecretarySectionProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [secretaries, setSecretaries] = useState<Secretary[]>(initialSecretaries);
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    setSecretaries(initialSecretaries);
  }, [initialSecretaries]);

  async function handleDelete() {
    if (!deletingId) return;
    const res = await fetch(`/api/secretaries/${deletingId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      setDeleteError(d.error || 'Erro ao remover secretário');
      throw new Error(d.error);
    }
    setSecretaries((prev) => prev.filter((s) => s.id !== deletingId));
    startTransition(() => router.refresh());
  }

  const deletingSecretary = secretaries.find((s) => s.id === deletingId);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Secretários</CardTitle>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <UserPlus className="h-4 w-4" />
            Adicionar
          </Button>
        </CardHeader>
        <CardContent>
          {secretaries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum secretário cadastrado.</p>
              <p className="text-xs mt-1">
                Secretários podem fazer chamadas, cadastrar pessoas e ver o engajamento.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {secretaries.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 border rounded-lg gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{s.full_name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" /> {s.email}
                      </span>
                      {s.phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" /> {formatPhone(s.phone)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Remover secretário"
                    onClick={() => { setDeleteError(''); setDeletingId(s.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {deleteError && (
            <p className="text-sm text-destructive mt-3">{deleteError}</p>
          )}
        </CardContent>
      </Card>

      <AddSecretaryDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onCreated={(s) => {
          setSecretaries((prev) => [...prev, s]);
          startTransition(() => router.refresh());
        }}
      />

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(v) => { if (!v) setDeletingId(null); }}
        title="Remover secretário(a)?"
        description={
          deletingSecretary
            ? `${deletingSecretary.full_name} perderá acesso ao grupo imediatamente.`
            : undefined
        }
        confirmLabel="Remover"
        onConfirm={handleDelete}
        isDestructive
      />
    </>
  );
}
