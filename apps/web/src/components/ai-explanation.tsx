'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { PYTHON_API_URL } from '@/lib/api-url';
import { useSubscription } from '@/hooks/use-subscription';
import { useT } from '@/hooks/use-t';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, AlertCircle, RefreshCw, BookOpen } from 'lucide-react';

interface AiExplanationProps {
  /** The word being looked up. */
  word: string;
  /** The surrounding context sentence (the subtitle line). */
  contextText?: string;
  /** Whether the entry was found in the dictionary (affects prompt wording). */
  entryFound: boolean;
}

/**
 * "Let DeepSeek Explain" — Pro-only feature shown in the dictionary popup.
 *
 * Matches Classic + GO behaviour:
 * - Free users see an upgrade prompt
 * - Pro users get an AI explanation of the word in context
 * - The prompt follows the Classic format: succinctly explain the word in L1
 */
export function AiExplanation({ word, contextText, entryFound }: AiExplanationProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { isPro, loaded: subLoaded } = useSubscription();

  const [showAi, setShowAi] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openInReader = () => {
    localStorage.setItem('lp_reader_text', explanation ?? '');
    localStorage.setItem('lp_reader_title', `DeepSeek: ${word}`);
    router.push(`/${l1.code}/${l2.code}/reader`);
  };

  // Build the prompt matching Classic's chatGPTPrompt logic
  const buildPrompt = (): string => {
    const l1Name = l1.name;
    const l2Name = l2.name;
    const code = l2.code;

    let prompt: string;
    if (contextText) {
      prompt = `Succinctly explain using ${l1Name}, what the ${l2Name} (${code}) word ‘${word}’ means in the phrase ‘${contextText}’.`;
    } else {
      prompt = `Succinctly explain using ${l1Name}, what the ${l2Name} (${code}) word ‘${word}’ means.`;
    }

    // Languages that don't inflect don't need the morphology prompt
    const nonInflecting = ['zh', 'vi', 'th', 'lo', 'km'];
    if (!nonInflecting.includes(code)) {
      prompt += ' Give its pronunciation and morphology (or etymology if appropriate). If inflected, give its lemma and inflection; otherwise do not mention inflection or lemma.';
    }

    return prompt;
  };

  const fetchExplanation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExplanation('');

    const controller = new AbortController();

    try {
      const res = await fetch(`${PYTHON_API_URL}/chatgpt/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: buildPrompt() }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // keep incomplete last line

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6);
            if (payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.t) {
                setExplanation((prev) => (prev ?? '') + parsed.t);
              } else if (parsed.e) {
                setError(parsed.e);
              }
            } catch { /* malformed line, skip */ }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err?.message ?? 'Failed to get AI explanation.');
      }
    } finally {
      setLoading(false);
    }
  }, [buildPrompt]);

  // Fetch when "show AI" is toggled on
  useEffect(() => {
    if (showAi && explanation === null && !loading) {
      fetchExplanation();
    }
  }, [showAi, explanation, loading, fetchExplanation]);

  // Pro gate — still loading
  if (!subLoaded) return null;

  // Pro gate — free user
  if (!isPro) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center dark:border-amber-800 dark:bg-amber-950">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          {t('msg.ai_pro_feature')}
        </p>
      </div>
    );
  }

  // Not yet toggled — show the button
  if (!showAi) {
    return (
      <div className="mt-4">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={() => setShowAi(true)}
        >
          <Sparkles className="h-4 w-4" />
          {t('action.let_ai_explain')}
        </Button>
      </div>
    );
  }

  // Loading (no tokens yet)
  if (loading && !explanation) {
    return (
      <div className="mt-4 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('msg.getting_ai_response')}
        </div>
      </div>
    );
  }

  // Error
  if (error && !explanation) {
    return (
      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <div className="mb-2 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchExplanation}>
          <RefreshCw className="mr-1 h-3 w-3" /> {t('action.retry')}
        </Button>
      </div>
    );
  }

  // Streaming or complete — always show the explanation card
  if (explanation !== null) {
    return (
      <div className="mt-4 rounded-lg border bg-muted/30 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          {t('label.ai_says')}
          {loading && <Loader2 className="ml-2 h-3 w-3 animate-spin" />}
        </div>
        <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed">
          <ReactMarkdown>{explanation}</ReactMarkdown>
        </div>
        {error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-3 w-3" />
            {error}
          </div>
        )}
        {!loading && (
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" size="sm" onClick={fetchExplanation}>
              <RefreshCw className="mr-1 h-3 w-3" /> {t('action.regenerate')}
            </Button>
            <Button variant="ghost" size="sm" onClick={openInReader}>
              <BookOpen className="mr-1 h-3 w-3" /> {t('action.open_in_reader')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Fallback (shouldn't reach here)
  return null;
}
