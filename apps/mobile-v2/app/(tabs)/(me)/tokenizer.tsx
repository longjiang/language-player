import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useT } from '@/hooks/use-t';
import { DIRECTUS_URL } from '@/lib/api-url';
import { ICON_MUTED, ICON_ON_PRIMARY } from '@/lib/theme-colors';

/**
 * Tokenizer debug page — input text, see lemmatized tokens.
 * Matches Next.js /tokenizer functionality.
 */
export default function TokenizerScreen() {
  const t = useT();
  const [text, setText] = useState('');
  const [tokens, setTokens] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTokenize = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${DIRECTUS_URL}/lemmatize-normalized`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, l2: 'ja' }),
      });
      if (res.ok) {
        const data = await res.json();
        setTokens(data.tokens ?? data);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-background px-4 py-5">
      <Text className="text-xl font-bold text-foreground">Tokenizer</Text>
      <TextInput
        className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground"
        placeholder="Enter text to tokenize..."
        placeholderTextColor={ICON_MUTED}
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 80 }}
      />
      <Pressable
        onPress={handleTokenize}
        disabled={loading}
        className="mt-3 rounded-lg bg-primary px-6 py-3"
      >
        {loading ? (
          <ActivityIndicator size="small" color={ICON_ON_PRIMARY} />
        ) : (
          <Text className="text-center text-sm font-bold text-primary-foreground">Tokenize</Text>
        )}
      </Pressable>
      {tokens && (
        <View className="mt-4 rounded-lg border border-border bg-card p-4">
          {tokens.map((token, i) => (
            <View key={i} className="flex-row items-center gap-2 py-1">
              <Text className="text-sm font-medium text-foreground">{token.surface ?? token.text}</Text>
              <Text className="text-xs text-muted-foreground">→ {token.lemma}</Text>
              {token.pos && <Text className="text-xs text-muted-foreground">({token.pos})</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
