'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function ForceChangePasswordRedirect({ mustChangePassword }: { mustChangePassword: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!mustChangePassword) return;
    if (pathname === '/conta' || pathname === '/org/conta' || pathname?.startsWith('/conta?') || pathname?.startsWith('/org/conta?')) return;
    const contaPath = pathname?.startsWith('/org') ? '/org/conta?must_change=1' : '/conta?must_change=1';
    router.replace(contaPath);
  }, [mustChangePassword, pathname, router]);

  return null;
}
