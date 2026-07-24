'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useT } from '@/hooks/use-t';

const BRAND_NAME = 'Language Player';

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
  /**
   * L1 (UI) language code. When provided and not 'en', and the localized
   * app name differs from "Language Player", the localized name appears
   * as small muted text underneath the brand name.
   */
  l1?: string;
}

export function Logo({
  size = 28,
  linkHref,
  showText = false,
  className = '',
  priority,
  l1,
}: LogoProps) {
  const t = useT();
  const localizedName = t('title.app_name');
  const showSubtitle = l1 && l1 !== 'en' && localizedName !== BRAND_NAME;

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
        <span className="hidden sm:flex flex-col leading-tight">
          <span className="font-bold">{BRAND_NAME}</span>
          {showSubtitle && (
            <span className="text-[10px] font-normal">
              {localizedName}
            </span>
          )}
        </span>
      )}
    </>
  );

  if (linkHref) {
    return (
      <Link
        href={linkHref}
        className={`flex items-center gap-2 ${className}`}
      >
        {logoContent}
      </Link>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {logoContent}
    </div>
  );
}
