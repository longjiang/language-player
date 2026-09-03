import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, Alert, ActivityIndicator, Animated, Platform, TextInput } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { Pressable } from '@/components/ui/pressable';
import { BookOpen, MoreVertical, Search, Upload, X } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { baseCode } from '@langplayer/utils';
import { ICON_MUTED, ICON_DESTRUCTIVE } from '@/lib/theme-colors';
import type { EpubSummary } from '@/lib/epub-store';

interface EpubBookshelfProps {
  /** Stored books (metadata only), sorted by last read. */
  books: EpubSummary[];
  /** Current target-language code — the shelf only shows books in it. */
  l2Code: string;
  /** Localized name of the target language (empty-state message). */
  l2Name: string;
  /** Id of the book currently being opened (spinner on its card). */
  openingId: string | null;
  /** Books currently being imported — one pulsating skeleton card each. */
  importing?: Array<{ id: string; fileName: string; phase: number }>;
  /** Localized import/parse error to display. */
  error?: string | null;
  /** Open a stored book at its saved location (straight to content). */
  onOpenBook: (id: string) => void;
  /** Remove a book from the shelf. */
  onRemoveBook: (id: string) => void;
  /** Import a new EPUB (document picker). */
  onAddBook: () => void;
  /** True while the shelf is loading for the first time. */
  loading?: boolean;
}

/**
 * Per-book EPUB bookshelf (SPEC-049 §9.2/9.3): cover tiles with reading
 * progress, a native "…" action menu (iOS UIMenu / Android PopupMenu via
 * `@react-native-menu/menu`), an add-a-book slot, and a language filter that
 * only shows books tagged with the current L2 (books are tagged with the L2
 * they were uploaded under — no OPF language sniffing; only legacy untagged
 * books appear everywhere so they never disappear).
 */
