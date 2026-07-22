import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, Animated } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useReaderNotes } from '@/hooks/use-reader-notes';
import { apiClient } from '@langplayer/api-client';
import type { NoteListItem } from '@langplayer/shared';
import { BookOpen, PenLine, Plus, Trash2, StickyNote } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { DictionaryPopup } from '@/components/dictionary/DictionaryPopup';

export default function ReaderScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const notes = useReaderNotes(l2Lang.code);

  const [text, setText] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'read'>('edit');
  const [tokens, setTokens] = useState<any[] | null>(null);
  const [tokenizing, setTokenizing] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation when tokenizing
  useEffect(() => {
    if (tokenizing) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [tokenizing, pulseAnim]);

  // When current note changes, load its text
  useEffect(() => {
    if (notes.currentNote) {
      setText(notes.currentNote.text ?? '');
      setActiveTab('read');
      setTokens(null);
    }
  }, [notes.currentNoteId]);

  // Tokenize text
  const handleTokenize = useCallback(async () => {
    setTokenizing(true);
    try {
      const res = await fetch(`${apiClient.defaults.baseURL}/lemmatize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, l2: l2Lang.code }),
      });
      if (res.ok) {
        const data = await res.json();
        setTokens(data.tokens ?? []);
        setActiveTab('read');
      }
    } catch {}
    finally { setTokenizing(false); }
  }, [text, l2Lang.code]);

  // Auto-save with 2s debounce
  const autoSave = useCallback((newText: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!notes.currentNoteId) return;
      setSaving(true);
      await notes.saveNote(notes.currentNoteId, newText, '');
      setSaving(false);
    }, 2000);
  }, [notes]);

  const handleTextChange = (newText: string) => {
    setText(newText);
    autoSave(newText);
  };

  // Rename
  const handleRenameSubmit = async () => {
    if (renameId !== null && renameText.trim()) {
      await notes.renameNote(renameId, renameText.trim());
      setRenameId(null);
    }
  };

  // Delete
  const handleDelete = (noteId: number) => {
    Alert.alert(t('action.delete'), t('msg.confirm_delete_note'), [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('action.delete'), style: 'destructive', onPress: () => notes.deleteNote(noteId) },
    ]);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 py-5">
        <Text className="text-xl font-bold text-foreground">{t('title.notes_reader')}</Text>
      </View>

      {/* Tab bar + actions */}
      <View className="flex-row items-center border-b border-border px-4">
        <Pressable
          onPress={() => setActiveTab('edit')}
          className={`mr-4 flex-row items-center gap-1.5 border-b-2 py-2 ${activeTab === 'edit' ? 'border-primary' : 'border-transparent'}`}
        >
          <PenLine size={14} color={ICON_MUTED} />
          <Text className={`text-sm font-medium ${activeTab === 'edit' ? 'text-foreground' : 'text-muted-foreground'}`}>
            {t('action.edit') ?? 'Edit'}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleTokenize}
          className={`flex-row items-center gap-1.5 border-b-2 py-2 ${activeTab === 'read' ? 'border-primary' : 'border-transparent'}`}
        >
          <BookOpen size={14} color={ICON_MUTED} />
          <Text className={`text-sm font-medium ${activeTab === 'read' ? 'text-foreground' : 'text-muted-foreground'}`}>
            {t('action.read') ?? 'Read'}
          </Text>
        </Pressable>
        <View className="flex-1" />
        {saving && <Text className="mr-2 text-xs text-muted-foreground">Saving…</Text>}
        <Pressable
          onPress={() => setSidebarOpen(!sidebarOpen)}
          className="rounded p-1.5 active:bg-muted"
        >
          <StickyNote size={18} color={ICON_MUTED} />
        </Pressable>
      </View>

      {/* Main content */}
      <View className="flex-1 flex-row">
        {/* Editor / Reader */}
        <View className="flex-1">
          {activeTab === 'edit' && !tokenizing && (
            <TextInput
              className="flex-1 p-4 text-sm text-foreground"
              placeholder={t('placeholder.search_dots') ?? 'Type or paste text here…'}
              placeholderTextColor={ICON_MUTED}
              value={text}
              onChangeText={handleTextChange}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
          {tokenizing && (
            <ScrollView className="flex-1 p-4">
              <Animated.View style={{ opacity: pulseAnim }}>
                <Text className="text-base leading-relaxed text-muted-foreground">{text}</Text>
              </Animated.View>
              <Text className="mt-2 text-xs text-muted-foreground">{t('msg.making_words_interactive')}</Text>
            </ScrollView>
          )}
          {activeTab === 'read' && !tokenizing && (
            <ScrollView className="flex-1 p-4">
              {tokens ? (
                tokens.map((token: any, i: number) => (
                  <Text
                    key={i}
                    onPress={() => token.text && setSelectedWord(token.text)}
                    className="text-base leading-relaxed text-foreground"
                  >
                    {token.lemmas?.length > 0
                      ? token.text
                      : token.text}{' '}
                  </Text>
                ))
              ) : (
                <Text className="text-base leading-relaxed text-foreground">{text}</Text>
              )}
            </ScrollView>
          )}
        </View>

        {/* Notes sidebar */}
        {sidebarOpen && (
          <View className="w-56 border-l border-border bg-card">
            <View className="border-b border-border px-3 py-2">
              <Text className="text-sm font-semibold text-foreground">{t('title.notes')}</Text>
            </View>
            <Pressable
              onPress={() => notes.createNote()}
              className="mx-3 my-2 flex-row items-center gap-1.5 rounded-lg border border-border px-3 py-2 active:bg-muted"
            >
              <Plus size={14} color={ICON_MUTED} />
              <Text className="text-xs text-foreground">{t('action.new_note')}</Text>
            </Pressable>

            <ScrollView className="flex-1">
              {notes.notesLoading && (
                <ActivityIndicator size="small" color={ICON_MUTED} style={{ marginTop: 20 }} />
              )}
              {notes.notesError && (
                <Text className="px-3 py-4 text-xs text-red-500">{notes.notesError}</Text>
              )}
              {!notes.notesLoading && notes.notes.length === 0 && (
                <Text className="px-3 py-4 text-xs text-muted-foreground">{t('msg.no_notes_yet')}</Text>
              )}
              {notes.notes.map((n) => (
                <View key={n.id}>
                  {renameId === n.id ? (
                    <View className="flex-row items-center px-2 py-1">
                      <TextInput
                        className="flex-1 rounded border border-border px-2 py-1 text-xs text-foreground"
                        value={renameText}
                        onChangeText={setRenameText}
                        onSubmitEditing={handleRenameSubmit}
                        onBlur={handleRenameSubmit}
                        autoFocus
                      />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => notes.selectNote(n.id)}
                      onLongPress={() => {
                        setRenameId(n.id);
                        setRenameText(n.title ?? '');
                      }}
                      className={`flex-row items-center gap-2 px-3 py-2 active:bg-muted ${notes.currentNoteId === n.id ? 'bg-primary/10' : ''}`}
                    >
                      <StickyNote size={14} color={ICON_MUTED} />
                      <View className="flex-1">
                        <Text className={`text-sm truncate ${notes.currentNoteId === n.id ? 'font-medium text-primary' : 'text-foreground'}`} numberOfLines={1}>
                          {n.title ?? t('msg.untitled_note')}
                        </Text>
                        {n.created_on && (
                          <Text className="text-xs text-muted-foreground">
                            {new Date(n.created_on).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                      <Pressable onPress={() => handleDelete(n.id)} className="rounded p-1 active:bg-muted">
                        <Trash2 size={12} color={ICON_MUTED} />
                      </Pressable>
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
      <DictionaryPopup
        visible={!!selectedWord}
        word={selectedWord ?? ''}
        onClose={() => setSelectedWord(null)}
      />
    </View>
  );
}
