import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { SUPPORTED_L2S, TOKENIZER_CONFIG } from '@langplayer/shared';
import enLocale from '@langplayer/shared/locales/en.json';
import { ContextMenu } from '@/components/ui/context-menu';
import type { ContextMenuItem } from '@/components/ui/context-menu';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { Download, Trash2, CheckCircle2, AlertTriangle, RefreshCw, Search } from 'lucide-react-native';
import { log } from '@/lib/logger';

// ── Language name lookup ─────────────────────

const enLangNames = (enLocale as any)?.lang ?? {};

function getLanguageName(code: string, localeNames?: Record<string, string>): string {
  return localeNames?.[code] ?? enLangNames[code] ?? code.toUpperCase();
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
  totalEntries: number;
  freqCount: number;
  downloaded: number;
  capped: boolean;
  version: string;
  checked: boolean;
}

// ── Popular languages (same as language picker) ──
const POPULAR_LANGUAGES = [
  'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi', 'id',
];

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Whether a language has a downloadable tokenizer/lemma pack that works
 *  independently of the offline dictionary. Dict-segmentation languages
 *  (zh, th, km, etc.) require the dictionary for word segmentation and
 *  are treated as not having a standalone tokenizer.
 *  Languages without one (Category E, ~146 langs) fall back to regex
 *  word-split + surface-as-lemma — text cannot be made interactive offline.
 *  See ARCH-018 for the per-language taxonomy. */
