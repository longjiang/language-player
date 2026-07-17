'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import { getSampleText } from '@/lib/sample-texts';
import {
  BookOpen, Loader2, Globe, FileText, ArrowLeftRight, Sparkles, PenLine,
} from 'lucide-react';

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1')
    .replace(/```[\s\S]*?```/g, '').replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/>\s/g, '')
    .replace(/[-*+]\s/g, '').replace(/\d+\.\s/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function blockTag(tb: TextBlock): keyof JSX.IntrinsicElements {
  switch (tb.type) {
    case 'heading': return `h${tb.depth ?? 1}` as keyof JSX.IntrinsicElements;
    case 'list-item': return 'li';
    case 'blockquote': return 'blockquote';
    default: return 'p';
  }
}

function blockClass(tb: TextBlock): string {
  const b = 'leading-relaxed';
  switch (tb.type) {
    case 'heading': {
      const s: Record<number, string> = { 1: 'text-2xl font-bold', 2: 'text-xl font-semibold', 3: 'text-lg font-semibold' };
      return `${b} ${s[tb.depth ?? 1] ?? 'text-base font-medium'} mb-3 mt-4`;
    }
    case 'paragraph': return `${b} mb-3`;
    case 'list-item': return `${b} mb-1 ml-4 list-disc`;
    case 'blockquote': return `${b} border-l-4 border-muted pl-4 italic text-muted-foreground mb-3`;
    default: return `${b} mb-3`;
  }
}

export interface ReaderPanelProps {
  l2: { code: string; name: string; direction?: string };
  l1: { code: string; name: string };
  text: string;
  translation: string;
  title: string;
  loading: boolean;
  activeTab: 'edit' | 'read';
  showTranslation: boolean;
  urlInput: string;
  isEditingTitle: boolean;
  blocks: ReaderBlock[] | null;
  blockTokens: LemmatizedToken[][] | null;
  tokenizing: boolean;
  ctx: Partial<SavedWordContext>;
  onTextChange: (text: string) => void;
  onTitleChange: (title: string) => void;
  onTranslationChange: (translation: string) => void;
  onTabChange: (tab: 'edit' | 'read') => void;
  onUrlInputChange: (url: string) => void;
  onUrlSubmit: (url: string) => void;
  onTokenize: () => void;
  onFillSample: (text: string, title: string) => void;
  onStartEditingTitle: () => void;
  onStopEditingTitle: () => void;
}

export function ReaderPanel({
  l2, l1,
  text, translation, title, loading,
  activeTab, showTranslation, urlInput,
  isEditingTitle,
  blocks, blockTokens, tokenizing,
  ctx,
  onTextChange, onTitleChange, onTranslationChange,
  onTabChange, onUrlInputChange, onUrlSubmit,
  onTokenize, onFillSample,
  onStartEditingTitle, onStopEditingTitle,
}: ReaderPanelProps) {
  const t = useT();

  return (
    <div className="min-w-0 flex-1">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={onStopEditingTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') onStopEditingTitle(); }}
              className="w-full rounded-md border border-primary bg-background px-2 py-1 text-xl font-bold outline-none"
              maxLength={200}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl font-bold truncate">{title || t('title.reader')}</h1>
              <button
                onClick={onStartEditingTitle}
                className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={t('action.edit')}
              >
                <PenLine className="h-4 w-4" />
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{l2.name} → {l1.name}</p>
        </div>
      </div>

      {/* Main card with tab bar */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex border-b border-border">
          <button
            onClick={() => onTabChange('edit')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'edit' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FileText className="h-4 w-4" />{t('action.edit')}
          </button>
          <button
            onClick={onTokenize}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'read' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <BookOpen className="h-4 w-4" />{t('action.read')}
          </button>
        </div>

        <div className="p-4">
          {/* URL input */}
          <form onSubmit={(e) => { e.preventDefault(); if (urlInput.trim()) onUrlSubmit(urlInput.trim()); }} className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input type="url" value={urlInput} onChange={(e) => onUrlInputChange(e.target.value)}
                placeholder={t('placeholder.paste_url', { l2: l2.name })}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
            </div>
            <Button type="submit" size="sm" disabled={!urlInput.trim() || loading}>{t('action.load')}</Button>
          </form>

          {/* Edit mode */}
          {activeTab === 'edit' && (
            <div className="space-y-3">
              <textarea value={text} onChange={(e) => onTextChange(e.target.value)}
                placeholder={t('placeholder.paste_l2_text', { l2: l2.name })}
                className="min-h-[40vh] w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'} lang={l2.code} />
              <div className="flex gap-2">
                {getSampleText(l2.code) && (
                  <Button variant="outline" size="sm" className="flex-1"
                    onClick={() => {
                      const sample = getSampleText(l2.code);
                      if (sample) onFillSample(sample.text, sample.title);
                    }}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />{t('action.fill_with_sample')}
                  </Button>
                )}
                <Button size="sm" className="flex-1" onClick={onTokenize}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />{t('action.tokenize')}
                </Button>
              </div>
              {showTranslation && (
                <textarea value={translation} onChange={(e) => onTranslationChange(e.target.value)}
                  placeholder={t('placeholder.paste_l1_translation', { l1: l1.name })}
                  className="min-h-[20vh] w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              )}
            </div>
          )}

          {/* Read mode */}
          {activeTab === 'read' && text && (
            <div className={showTranslation ? 'grid grid-cols-2 gap-6' : ''}>
              <div
                className="[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4
                  [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-3
                  [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2
                  [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1
                  [&_p]:mb-3 [&_p]:leading-relaxed
                  [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-3
                  [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-3
                  [&_li]:mb-1 [&_li]:leading-relaxed
                  [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-3
                  [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4
                  [&_a]:text-primary [&_a]:underline [&_a]:hover:no-underline
                  [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4
                  [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1 [&_th]:text-left
                  [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1
                  [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
                  [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-4
                  [&_hr]:border-border [&_hr]:my-6"
                lang={l2.code} dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'}
              >
                {(!blocks || tokenizing) && (
                  <>
                    {tokenizing && (
                      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> {t('msg.making_words_interactive')}
                      </div>
                    )}
                    <div>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                    </div>
                  </>
                )}
                {blocks && blockTokens && !tokenizing && (
                  <>
                    <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <Sparkles className="h-3 w-3" /> {t('msg.tap_any_word_to_lookup')}
                    </div>
                    {blocks.map((block, i) => {
                      if (block.kind === 'markdown') {
                        return <div key={i}><ReactMarkdown remarkPlugins={[remarkGfm]}>{block.raw}</ReactMarkdown></div>;
                      }
                      const tb = block as TextBlock;
                      const Tag = blockTag(tb);
                      const textBlockIndex = blocks.slice(0, i).filter((b): b is TextBlock => b.kind === 'text').length;
                      return (
                        <TextActionMenu key={i} text={tb.text} l2Code={l2.code} l1Code={l1.code}>
                          <Tag className={blockClass(tb)}>
                            <TokenizedText text={tb.text} l2Code={l2.code} textScale={0} context={ctx}
                              tokens={blockTokens[textBlockIndex]} />
                          </Tag>
                        </TextActionMenu>
                      );
                    })}
                  </>
                )}
                {!blocks && (
                  <TextActionMenu text={stripMarkdown(text)} l2Code={l2.code} l1Code={l1.code}>
                    <TokenizedText text={stripMarkdown(text)} l2Code={l2.code} textScale={1.15} context={ctx} />
                  </TextActionMenu>
                )}
              </div>
              {showTranslation && (
                <div className="rounded-lg border border-border bg-muted/30 p-6">
                  {translation ? (
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">{translation}</div>
                  ) : (
                    <div className="flex min-h-[20vh] flex-col items-center justify-center text-center text-sm text-muted-foreground">
                      <ArrowLeftRight className="mb-2 h-8 w-8 opacity-30" />
                      <p>{t('msg.no_translation_yet')}</p>
                      <p className="mt-1 text-xs">
                        {t.rich('msg.switch_to_edit_tab', { strong: (chunks) => <strong>{chunks}</strong> })}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {activeTab === 'read' && !text && !loading && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
              <BookOpen className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <h2 className="text-lg font-semibold text-muted-foreground">{t('title.reader')}</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {t('msg.reader_empty_state', { l2: l2.name })}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => onTabChange('edit')}>
                <FileText className="mr-1 h-4 w-4" />{t('action.start_writing')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
