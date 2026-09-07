import React, { useMemo } from 'react';
import { View, Text, Image, Linking, ScrollView } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import {
  buildExternalSearchLinks,
  groupExternalSearchLinks,
  faviconUrl,
  isHanScript,
  EXTERNAL_SEARCH_GROUP_TITLES,
  type ExternalSearchGroup,
  type ExternalSearchLink,
} from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { Pressable } from '@/components/ui/pressable';
import { ICON_MUTED } from '@/lib/theme-colors';

interface ExternalSearchProps {
  /** Surface form under lookup. */
  term: string;
  l1Code: string;
  l2Code: string;
  /** Localized target-language name (for the Wiktionary fragment). */
  l2Name: string;
  /** Optional traditional-script form (for CJK sources like Moedict). */
  traditional?: string;
}

/** Renders the curated external-lookup links (SPEC-094) grouped by heading. */
export function ExternalSearch({ term, l1Code, l2Code, l2Name, traditional }: ExternalSearchProps) {
  const t = useT();
  const l1 = baseCode(l1Code);
  const l2 = baseCode(l2Code);

  const groups = useMemo(() => {
    const links = buildExternalSearchLinks({
      term,
      l1Code: l1,
      l2Code: l2,
      l2Name,
      l2Han: isHanScript(l2),
      l1Han: isHanScript(l1),
      traditional,
    });
    return groupExternalSearchLinks(links);
  }, [term, l1, l2, l2Name, traditional]);

  if (groups.length === 0) return null;

  return (
    <ScrollView
      style={{ maxHeight: 280 }}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      {groups.map(({ group, links }) => (
        <View key={group} className="mb-3">
          <Text className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(EXTERNAL_SEARCH_GROUP_TITLES[group as ExternalSearchGroup])}
          </Text>
          <View className="overflow-hidden rounded-lg border border-border">
            {links.map((link) => (
              <LinkRow key={link.key} link={link} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function LinkRow({ link }: { link: ExternalSearchLink }) {
  const t = useT();
  return (
    <Pressable
      onPress={() => { Linking.openURL(link.url).catch(() => {}); }}
      className="flex-row items-center gap-2 px-3 py-2 active:bg-muted"
    >
      <Image
        source={{ uri: faviconUrl(link.domain) }}
        style={{ width: 16, height: 16, borderRadius: 3 }}
      />
      <Text className="min-w-0 flex-1 text-sm text-muted-foreground">{t(link.titleKey)}</Text>
      <ExternalLink size={14} color={ICON_MUTED} />
    </Pressable>
  );
}
