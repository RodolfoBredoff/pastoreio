'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { type ButtonProps } from '@/components/ui/button';

type LinkButtonProps = Omit<ButtonProps, 'onClick'> & {
  href: string;
};

/**
 * Botão que navega via Link. Evita passar event handlers de Server para Client
 * quando usamos <Link><Button> em uma Server Component.
 */
export function LinkButton({ href, children, className, variant, size, ...rest }: LinkButtonProps) {
  const shrinkOnly =
    className != null &&
    className.includes('shrink-0') &&
    !className.includes('w-full') &&
    !className.includes('flex-1');

  const linkClass = shrinkOnly
    ? 'inline-block shrink-0'
    : className != null
      ? 'block w-full'
      : 'inline-block w-full sm:w-auto';

  return (
    <Link href={href} className={linkClass}>
      <Button variant={variant} size={size} className={className ?? 'w-full'} {...rest}>
        {children}
      </Button>
    </Link>
  );
}
