import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { SUPPORTED_L2S } from '@langplayer/shared';
import enLocale from '@langplayer/shared/locales/en.json';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { Download, Trash2, CheckCircle2, AlertTriangle, RefreshCw, HardDrive, Search } from 'lucide-react-native';

// ── Language name lookup ─────────────────────

const enLangNames = (enLocale as any)?.lang ?? {};

function getLanguageName(code: string): string {
  return enLangNames[code] ?? code.toUpperCase();
}

// ── Native language names ────────────────────
// Used for search matching (e.g., "français" for fr, "日本語" for ja).
// Covers the most commonly learned languages.
const NATIVE_LANG_NAMES: Record<string, string> = {
  af: 'Afrikaans', ar: 'العربية', ca: 'Català', de: 'Deutsch',
  el: 'Ελληνικά', en: 'English', es: 'Español', fi: 'Suomi',
  fr: 'Français', ga: 'Gaeilge', hi: 'हिन्दी', hr: 'Hrvatski',
  hu: 'Magyar', id: 'Bahasa Indonesia', it: 'Italiano',
  ja: '日本語', ko: '한국어', nl: 'Nederlands', no: 'Norsk',
  pl: 'Polski', pt: 'Português', ro: 'Română', ru: 'Русский',
  sr: 'Српски', sv: 'Svenska', sw: 'Kiswahili', th: 'ไทย',
  tr: 'Türkçe', vi: 'Tiếng Việt',
  'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', zh: '中文',
};

/** Check if a language code matches a search query.
 *  Matches against English name, native name, ISO code, and locale name. */
function langMatchesSearch(code: string, query: string, localeLangNames: Record<string, string>): boolean {
  const q = query.toLowerCase();
  if (code.toLowerCase().includes(q)) return true;
  if ((enLangNames[code] ?? '').toLowerCase().includes(q)) return true;
  if ((NATIVE_LANG_NAMES[code] ?? '').toLowerCase().includes(q)) return true;
  if ((localeLangNames[code] ?? '').toLowerCase().includes(q)) return true;
  return false;
}

// ── Types ────────────────────────────────────

interface LangStatus {
  available: boolean;
  wordCount?: number;
  estimatedSizeBytes?: number;
  version?: string;
  checked: boolean;
}

// ── Helpers ──────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Main Screen ──────────────────────────────

