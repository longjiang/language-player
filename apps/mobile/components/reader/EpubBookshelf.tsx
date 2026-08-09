import React, { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { BookOpen, MoreVertical, Trash2, Upload, X } from 'lucide-react-native';
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
 * progress, a remove action, an add-a-book slot, and a language filter that
 * only shows books tagged with the current L2 (books are tagged with the L2
 * they were uploaded under — no OPF language sniffing; only legacy untagged
 * books appear everywhere so they never disappear).
 */
export function EpubBookshelf({
  books,
  l2Code,
  l2Name,
  openingId,
  error,
  onOpenBook,
  onRemoveBook,
  onAddBook,
  loading = false,
}: EpubBookshelfProps) {
  const t = useT();
  const { width: windowWidth } = useResponsive();
  const [menuId, setMenuId] = useState<string | null>(null);

  const columns = windowWidth >= 1280 ? 5 : windowWidth >= 768 ? 4 : windowWidth >= 640 ? 3 : 2;
  const gap = 16;
  const cardWidth = Math.floor((windowWidth - 32 - gap * (columns - 1)) / columns);

  const visibleBooks = books.filter(
    (b) => !b.language || baseCode(b.language) === baseCode(l2Code),
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  const confirmRemove = (book: EpubSummary) => {
    setMenuId(null);
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

      {books.length === 0 ? (
        <>
          <AddBookTile width={cardWidth} onPress={onAddBook} t={t} />
          <Text className="mt-6 text-center text-sm text-muted-foreground">
            {t('msg.epub_library_empty')}
          </Text>
        </>
      ) : visibleBooks.length === 0 ? (
        <>
          <AddBookTile width={cardWidth} onPress={onAddBook} t={t} />
          <Text className="mt-6 text-center text-sm text-muted-foreground">
            {t('msg.epub_no_books_in_language', { language: l2Name })}
          </Text>
        </>
      ) : (
        <>
          <Text className="mb-3 text-lg font-semibold text-foreground">{t('title.my_books')}</Text>
          <View className="flex-row flex-wrap" style={{ gap }}>
            {visibleBooks.map((book) => {
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
                      {book.coverUrl ? (
                        <Image
                          source={{ uri: book.coverUrl }}
                          className="h-full w-full"
                          resizeMode="cover"
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

                    {/* Title + "..." menu */}
                    <View className="mt-2 flex-row items-center gap-1">
                      <Text className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" numberOfLines={1}>
                        {book.fileName.replace(/\.epub$/i, '')}
                      </Text>
                      <Pressable
                        onPress={() => setMenuId(menuId === book.id ? null : book.id)}
                        className="rounded p-1 active:bg-muted"
                        accessibilityLabel={t('action.more')}
                      >
                        <MoreVertical size={14} color={ICON_MUTED} />
                      </Pressable>
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

                  {/* "..." action menu */}
                  {menuId === book.id && (
                    <View className="absolute right-1 top-1 z-20 min-w-[140px] rounded-lg border border-border bg-card py-1 shadow-lg" style={{ elevation: 8 }}>
                      <Pressable
                        onPress={() => confirmRemove(book)}
                        className="flex-row items-center gap-2 px-3 py-2 active:bg-muted"
                      >
                        <Trash2 size={13} color={ICON_DESTRUCTIVE} />
                        <Text className="text-xs text-destructive">{t('action.remove')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setMenuId(null)}
                        className="flex-row items-center gap-2 px-3 py-2 active:bg-muted"
                      >
                        <X size={13} color={ICON_MUTED} />
                        <Text className="text-xs text-muted-foreground">{t('action.cancel')}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Add-a-book slot — dashed tile after the last book */}
            <AddBookTile width={cardWidth} onPress={onAddBook} t={t} />
          </View>
          {menuId !== null && (
            <Pressable onPress={() => setMenuId(null)} className="absolute inset-0 z-10" />
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
