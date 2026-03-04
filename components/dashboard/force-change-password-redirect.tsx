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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/68b58dbd-8e78-48cd-8fa2-18d1de18a7f6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'force-change-password-redirect.tsx',message:'Redirecting to conta (loop)',data:{mustChangePassword,pathname,contaPath},timestamp:Date.now(),hypothesisId:'H1-H2'})}).catch(()=>{});
    // #endregion
    router.replace(contaPath);
  }, [mustChangePassword, pathname, router]);

  return null;
}
