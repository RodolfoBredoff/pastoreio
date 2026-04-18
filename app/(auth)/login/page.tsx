'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, Shield } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = useMemo(() => searchParams.get('reason'), [searchParams]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError(null);

    try {
      const response = await fetch('/api/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoginError(data.error || 'E-mail ou senha incorretos');
        return;
      }

      // Sessão criada com sucesso — redirecionar direto para o dashboard
      router.push('/dashboard');
    } catch (error: unknown) {
      console.error('Login error:', error);
      setLoginError('Erro ao processar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Pequenos Grupos</CardTitle>
        <CardDescription>
          Entre com e-mail e senha para acessar o sistema
        </CardDescription>
      </CardHeader>
      <CardContent>
        {reason === 'no-leader' && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
            Sua conta ainda não está cadastrada como líder de um grupo. Execute o setup inicial ou peça ao administrador para vincular seu e-mail a um grupo.
          </p>
        )}
        {loginError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            {loginError}
          </p>
        )}
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                disabled={loading}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                {mounted ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <span className="mr-2 inline-block h-4 w-4" />}
                Entrando...
              </>
            ) : (
              <>
                {mounted ? <Lock className="mr-2 h-4 w-4" /> : <span className="mr-2 inline-block h-4 w-4" />}
                Entrar
              </>
            )}
          </Button>
        </form>
        <div className="mt-4 pt-4 border-t text-center">
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <Shield className="h-4 w-4" />
            Acesso administrador
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    }>
      <LoginForm />
    </Suspense>
  );
}