function hasLocalTokenizer(l2: string): boolean {
  const config = TOKENIZER_CONFIG[l2];
  if (!config) return false;
  // Dict-segmentation-only languages need the offline dictionary for
  // word segmentation — no standalone tokenizer.
  if (config.needsDictSegmentation && !config.needsKuromoji) return false;
  return true;
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
    getDownloadedCount,
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
  const [downloadedCounts, setDownloadedCounts] = useState<Map<string, number>>(new Map());
  // Force re-render for progress bars
  const [, setTick] = useState(0);

  const downloadingRef = useRef<Set<string>>(new Set());

  // ── Load downloaded status on mount ──
  useEffect(() => {
    (async () => {
      log('[OfflineDict] 🔍 checking already-downloaded dicts...');
      const dl = new Set<string>();
      const counts = new Map<string, number>();
      for (const l2 of SUPPORTED_L2S) {
        try {
          if (await isOfflineAvailable(l2)) {
            dl.add(l2);
            counts.set(l2, await getDownloadedCount(l2));
          }
        } catch {}
      }
      log('[OfflineDict] 📋 downloaded dicts found:', dl.size, '—', [...dl].join(', ') || '(none)');
      setDownloaded(dl);
      setDownloadedCounts(counts);
    })();
  }, []);

  // ── Load server availability in ONE request (instead of 210) ──
  useEffect(() => {
    (async () => {
      const fetchStart = Date.now();
      log('[OfflineDict] 🌐 GET /dictionary/download/languages (batch)');
      try {
        const baseUrl = require('@/lib/api-url').PYTHON_API_URL;
        const res = await fetch(`${baseUrl}/dictionary/download/languages`);
        const data = await res.json();
        const langs = (data.languages ?? {}) as Record<string, { totalEntries: number; freqCount: number; downloaded: number; capped: boolean; version: string }>;
        const count = Object.keys(langs).length;
        log('[OfflineDict] ✅ batch response —', count, 'languages — took', Date.now() - fetchStart, 'ms');
        log('[OfflineDict] 📋 available:', Object.keys(langs).sort().join(', '));

        const next = new Map<string, LangStatus>();
        for (const [l2, info] of Object.entries(langs)) {
          next.set(l2, {
            totalEntries: info.totalEntries,
            freqCount: info.freqCount,
            downloaded: info.downloaded,
            capped: info.capped,
            version: info.version,
            checked: true,
          });
        }
        // Mark remaining SUPPORTED_L2S as unavailable
        for (const l2 of SUPPORTED_L2S) {
          if (!next.has(l2)) {
            next.set(l2, { totalEntries: 0, freqCount: 0, downloaded: 0, capped: false, version: '', checked: true });
          }
        }
        setStatuses(next);
      } catch (e: any) {
        log('[OfflineDict] ❌ batch request failed:', e?.message ?? e);
      }
    })();
  }, []);

  // ── Tick poll: triggers re-renders for progress bars during download ──
  useEffect(() => {
    const interval = setInterval(() => {
      if (downloadingRef.current.size > 0) setTick((t) => t + 1);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // ── Actions ──

  const handleDownload = async (l2: string) => {
    log('[OfflineDict] 🚀 handleDownload — l2:', l2, '— timestamp:', Date.now());
    downloadingRef.current.add(l2);
    setTick((t) => t + 1);
    try {
      await startDownload(l2);
      // Move from available → downloaded immediately on success
      setDownloaded((prev) => new Set(prev).add(l2));
      const count = await getDownloadedCount(l2);
      setDownloadedCounts((prev) => new Map(prev).set(l2, count));
      log('[OfflineDict] ✅ handleDownload finished — l2:', l2, 'count:', count);
    } catch (e: any) {
      const wasCancelled = e?.message === 'Download cancelled';
      log('[OfflineDict]', wasCancelled ? '🛑 cancelled' : '❌ failed', '— l2:', l2, wasCancelled ? '' : `error: ${e?.message ?? e}`);
    } finally {
      downloadingRef.current.delete(l2);
      setTick((t) => t + 1);
    }
  };

  const handleCancel = (l2: string) => {
    log('[OfflineDict] 🛑 handleCancel — l2:', l2);
    cancelDownload(l2);
    downloadingRef.current.delete(l2);
    setTick((t) => t + 1);
  };

  const handleDelete = (l2: string) => {
    log('[OfflineDict] 🗑 handleDelete prompt — l2:', l2);
    Alert.alert(
      `${t('action.delete')} ${getLanguageName(l2, localeLangNames)}`,
      t('msg.confirm_delete_dictionary', { lang: getLanguageName(l2, localeLangNames) }),
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
      t('msg.confirm_delete_all_dictionaries'),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.delete_all'),
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
    const name = getLanguageName(l2, localeLangNames);

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

        {/* Word count / saved status */}
        {isDownloaded && (
          <View className="mt-1 flex-row items-center gap-1">
            <CheckCircle2 size={12} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">
              {t('label.downloaded')} · {t('label.words', { count: downloadedCounts.get(l2) ?? 0 })}
            </Text>
          </View>
        )}
        {!isDownloaded && status?.checked && status.totalEntries > 0 && (
        <Text className="mt-1 text-xs text-muted-foreground">
          {t('label.words', { count: status.downloaded })}
          {status.capped ? ` · ~${formatSize(status.downloaded * 80)}` : ` · ~${formatSize(status.totalEntries * 80)}`}
        </Text>
        )}
        {!isDownloaded && !status?.checked && (
          <Text className="mt-1 text-xs text-muted-foreground">{t('msg.checking')}</Text>
        )}

        {/* Tokenizer unavailable warning */}
        {!isDownloading && !isFailed && !hasLocalTokenizer(l2) && (
          <View className="mt-1 flex-row items-center gap-1">
            <AlertTriangle size={11} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{t('msg.cannot_make_text_interactive_offline')}</Text>
          </View>
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
              {state.phase === 'insert' ? (
                t('label.download_progress', { downloaded: String(state.downloaded), total: String(state.total) })
              ) : state.phase === 'dictionary' || state.phase === 'lemma' || state.phase === 'tokenizer' ? (
                t('log.downloading')
              ) : (
                t('log.processing')
              )}
            </Text>
          </View>
        )}

        {/* Error state */}
        {isFailed && (
          <View className="mt-1 flex-row items-center gap-1">
            <AlertTriangle size={12} color={ICON_MUTED} />
            <Pressable onPress={() => handleDownload(l2)}>
              <Text className="text-xs text-destructive">
                {state.error ?? t('msg.download_failed')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  // ── Group + sort languages ──
  const downloadedList = SUPPORTED_L2S.filter((l2) => downloaded.has(l2));

  // Filter downloaded list by search
  const filteredDownloaded = useMemo(() => {
    const q = searchQuery.trim();
    if (q.length === 0) return downloadedList;
    return downloadedList.filter((l2) => langMatchesSearch(l2, q, localeLangNames));
  }, [downloadedList, searchQuery, localeLangNames]);

  // Available: not downloaded. Filter by search. Popular first, then rest.
  const { availablePopular, availableRest, isSearching } = useMemo(() => {
    let list = SUPPORTED_L2S.filter((l2) => !downloaded.has(l2));
    const searching = searchQuery.trim().length > 0;
    if (searching) {
      const q = searchQuery.trim();
      list = list.filter((l2) => langMatchesSearch(l2, q, localeLangNames));
    }
    // Sort: current L2 first, then alphabetical by English name
    const sorted = [...list].sort((a, b) => {
      if (a === currentL2) return -1;
      if (b === currentL2) return 1;
      return (enLangNames[a] ?? a).localeCompare(enLangNames[b] ?? b);
    });
    // Split into popular + rest
    const popularSet = new Set(POPULAR_LANGUAGES);
    const popular = sorted.filter((l2) => popularSet.has(l2));
    const rest = sorted.filter((l2) => !popularSet.has(l2));
    return { availablePopular: popular, availableRest: rest, isSearching: searching };
  }, [downloaded, searchQuery, currentL2, localeLangNames]);

  return (
    <ScrollView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-start justify-between px-4 pt-6 pb-1">
        <View className="flex-1">
          <Text className="text-3xl font-bold text-foreground">{t('title.offline_dictionaries')}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {t('msg.offline_dictionaries_desc')}
          </Text>
        </View>
        {downloadedList.length > 0 && (
          <ContextMenu
            items={[
              {
                key: 'delete-all',
                icon: Trash2,
                label: t('action.delete_all'),
                destructive: true,
                onPress: handleDeleteAll,
              },
            ]}
            triggerClassName="rounded-lg p-2 -mt-1"
            triggerSize={20}
          />
        )}
      </View>

      {/* L1≠en callout */}
      {!l1IsEn && (
        <View className="mx-4 mt-4">
          <Text className="text-s text-warning">
            <Text className="font-semibold">⚠ {t('msg.offline_definitions_english')}</Text>
            {' '}{t('msg.offline_definitions_english_desc', { l1: l1Lang.name })}
          </Text>
        </View>
      )}

      {/* Search bar */}
      <View className="mx-4 mt-4 flex-row items-center rounded-lg border border-border bg-muted px-3 py-2">
        <Search size={16} color={ICON_MUTED} />
        <TextInput
          className="flex-1 ml-2 text-sm text-foreground"
          placeholder={t('placeholder.search_languages')}
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

      {/* Downloaded section */}
      {filteredDownloaded.length > 0 && (
        <View className="mt-5 px-4">
          {filteredDownloaded.map((l2) => renderLanguageRow(l2, true))}
        </View>
      )}

      {/* Available section */}
      <View className="mt-2 px-4">
        {availablePopular.length > 0 || availableRest.length > 0 ? (
          <>
            {!isSearching && availablePopular.length > 0 && (
              <View className="mb-1">
                <Text className="text-s mb-2 font-semibold text-muted-foreground uppercase tracking-wide">{t('msg.popular_languages')}</Text>
              </View>
            )}
            {availablePopular.map((l2) => renderLanguageRow(l2, false))}
            {!isSearching && availableRest.length > 0 && availablePopular.length > 0 && (
              <View className="my-2">
                <Text className="text-s font-semibold text-muted-foreground mb-2">{t('msg.all_languages')}</Text>
              </View>
            )}
            {availableRest.map((l2) => renderLanguageRow(l2, false))}
          </>
        ) : (
          <Text className="text-xs text-muted-foreground text-center py-4">
            {searchQuery.trim() ? t('msg.no_languages_match') : t('msg.all_languages_downloaded')}
          </Text>
        )}
      </View>


    </ScrollView>
  );
}
