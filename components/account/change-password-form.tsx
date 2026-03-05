'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password-validation';

function PasswordRequirements({ password }: { password: string }) {
  const checks = [
    { label: `Mais de 10 caracteres (${password.length}/${PASSWORD_MIN_LENGTH})`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: 'Letra maiúscula (A-Z)', ok: /[A-Z]/.test(password) },
    { label: 'Letra minúscula (a-z)', ok: /[a-z]/.test(password) },
    { label: 'Número (0-9)', ok: /[0-9]/.test(password) },
  ];

  return (
    <ul className="space-y-1 mt-2">
      {checks.map(({ label, ok }) => (
        <li key={label} className={`flex items-center gap-2 text-xs ${ok ? 'text-green-600' : 'text-muted-foreground'}`}>
          {ok
            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            : <XCircle className="h-3.5 w-3.5 shrink-0" />}
          {label}
        </li>
      ))}
    </ul>
  );
}

export function ChangePasswordForm({
  hasExistingPassword,
  mustChangePassword,
}: {
  hasExistingPassword: boolean;
  mustChangePassword?: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [currentConfirm, setCurrentConfirm] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showCurrentConfirm, setShowCurrentConfirm] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const needCurrentPassword = hasExistingPassword && !mustChangePassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (needCurrentPassword && currentPassword !== currentConfirm) {
      setError('A confirmação da senha atual não coincide.');
      return;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('A nova senha deve ter mais de 10 caracteres, incluindo uma letra maiúscula, uma minúscula e um número.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: needCurrentPassword ? currentPassword : undefined,
          new_password: newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao alterar senha');
      } else {
        setCurrentPassword('');
        setCurrentConfirm('');
        setNewPassword('');
        // Full page load para o dashboard garante que o layout rode de novo no servidor e leia must_change_password = false (evita loop de redirect)
        if (mustChangePassword) {
          setSuccess('Senha alterada com sucesso! Redirecionando...');
          const isOrg = typeof window !== 'undefined' && window.location.pathname.startsWith('/org');
          window.location.href = isOrg ? '/org/dashboard' : '/dashboard';
          return;
        }
        setSuccess('Senha alterada com sucesso!');
      }
    } catch {
      setError('Erro ao processar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          {mustChangePassword ? 'Definir nova senha' : 'Alterar Senha'}
        </CardTitle>
        {mustChangePassword && (
          <p className="text-sm text-muted-foreground mt-1">
            É obrigatório cadastrar uma nova senha para continuar. Use uma senha com mais de 10 caracteres, incluindo letra maiúscula, minúscula e número.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">{success}</p>
          )}

          {needCurrentPassword && (
            <>
              <div className="space-y-2">
                <Label htmlFor="current-password">Senha atual</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Digite sua senha atual"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="current-confirm">Confirmar senha atual</Label>
                <div className="relative">
                  <Input
                    id="current-confirm"
                    type={showCurrentConfirm ? 'text' : 'password'}
                    value={currentConfirm}
                    onChange={(e) => setCurrentConfirm(e.target.value)}
                    placeholder="Repita a senha atual"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password">Nova senha</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPassword.length > 0 && <PasswordRequirements password={newPassword} />}
            {newPassword.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Mais de 10 caracteres, uma letra maiúscula, uma minúscula e um número.
              </p>
            )}
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? 'Salvando...' : mustChangePassword ? 'Definir senha e continuar' : 'Alterar Senha'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
