'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useT } from '@/hooks/use-t';

interface LogoProps {
  /** Logo size in pixels. Default 28 (h-7/w-7). */
  size?: number;
  /** When set, wraps the logo in a Link pointing to this href. */
  linkHref?: string;
  /** Show the app name text next to the logo. Hidden on small screens. */
  showText?: boolean;
  /** Additional classes on the wrapper. */
  className?: string;
  /** Whether to prioritize loading. */
  priority?: boolean;
}

export function Logo({
  size = 28,
  linkHref,
  showText = false,
  className = '',
  priority,
}: LogoProps) {
  const t = useT();

  const logoContent = (
    <>
      <Image
        src="/img/logo.png"
        alt={t('title.app_name')}
        width={size}
        height={size}
        className="flex-shrink-0"
        style={{ width: size, height: size }}
        priority={priority}
      />
      {showText && (
        <span className="hidden sm:inline">{t('title.app_name')}</span>
      )}
    </>
  );

  if (linkHref) {
    return (
      <Link
        href={linkHref}
        className={`flex items-center gap-2 font-bold ${className}`}
      >
        {logoContent}
      </Link>
    );
  }

  return (
    <div className={`flex items-center gap-2 font-bold ${className}`}>
      {logoContent}
    </div>
  );
}