export function EpubBookshelf({
  books,
  l2Code,
  l2Name,
  openingId,
  importing = [],
  error,
  onOpenBook,
  onRemoveBook,
  onAddBook,
  loading = false,
}: EpubBookshelfProps) {
  const t = useT();
  const { width: windowWidth } = useResponsive();
  // Covers whose file:// URI can't be resolved (e.g. a purged temp cover)
  // fall back to the placeholder icon instead of an empty tile.
  const [coverFailedIds, setCoverFailedIds] = useState<Set<string>>(new Set());
  /** Bookshelf name filter — case-insensitive match on the file name. */
  const [filter, setFilter] = useState('');

  // iOS SF Symbol for a menu item; Android's PopupMenu renders text-only, so
  // no image is passed there. `imageColor` is REQUIRED on New-Architecture
  // builds running iOS 26+ (see ChannelActionsMenu) — the remove action uses
  // the destructive color so the icon matches the red label.
  const sf = (name: string) => (Platform.OS === 'ios' ? name : undefined);

  const columns = windowWidth >= 1280 ? 5 : windowWidth >= 768 ? 4 : windowWidth >= 640 ? 3 : 2;
  const gap = 16;
  const cardWidth = Math.floor((windowWidth - 32 - gap * (columns - 1)) / columns);

  const visibleBooks = books.filter(
    (b) => !b.language || baseCode(b.language) === baseCode(l2Code),
  );

  // Name filter: case-insensitive match against the file name with the
  // extension stripped, so "Botchan" finds "botchan.epub".
  const q = filter.trim().toLowerCase();
  const filteredBooks = q
    ? visibleBooks.filter((b) => {
        const name = b.fileName.replace(/\.[^.]+$/, '').toLowerCase();
        return name.includes(q) || b.fileName.toLowerCase().includes(q);
      })
    : visibleBooks;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // The "no books yet" empty states must not hide in-flight import skeletons.
  const showEmptyState = books.length === 0 && importing.length === 0;
  const showNoLanguage = !showEmptyState && books.length > 0 && visibleBooks.length === 0 && importing.length === 0;

  const confirmRemove = (book: EpubSummary) => {
    Alert.alert(
      book.fileName,
      t('msg.confirm_delete_book'),
      [
        { text: t('action.cancel'), style: 'cancel' },
        { text: t('action.remove'), style: 'destructive', onPress: () => onRemoveBook(book.id) },
      ],
    );
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 20 }}>
      {error ? (
        <View className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      ) : null}

      {showEmptyState ? (
        <>
          <AddBookTile width={cardWidth} onPress={onAddBook} t={t} />
          <Text className="mt-6 text-center text-sm text-muted-foreground">
            {t('msg.epub_library_empty')}
          </Text>
        </>
      ) : showNoLanguage ? (
        <>
          <AddBookTile width={cardWidth} onPress={onAddBook} t={t} />
          <Text className="mt-6 text-center text-sm text-muted-foreground">
            {t('msg.epub_no_books_in_language', { language: l2Name })}
          </Text>
        </>
      ) : (
        <>
          {/* Filter the shelf by book name — full width, larger. Password
              manager autofill is suppressed (this is a book filter, not a
              credential field). */}
          <View className="mb-3 flex-row items-center rounded-md border border-border bg-background px-3">
            <Search size={16} color={ICON_MUTED} />
            <TextInput
              value={filter}
              onChangeText={setFilter}
              placeholder={t('placeholder.filter_books')}
              placeholderTextColor={ICON_MUTED}
              className="ml-2 h-11 flex-1 py-1 text-sm text-foreground"
              accessibilityLabel={t('placeholder.filter_books')}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
            />
            {filter.length > 0 && (
              <Pressable
                onPress={() => setFilter('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('action.clear')}
                className="rounded p-1 active:bg-muted"
              >
                <X size={14} color={ICON_MUTED} />
              </Pressable>
            )}
          </View>

          {q && filteredBooks.length === 0 ? (
            <Text className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_results')}</Text>
          ) : (
          <View className="flex-row flex-wrap" style={{ gap }}>
            {filteredBooks.map((book) => {
              const pct = book.totalChars > 0
                ? Math.min(100, Math.round((book.readChars / book.totalChars) * 100))
                : null;
              return (
                <View key={book.id} style={{ width: cardWidth }}>
                  <Pressable
                    onPress={() => { if (openingId === null) onOpenBook(book.id); }}
                    className={`rounded-lg p-2 active:bg-muted ${openingId !== null ? 'opacity-70' : ''}`}
                  >
                    {/* Cover */}
                    <View className="relative w-full overflow-hidden rounded-md border border-border bg-muted" style={{ aspectRatio: 2 / 3 }}>
                      {book.coverUrl && !coverFailedIds.has(book.id) ? (
                        <Image
                          source={{ uri: book.coverUrl }}
                          className="h-full w-full"
                          resizeMode="cover"
                          onError={() =>
                            setCoverFailedIds((prev) => {
                              const next = new Set(prev);
                              next.add(book.id);
                              return next;
                            })
                          }
                        />
                      ) : (
                        <View className="h-full w-full items-center justify-center">
                          <BookOpen size={32} color={ICON_MUTED} style={{ opacity: 0.5 }} />
                        </View>
                      )}
                      {openingId === book.id && (
                        <View className="absolute inset-0 items-center justify-center bg-background/60">
                          <ActivityIndicator size="small" color={ICON_MUTED} />
                        </View>
                      )}
                    </View>

                    {/* Title row — right padding keeps the truncated title
                        clear of the "…" button, which floats above as a
                        sibling of the opening Pressable (see below). */}
                    <View className="mt-2 flex-row items-center">
                      <Text className="min-w-0 flex-1 truncate pr-7 text-sm font-medium text-foreground" numberOfLines={1}>
                        {book.fileName.replace(/\.epub$/i, '')}
                      </Text>
                    </View>

                    {pct !== null && (
                      <View className="mt-2 w-full">
                        <Text className="mb-1 text-xs text-muted-foreground">
                          {t('msg.epub_progress', { pct })}
                        </Text>
                        <View className="h-1 w-full overflow-hidden rounded-full bg-muted">
                          <View className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </View>
                      </View>
                    )}
                  </Pressable>

                  {/* "…" action menu — native UIMenu (iOS) / PopupMenu
                      (Android) via MenuView (same pattern as ChannelActionsMenu).
                      Rendered OUTSIDE the opening Pressable, as an absolutely
                      positioned sibling over the title row, so a tap on the
                      menu can never bubble to the book-open handler. */}
                  <View
                    className="absolute z-10"
                    style={{ right: 8, top: 16 + (cardWidth - 16) * 1.5 }}
                  >
                    <MenuView
                      onPressAction={({ nativeEvent }) => {
                        if (nativeEvent.event === 'remove') confirmRemove(book);
                      }}
                      actions={[
                        {
                          id: 'remove',
                          title: t('action.remove'),
                          attributes: { destructive: true },
                          image: sf('trash'),
                          imageColor: ICON_DESTRUCTIVE,
                        },
                      ]}
                    >
                      <Pressable
                        className="rounded p-1 active:bg-muted"
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('action.more')}
                      >
                        <MoreVertical size={14} color={ICON_MUTED} />
                      </Pressable>
                    </MenuView>
                  </View>
                </View>
              );
            })}

            {/* In-flight imports — one pulsating placeholder card each, with
                the title from the file name (known immediately). Phase is a
                coarse copy→parse→save progress over the import pipeline. */}
            {importing.map((item) => (
              <ImportingBookCard key={`importing-${item.id}`} width={cardWidth} item={item} />
            ))}

            {/* Add-a-book slot — dashed tile after the last book */}
            <AddBookTile width={cardWidth} onPress={onAddBook} t={t} />
          </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function AddBookTile({
  width,
  onPress,
  t,
}: {
  width: number;
  onPress: () => void;
  t: (id: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/30 p-3 active:bg-muted"
      style={{ width, aspectRatio: 2 / 3 }}
      accessibilityLabel={t('action.browse')}
    >
      <Upload size={24} color={ICON_MUTED} style={{ opacity: 0.5 }} />
      <Text className="my-3 text-center text-xs leading-snug text-muted-foreground">
        {t('msg.add_book')}
      </Text>
    </Pressable>
  );
}

/**
 * Pulsating placeholder card for a book being imported: the cover area is a
 * muted placeholder that pulses (opacity animation), the title comes from
 * the file name (known immediately), and a progress bar tracks the coarse
 * import phases (copy → parse → cover → save) inside the cover.
 */
function ImportingBookCard({
  width,
  item,
}: {
  width: number;
  item: { id: string; fileName: string; phase: number };
}) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    // Looping opacity pulse; stops when the card unmounts (import finished).
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const pct = Math.round(Math.min(1, Math.max(0, item.phase)) * 100);

  return (
    <View style={{ width }} accessibilityLabel={item.fileName}>
      <View className="rounded-lg p-2">
        <View className="relative w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted" style={{ aspectRatio: 2 / 3 }}>
          <Animated.View
            className="absolute inset-0 bg-muted-foreground/15"
            style={{ opacity: pulse }}
          />
          <BookOpen size={32} color={ICON_MUTED} style={{ opacity: 0.5 }} />
          {/* Import progress bar inside the book cover */}
          <View className="absolute bottom-2 left-2 right-2 h-1 overflow-hidden rounded-full bg-background/70">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </View>
        </View>
        <View className="mt-2 flex-row items-center">
          <Text
            className="min-w-0 flex-1 truncate pr-7 text-sm font-medium text-muted-foreground"
            numberOfLines={1}
          >
            {item.fileName.replace(/\.epub$/i, '')}
          </Text>
        </View>
      </View>
    </View>
  );
}
