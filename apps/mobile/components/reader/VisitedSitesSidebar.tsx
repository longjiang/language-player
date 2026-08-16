import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Globe, MoreHorizontal, PenLine, Trash2 } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED, ICON_DESTRUCTIVE } from '@/lib/theme-colors';
import type { VisitedSite } from '@/lib/reader-history';

interface VisitedSitesSidebarProps {
  sites: VisitedSite[];
  onLoad: (url: string) => void;
  onRename: (url: string, title: string) => Promise<void> | void;
  onDelete: (url: string) => Promise<void> | void;
}

/**
 * Web-reader visited-sites sidebar body — mirrors apps/web's web-reader
 * sidebar, rendered inside the shared mobile Sidebar.
 */
export function VisitedSitesSidebar({
  sites,
  onLoad,
  onRename,
  onDelete,
}: VisitedSitesSidebarProps) {
  const t = useT();
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [menuUrl, setMenuUrl] = useState<string | null>(null);

  const commitRename = async (url: string) => {
    await onRename(url, editValue);
    setEditingUrl(null);
  };

  return (
    <View>
      {sites.length === 0 && (
        <Text className="px-2 py-1.5 text-sm text-muted-foreground">
          {t('msg.no_visited_sites')}
        </Text>
      )}
      {sites.map((site) => {
        const isEditing = editingUrl === site.url;
        return (
          <View key={site.url} className="relative">
            {menuUrl !== null && (
              <Pressable
                onPress={() => setMenuUrl(null)}
                className="absolute inset-0 z-10"
              />
            )}
            <View className="relative z-20 flex-row items-center gap-2 rounded-md px-2 py-1.5 active:bg-muted">
              <Globe size={14} color={ICON_MUTED} />
              <View className="min-w-0 flex-1">
                {isEditing ? (
                  <TextInput
                    autoFocus
                    value={editValue}
                    onChangeText={setEditValue}
                    onSubmitEditing={() => commitRename(site.url)}
                    onBlur={() => commitRename(site.url)}
                    placeholder={t('placeholder.enter_title')}
                    className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-xs text-foreground"
                  />
                ) : (
                  <>
                    <Pressable
                      onPress={() => { setMenuUrl(null); onLoad(site.url); }}
                    >
                      <Text className="text-sm text-foreground" numberOfLines={1}>
                        {site.title}
                      </Text>
                    </Pressable>
                    <Text className="text-[10px] text-muted-foreground/70" numberOfLines={1}>
                      {site.url}
                    </Text>
                    {site.visitedAt > 0 && (
                      <Text className="text-[10px] text-muted-foreground/70">
                        {new Date(site.visitedAt).toLocaleDateString()}
                      </Text>
                    )}
                  </>
                )}
              </View>
              {!isEditing && (
                <Pressable
                  onPress={() => setMenuUrl(menuUrl === site.url ? null : site.url)}
                  className="rounded p-1 active:bg-muted"
                  accessibilityLabel={t('action.more')}
                >
                  <MoreHorizontal size={14} color={ICON_MUTED} />
                </Pressable>
              )}
            </View>

            {menuUrl === site.url && !isEditing && (
              <View className="absolute right-2 top-9 z-30 min-w-[120px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg" style={{ elevation: 8 }}>
                <Pressable
                  onPress={() => { setMenuUrl(null); setEditingUrl(site.url); setEditValue(site.title || site.url); }}
                  className="flex-row items-center gap-2 px-3 py-2 active:bg-muted"
                >
                  <PenLine size={12} color={ICON_MUTED} />
                  <Text className="text-xs text-foreground">{t('action.rename')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setMenuUrl(null); onDelete(site.url); }}
                  className="flex-row items-center gap-2 px-3 py-2 active:bg-muted"
                >
                  <Trash2 size={12} color={ICON_DESTRUCTIVE} />
                  <Text className="text-xs text-red-500">{t('action.delete')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
