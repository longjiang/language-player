'use client';

import { useCallback, useState } from 'react';
import { useStreamingExplanation } from '@langplayer/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/hooks/use-t';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { log } from '@/lib/logger';

/**
 * System-style preamble for docs questions: keeps the assistant focused on
 * how to use Language Player and honest about what it doesn't know.
 */
const ASK_AI_PREAMBLE =
  'You are the Language Player help assistant. Language Player is a language ' +
  'learning platform: authentic videos with interactive dual subtitles, a popup ' +
  'dictionary, a reader for ebooks/PDFs/images, saved words, SRS review, and ' +
  'device sync. Answer the question about how to use the app concisely and ' +
  'practically, in the user\u2019s own language. If you don\u2019t know, say so ' +
  'and point them to the documentation.';

/**
 * "Ask AI" chat for the docs: type a question about how to use the app and
 * stream an answer from the shared DeepSeek SSE pipeline (the same
 * `useStreamingExplanation` hook the text-action "AI explain" uses).
 */
export function AskAiDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useT();
  const [question, setQuestion] = useState('');
  const { text, error, loading, stream, reset } = useStreamingExplanation();

  const ask = useCallback(() => {
    const q = question.trim();
    if (!q || loading) return;
    log('Ask AI docs question', { chars: q.length });
    void stream(`${ASK_AI_PREAMBLE}\n\nQuestion: ${q}`);
  }, [question, loading, stream]);

  const close = useCallback(() => {
    onOpenChange(false);
    reset();
    setQuestion('');
  }, [onOpenChange, reset]);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? undefined : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('action.ask_ai')}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder={t('docs.ask_ai_placeholder')}
            rows={3}
            autoFocus
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={ask}
              disabled={loading || !question.trim()}
              className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {t('action.ask_ai')}
            </button>
          </div>
          {loading && !text && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('msg.loading')}
            </p>
          )}
          {text && (
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
              {text}
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ready-to-mount button + dialog pair: renders a "Ask AI" button (any
 * className) that opens the docs chat.
 */
export function AskAiButton({ className }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        title={t('action.ask_ai')}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {t('action.ask_ai')}
      </button>
      <AskAiDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
