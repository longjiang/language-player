'use client';

import { useT } from '@/hooks/use-t';
import { Logo } from '@/components/ui/logo';
import { GitBranch, Calendar, Globe, Package } from 'lucide-react';

interface BuildInfo {
  version: string;
  commitHash: string;
  branch: string;
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

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>
      <span className="text-sm font-medium font-mono text-foreground">{value}</span>
    </div>
  );
}

export function AboutContent({ buildInfo }: { buildInfo: BuildInfo }) {
  const t = useT();
  const { version, commitHash, branch, buildDate, environment } = buildInfo;

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <Logo
            size={64}
            className="mx-auto mb-4 justify-center"
            priority
          />
          <h1 className="text-2xl font-bold">{t('title.app_name')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('title.about')}
          </p>
        </div>

        {/* Build Info Card */}
        <div className="rounded-xl border border-border bg-card p-5">
          <InfoRow icon={Package} label={t('label.version')} value={`v${version}`} />
          <InfoRow icon={GitBranch} label={t('label.build_date')} value={formatDate(buildDate)} />
          <InfoRow icon={Globe} label={t('label.environment')} value={environment} />

          {/* Commit & Branch — technical, no translation needed */}
          <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <GitBranch className="h-4 w-4 shrink-0" />
              <span>Commit</span>
            </div>
            <code className="text-sm font-mono text-foreground">{commitHash}</code>
          </div>
          <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <GitBranch className="h-4 w-4 shrink-0" />
              <span>Branch</span>
            </div>
            <code className="text-sm font-mono text-foreground">{branch}</code>
          </div>
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