export default function OfflineDictionariesScreen() {
  const t = useT();
  const router = useRouter();
  const { l1Lang, l2Lang } = useLanguage();
  const {
    getDownloadState,
    startDownload,
    cancelDownload,
    deleteDictionary,
    isOfflineAvailable,
  } = useDictionaryContext();

  const l1IsEn = l1Lang.code === 'en';
  const currentL2 = l2Lang.code;

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Get locale language names for search matching
  const localeLangNames = useMemo(() => {
    try {
      const { getLocaleMessages } = require('@/contexts/IntlProvider');
      const msgs = getLocaleMessages(l1Lang.code);
      return (msgs?.lang ?? {}) as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  }, [l1Lang.code]);

  // Server-side availability statuses
  const [statuses, setStatuses] = useState<Map<string, LangStatus>>(new Map());
  // Downloaded languages (checked on mount)
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  // Force re-render for progress bars
  const [, setTick] = useState(0);

  const downloadingRef = useRef<Set<string>>(new Set());

  // ── Load downloaded status on mount ──
  useEffect(() => {
    (async () => {
      const dl = new Set<string>();
      for (const l2 of SUPPORTED_L2S) {
        try {
          if (await isOfflineAvailable(l2)) {
            dl.add(l2);
          }
        } catch {}
      }
      setDownloaded(dl);
    })();
  }, []);

  // ── Check server availability for non-downloaded languages ──
  const checkAvailability = useCallback(async (l2: string) => {
    if (statuses.has(l2)) return;
    try {
      const baseUrl = require('@/lib/api-url').PYTHON_API_URL;
      const res = await fetch(`${baseUrl}/dictionary/download/status?l2=${encodeURIComponent(l2)}`);
      const data = await res.json();
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(l2, { ...data, checked: true });
        return next;
      });
    } catch {
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(l2, { available: false, checked: true });
        return next;
      });
    }
  }, [statuses]);

  // Check availability for all undownloaded languages on mount (batched)
  useEffect(() => {
    const toCheck = SUPPORTED_L2S.filter((l2) => !downloaded.has(l2));
    const batchSize = 8;
    let i = 0;
    const next = () => {
      const batch = toCheck.slice(i, i + batchSize);
      i += batchSize;
      Promise.all(batch.map(checkAvailability)).then(() => {
        if (i < toCheck.length) setTimeout(next, 100);
      });
    };
    if (toCheck.length > 0) next();
  }, [downloaded]);

  // ── Poll download progress ──
  useEffect(() => {
    const interval = setInterval(() => {
      let hasActive = false;
      for (const l2 of downloadingRef.current) {
        const state = getDownloadState(l2);
        if (state.status === 'downloading') hasActive = true;
        if (state.status === 'completed' || state.status === 'failed') {
          downloadingRef.current.delete(l2);
          if (state.status === 'completed') {
            setDownloaded((prev) => new Set(prev).add(l2));
          }
        }
      }
      if (hasActive) setTick((t) => t + 1);
      if (downloadingRef.current.size === 0) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // ── Actions ──

  const handleDownload = async (l2: string) => {
    downloadingRef.current.add(l2);
    setTick((t) => t + 1);
    await startDownload(l2);
  };

  const handleCancel = (l2: string) => {
    cancelDownload(l2);
    downloadingRef.current.delete(l2);
    setTick((t) => t + 1);
  };

  const handleDelete = (l2: string) => {
    Alert.alert(
      `${t('action.delete')} ${getLanguageName(l2)}`,
      'Delete offline dictionary? You\'ll need internet to look up words.',
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteDictionary(l2);
            setDownloaded((prev) => {
              const next = new Set(prev);
              next.delete(l2);
              return next;
            });
          },
        },
      ],
    );
  };

  const handleDeleteAll = () => {
    Alert.alert(
      t('action.delete_all'),
      'Delete all offline dictionaries? You\'ll need internet to look up words.',
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            for (const l2 of downloaded) {
              await deleteDictionary(l2);
            }
            setDownloaded(new Set());
          },
        },
      ],
    );
  };

  // ── Render helpers ──

  const renderLanguageRow = (l2: string, isDownloaded: boolean) => {
    const state = getDownloadState(l2);
    const status = statuses.get(l2);
    const isDownloading = state.status === 'downloading';
    const isFailed = state.status === 'failed';
    const name = getLanguageName(l2);

    return (
      <View key={l2} className="mb-2 rounded-lg border border-border bg-card p-3">
        {/* Header row */}
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">{name}</Text>
            <Text className="text-xs text-muted-foreground">{l2}</Text>
          </View>

          {isDownloading ? (
            <Pressable
              onPress={() => handleCancel(l2)}
              className="rounded-md bg-destructive/10 px-3 py-1.5"
            >
              <Text className="text-xs font-medium text-destructive">{t('action.cancel')}</Text>
            </Pressable>
          ) : isDownloaded && state.status !== 'downloading' ? (
            <View className="flex-row gap-1">
              <Pressable
                onPress={() => handleDownload(l2)}
                className="rounded-md bg-muted px-2 py-1.5"
              >
                <RefreshCw size={14} color={ICON_MUTED} />
              </Pressable>
              <Pressable
                onPress={() => handleDelete(l2)}
                className="rounded-md bg-destructive/10 px-2 py-1.5"
              >
                <Trash2 size={14} color={ICON_MUTED} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => handleDownload(l2)}
              className="rounded-md bg-primary/10 px-3 py-1.5"
            >
              <Text className="text-xs font-medium text-primary">{t('action.download')}</Text>
            </Pressable>
          )}
        </View>

        {/* Word count / size */}
        {isDownloaded && (
          <View className="mt-1 flex-row items-center gap-1">
            <CheckCircle2 size={12} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{t('label.saved')}</Text>
          </View>
        )}
        {!isDownloaded && status?.checked && status.available && (
          <Text className="mt-1 text-xs text-muted-foreground">
            {status.wordCount?.toLocaleString() ?? '?'} words
            {status.estimatedSizeBytes ? ` · ~${formatSize(status.estimatedSizeBytes)}` : ''}
          </Text>
        )}
        {!isDownloaded && status?.checked && !status.available && (
          <Text className="mt-1 text-xs text-muted-foreground">No frequency data available</Text>
        )}
        {!isDownloaded && !status?.checked && (
          <Text className="mt-1 text-xs text-muted-foreground">Checking…</Text>
        )}

        {/* Progress bar */}
        {isDownloading && (
          <View className="mt-2">
            <View className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${state.progress}%` }}
              />
            </View>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {state.downloaded.toLocaleString()} / {state.total.toLocaleString()} words · {state.progress}%
            </Text>
          </View>
        )}

        {/* Error state */}
        {isFailed && (
          <View className="mt-1 flex-row items-center gap-1">
            <AlertTriangle size={12} color={ICON_MUTED} />
            <Pressable onPress={() => handleDownload(l2)}>
              <Text className="text-xs text-destructive">
                {state.error ?? 'Download failed — tap to retry'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  // ── Group + sort languages ──
  const downloadedList = SUPPORTED_L2S.filter((l2) => downloaded.has(l2));

  // Available: not downloaded. Filter by search. Put current L2 first.
  const availableFiltered = useMemo(() => {
    let list = SUPPORTED_L2S.filter((l2) => !downloaded.has(l2));
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      list = list.filter((l2) => langMatchesSearch(l2, q, localeLangNames));
    }
    // Sort: current L2 first, then alphabetical by English name
    list = [...list].sort((a, b) => {
      if (a === currentL2) return -1;
      if (b === currentL2) return 1;
      return (enLangNames[a] ?? a).localeCompare(enLangNames[b] ?? b);
    });
    return list;
  }, [downloaded, searchQuery, currentL2, localeLangNames]);

  return (
    <ScrollView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-4 pt-6 pb-1">
        <Text className="text-3xl font-bold text-foreground">{t('title.offline_dictionaries')}</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Download dictionaries to look up words without an internet connection.
        </Text>
      </View>

      {/* L1≠en callout */}
      {!l1IsEn && (
        <View className="mx-4 mt-4 rounded-lg border border-border bg-card p-3">
          <View className="flex-row items-center gap-2">
            <AlertTriangle size={16} color={ICON_MUTED} />
            <Text className="text-sm font-medium text-foreground">Definitions are in English</Text>
          </View>
          <Text className="mt-1 text-xs text-muted-foreground">
            Offline dictionaries store English definitions. {l1Lang.name} translations are added as you look up words online.
          </Text>
        </View>
      )}

      {/* Downloaded section */}
      {downloadedList.length > 0 && (
        <View className="mt-5 px-4">
          <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-2">
            {t('label.downloaded')}
          </Text>
          {downloadedList.map((l2) => renderLanguageRow(l2, true))}
        </View>
      )}

      {/* Available section */}
      {availableFiltered.length > 0 && (
        <View className="mt-5 px-4">
          <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-2">
            {t('label.available')}
          </Text>

          {/* Search bar */}
          <View className="mb-3 flex-row items-center rounded-lg border border-border bg-muted px-3 py-2">
            <Search size={16} color={ICON_MUTED} />
            <TextInput
              className="flex-1 ml-2 text-sm text-foreground"
              placeholder="Search languages…"
              placeholderTextColor={ICON_MUTED}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Text className="text-xs text-primary">{t('action.close')}</Text>
              </Pressable>
            )}
          </View>

          {availableFiltered.map((l2) => renderLanguageRow(l2, false))}
        </View>
      )}

      {/* Delete All footer */}
      {downloadedList.length > 0 && (
        <View className="mx-4 mt-5 mb-8">
          <View className="border-t border-border pt-3 mb-3">
            <View className="flex-row items-center gap-2">
              <HardDrive size={14} color={ICON_MUTED} />
              <Text className="text-xs text-muted-foreground">
                Storage: {downloadedList.length} language{downloadedList.length > 1 ? 's' : ''} downloaded
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleDeleteAll}
            className="rounded-lg bg-destructive/10 py-3 items-center"
          >
            <Text className="text-sm font-medium text-destructive">{t('action.delete_all')}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
