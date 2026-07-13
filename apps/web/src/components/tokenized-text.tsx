'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { LemmatizedToken, Lemma } from '@langplayer/shared';
import { useDictionary } from '@langplayer/api-client';

export interface TokenizedTextProps {
  text: string;
  l2Code: string;
  /** Scale factor for text size (default: 1) */
  textScale?: number;
}

/**
 * Displays text with each word tokenized and lemmatized.
 * Tokens are clickable — clicking shows lemma info and enables dictionary lookup.
 */
export const TokenizedText: React.FC<TokenizedTextProps> = ({
  text,
  l2Code,
  textScale = 1,
}) => {
  const dict = useDictionary();
  const [tokens, setTokens] = useState<LemmatizedToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<LemmatizedToken | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tokenize = async () => {
      if (!text.trim()) {
        setTokens([]);
        return;
      }

      setLoading(true);
      setError(null);
      setSelectedToken(null);

      try {
        const response = await dict.tokenize(text, l2Code);
        if (!cancelled) {
          setTokens(response.data.tokens);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Tokenization failed');
          // Fallback: show text as single token
          setTokens([{ text, lemmas: [] }]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    tokenize();
    return () => { cancelled = true; };
  }, [text, l2Code]);

  const handleTokenClick = useCallback((token: LemmatizedToken) => {
    setSelectedToken(prev => prev === token ? null : token);
  }, []);

  if (loading) {
    return (
      <div className="text-muted-foreground animate-pulse" style={{ fontSize: `${textScale}rem` }}>
        {text}
      </div>
    );
  }

  if (error && tokens.length <= 1) {
    return (
      <div className="text-muted-foreground" style={{ fontSize: `${textScale}rem` }}>
        {text}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-0.5 leading-relaxed">
        {tokens.map((token, i) => (
          <TokenSpan
            key={i}
            token={token}
            textScale={textScale}
            isSelected={selectedToken === token}
            onClick={() => handleTokenClick(token)}
          />
        ))}
      </div>

      {/* Token detail popup */}
      {selectedToken && selectedToken.lemmas.length > 0 && (
        <div className="mt-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <div className="mb-1 text-sm font-medium text-muted-foreground">
            <span className="text-lg font-semibold text-foreground">{selectedToken.text}</span>
            {selectedToken.pronunciation && (
              <span className="ml-2 text-base">/{selectedToken.pronunciation}/</span>
            )}
          </div>
          <div className="mt-2 space-y-1">
            {selectedToken.lemmas.map((lemma, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{lemma.lemma}</span>
                {lemma.part_of_speech && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {lemma.part_of_speech}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** Individual token span */
const TokenSpan: React.FC<{
  token: LemmatizedToken;
  textScale: number;
  isSelected: boolean;
  onClick: () => void;
}> = ({ token, textScale, isSelected, onClick }) => {
  const isWord = token.lemmas.length > 0;

  if (!isWord) {
    // Punctuation or spaces — render as-is
    return (
      <span style={{ fontSize: `${textScale}rem` }}>
        {token.text}
      </span>
    );
  }

  return (
    <span
      onClick={onClick}
      className={`
        cursor-pointer rounded px-0.5 transition-colors
        ${isSelected
          ? 'bg-primary/20 text-primary'
          : 'hover:bg-muted/80'
        }
      `}
      style={{ fontSize: `${textScale}rem` }}
      title={token.lemmas.map(l => l.lemma).join(', ')}
    >
      {token.text}
    </span>
  );
};

TokenizedText.displayName = 'TokenizedText';

export default TokenizedText;
