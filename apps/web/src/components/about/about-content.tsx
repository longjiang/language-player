'use client';

import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/providers/language-provider';
import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import {
  Package,
  Calendar,
  Globe,
  Mail,
  MessageCircle,
  ChevronRight,
  BookOpen,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BuildInfo {
  version: string;
  buildDate: string;
  environment: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>
      <span className="text-sm font-medium font-mono text-foreground">{value}</span>
    </div>
  );
}

function LinkRow({
  icon: Icon,
  label,
  href,
  external = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  external?: boolean;
}) {
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
    </>
  );
  const className =
    'flex w-full items-center gap-2.5 border-b border-border py-2.5 text-sm text-muted-foreground transition-colors last:border-0 hover:bg-muted/50 hover:text-foreground';

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

export function AboutContent({
  buildInfo,
  className,
}: {
  buildInfo: BuildInfo;
  className?: string;
}) {
  const t = useT();
  const { l1, l2 } = useLanguage();
  const { version, buildDate, environment } = buildInfo;

  return (
    <div className={cn('flex min-h-screen flex-col items-center px-4 py-12', className)}>
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <Logo size={64} className="mx-auto mb-4 justify-center" priority />
          <h1 className="text-2xl font-bold">{t('title.app_name')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('title.about')}</p>
        </div>

        {/* Build Info Card */}
        <div className="rounded-xl border border-border bg-card p-5">
          <InfoRow icon={Package} label={t('label.version')} value={`v${version}`} />
          <InfoRow icon={Calendar} label={t('label.build_date')} value={formatDate(buildDate)} />
          <InfoRow icon={Globe} label={t('label.environment')} value={environment} />
        </div>

        {/* Contact Card */}
        <div className="mt-3 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('action.contact_us')}
          </h2>
          <LinkRow
            icon={Mail}
            label={t('action.email_support')}
            href="mailto:jon.long@zerotohero.ca"
            external
          />
          <LinkRow
            icon={MessageCircle}
            label={t('label.discord_server')}
            href="https://discord.gg/D7vKcuKXuA"
            external
          />
        </div>

        {/* Links Card */}
        <div className="mt-3 rounded-xl border border-border bg-card p-5">
          <LinkRow
            icon={BookOpen}
            label={t('title.docs')}
            href={`/docs?l1=${encodeURIComponent(l1.code)}`}
          />
          <LinkRow
            icon={Wrench}
            label={t('title.tokenizer_test')}
            href={`/${l1.code}/${l2.code}/tokenizer`}
          />
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Language Player
          </p>
        </div>
      </div>
    </div>
  );
}
