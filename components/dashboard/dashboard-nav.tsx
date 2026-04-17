'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/ui/link-button';
import { PastoreioLogo } from '@/components/brand/PastoreioLogo';
import { Home, Users, ClipboardCheck, Calendar, LogOut, TrendingUp, Settings, UserCircle, Bell } from 'lucide-react';
import { logout } from '@/app/(dashboard)/actions';

type DashboardNavProps = {
  groupName: string;
  leaderDisplayName: string;
  role?: 'leader' | 'secretary' | 'coordinator';
};

export function DashboardNav({ groupName, leaderDisplayName, role = 'leader' }: DashboardNavProps) {
  const isSecretary = role === 'secretary';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const iconPlaceholder = (className: string) => <span className={className} aria-hidden />;

  return (
    <>
      <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r min-h-screen">
        <div className="p-5 border-b">
          <PastoreioLogo size={28} showWordmark wordmarkClassName="text-lg" />
          <p className="text-xs text-muted-foreground mt-2 pl-1 truncate">{groupName}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <LinkButton href="/dashboard" variant="ghost" className="w-full justify-start">
            {mounted ? <Home className="mr-2 h-4 w-4" /> : iconPlaceholder('mr-2 inline-block h-4 w-4')}
            Dashboard
          </LinkButton>
          <LinkButton href="/pessoas" variant="ghost" className="w-full justify-start">
            {mounted ? <Users className="mr-2 h-4 w-4" /> : iconPlaceholder('mr-2 inline-block h-4 w-4')}
            Pessoas
          </LinkButton>
          <LinkButton href="/chamada" variant="ghost" className="w-full justify-start">
            {mounted ? <ClipboardCheck className="mr-2 h-4 w-4" /> : iconPlaceholder('mr-2 inline-block h-4 w-4')}
            Chamada
          </LinkButton>
          <LinkButton href="/agenda" variant="ghost" className="w-full justify-start">
            {mounted ? <Calendar className="mr-2 h-4 w-4" /> : iconPlaceholder('mr-2 inline-block h-4 w-4')}
            Agenda
          </LinkButton>
          <LinkButton href="/engajamento" variant="ghost" className="w-full justify-start">
            {mounted ? <TrendingUp className="mr-2 h-4 w-4" /> : iconPlaceholder('mr-2 inline-block h-4 w-4')}
            Engajamento
          </LinkButton>
          <LinkButton href="/alertas" variant="ghost" className="w-full justify-start">
            {mounted ? <Bell className="mr-2 h-4 w-4" /> : iconPlaceholder('mr-2 inline-block h-4 w-4')}
            Alertas
          </LinkButton>
          {!isSecretary && (
            <LinkButton href="/configuracoes" variant="ghost" className="w-full justify-start">
              {mounted ? <Settings className="mr-2 h-4 w-4" /> : iconPlaceholder('mr-2 inline-block h-4 w-4')}
              Meu Grupo
            </LinkButton>
          )}
        </nav>

        <div className="p-4 border-t space-y-2">
          <p className="text-sm text-muted-foreground truncate">{leaderDisplayName}</p>
          {isSecretary && (
            <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-accent/15 text-accent-foreground font-medium">
              Secretário(a)
            </span>
          )}
          <LinkButton href="/conta" variant="ghost" className="w-full justify-start">
            {mounted ? <UserCircle className="mr-2 h-4 w-4" /> : iconPlaceholder('mr-2 inline-block h-4 w-4')}
            Minha Conta
          </LinkButton>
          <form action={logout}>
            <Button variant="outline" className="w-full" type="submit">
              {mounted ? <LogOut className="mr-2 h-4 w-4" /> : iconPlaceholder('mr-2 inline-block h-4 w-4')}
              Sair
            </Button>
          </form>
        </div>
      </aside>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-area-pb">
        <div className="flex items-stretch min-h-14 px-1 py-1 overflow-x-auto overflow-y-hidden">
          {[
            { href: '/dashboard', label: 'Início', icon: <Home className="h-6 w-6 shrink-0" />, ph: 'h-6 w-6' },
            { href: '/pessoas', label: 'Pessoas', icon: <Users className="h-6 w-6 shrink-0" />, ph: 'h-6 w-6' },
            { href: '/chamada', label: 'Chamada', icon: <ClipboardCheck className="h-6 w-6 shrink-0" />, ph: 'h-6 w-6' },
            { href: '/agenda', label: 'Agenda', icon: <Calendar className="h-6 w-6 shrink-0" />, ph: 'h-6 w-6' },
            { href: '/engajamento', label: 'Engaj.', icon: <TrendingUp className="h-6 w-6 shrink-0" />, ph: 'h-6 w-6' },
            { href: '/alertas', label: 'Alertas', icon: <Bell className="h-6 w-6 shrink-0" />, ph: 'h-6 w-6' },
            ...(!isSecretary ? [{ href: '/configuracoes', label: 'Grupo', icon: <Settings className="h-6 w-6 shrink-0" />, ph: 'h-6 w-6' }] : []),
            { href: '/conta', label: 'Conta', icon: <UserCircle className="h-6 w-6 shrink-0" />, ph: 'h-6 w-6' },
          ].map(({ href, label, icon, ph }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center shrink-0 py-1.5 px-3 rounded-lg text-muted-foreground transition-colors hover:text-primary hover:bg-accent active:text-primary min-w-[56px]"
            >
              {mounted ? icon : <span className={`inline-block shrink-0 ${ph}`} aria-hidden />}
              <span className="text-[10px] font-medium mt-0.5 truncate max-w-[72px]">{label}</span>
            </Link>
          ))}
          <form action={logout} className="flex shrink-0">
            <button
              type="submit"
              className="flex flex-col items-center justify-center py-1.5 px-3 min-w-[56px] text-muted-foreground hover:text-destructive transition-colors rounded-lg"
            >
              {mounted ? <LogOut className="h-6 w-6 shrink-0" /> : <span className="h-6 w-6 inline-block shrink-0" aria-hidden />}
              <span className="text-[10px] font-medium mt-0.5">Sair</span>
            </button>
          </form>
        </div>
      </nav>
    </>
  );
}
