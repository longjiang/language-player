'use client';

import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  buildExternalSearchLinks,
  groupExternalSearchLinks,
  faviconUrl,
  EXTERNAL_SEARCH_GROUP_TITLES,
  type ExternalSearchGroup,
  type ExternalSearchLink,
} from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { baseCode, isHan, languageName } from '@/lib/language-data';

interface ExternalSearchProps {
  /** Surface form under lookup. */
  term: string;
  l1Code: string;
  l2Code: string;
  /** Optional traditional-script form (for CJK sources like Moedict). */
  traditional?: string;
}

/** Renders the curated external-lookup links (SPEC-094) grouped by heading. */
export function ExternalSearch({ term, l1Code, l2Code, traditional }: ExternalSearchProps) {
  const t = useT();
  const l1 = baseCode(l1Code);
  const l2 = baseCode(l2Code);

  const groups = useMemo(() => {
    const links = buildExternalSearchLinks({
      term,
      l1Code: l1,
      l2Code: l2,
      l2Name: languageName(l2, l1),
      l2Han: isHan(l2),
      l1Han: isHan(l1),
      traditional,
    });
    return groupExternalSearchLinks(links);
  }, [term, l1, l2, traditional]);

  if (groups.length === 0) return null;

  const renderLink = (link: ExternalSearchLink) => (
    <a
      key={link.key}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <img
        src={faviconUrl(link.domain)}
        alt=""
        loading="lazy"
        className="h-4 w-4 shrink-0 rounded-sm"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
      />
      <span className="min-w-0 flex-1 truncate">{t(link.titleKey)}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
    </a>
  );

  return (
    <div className="space-y-2">
      {groups.map(({ group, links }) => (
        <div key={group}>
          <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(EXTERNAL_SEARCH_GROUP_TITLES[group as ExternalSearchGroup])}
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            {links.map(renderLink)}
          </div>
        </div>
      ))}
    </div>
  );
}
