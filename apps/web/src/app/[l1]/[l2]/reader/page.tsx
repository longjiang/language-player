'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '@/providers/language-provider';
import { TokenizedText } from '@/components/tokenized-text';
import type { LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { parseMarkdown, type ReaderBlock, type TextBlock } from '@/lib/parse-markdown';
import {
  BookOpen, Loader2, Globe, FileText, Columns2, ArrowLeftRight, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';import { getUseTraditional } from '@/lib/settings';
import { toTraditional } from '@/lib/chinese-script';
// Lazy-load turndown for HTML→markdown conversion
let _turndown: any = null;
async function getTurndown() {
  if (!_turndown) {
    const Turndown = (await import('turndown')).default;
    _turndown = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  }
  return _turndown;
}

/** Convert an HTML string to markdown using turndown. */
async function htmlToMarkdown(html: string, baseUrl: string): Promise<string> {
  // Parse and clean the HTML
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Remove non-content elements
  doc.querySelectorAll('script, style, nav, header, footer, aside, .sidebar, .menu, .navigation, .mw-jump-link, .mw-editsection, .reference, .noprint, .thumb, .infobox, .navbox, .metadata').forEach(el => el.remove());

  // Try to find main content (Wikipedia-specific)
  const mainContent = doc.querySelector('#mw-content-text') || doc.querySelector('article') || doc.body;

  // Make links absolute
  mainContent.querySelectorAll('a').forEach(el => {
    const href = el.getAttribute('href');
    if (href) {
      try { el.setAttribute('href', new URL(href, baseUrl).href); } catch {}
    }
  });

  const cleanedHtml = mainContent.innerHTML;
  const td = await getTurndown();
  return td.turndown(cleanedHtml);
}

const READER_TEXT_KEY = 'lp_reader_text';
const READER_TITLE_KEY = 'lp_reader_title';

/** Sample markdown texts for common L2 languages. */
const SAMPLE_TEXTS: Record<string, { title: string; text: string }> = {
  zh: {
    title: '首尔',
    text: `# 首尔

首尔是**韩国**的首都，也是其经济、文化和政治的中心。

## 历史

首尔有着超过**2000年**的历史。早在公元前18年，百济王国就在汉江流域建立了都城。

## 景点

- **景福宫**：建于1395年，是朝鲜王朝的正宫
- **南山塔**：首尔的地标建筑，可以俯瞰整个城市
- **明洞**：首尔最繁华的购物区之一

## 美食

首尔以多样的街头美食闻名，包括：

1. 韩式炸鸡
2. 炒年糕
3. 紫菜包饭

> 首尔是一座传统与现代完美融合的城市。
`,
  },
  ja: {
    title: 'ソウル',
    text: `# ソウル

ソウルは**韓国**の首都であり、経済、文化、政治の中心地です。

## 歴史

ソウルには**2000年以上**の歴史があります。紀元前18年、百済王国が漢江流域に都を置きました。

## 観光スポット

- **景福宮（キョンボックン）**：1395年に建てられた朝鮮王朝の正宮
- **南山タワー**：ソウルのランドマークで、市内を一望できます
- **明洞（ミョンドン）**：ソウルで最も賑やかなショッピングエリア

## 食べ物

ソウルは多様なストリートフードで有名です：

1. 韓国風フライドチキン
2. トッポッキ
3. キンパ

> ソウルは伝統と現代が見事に調和した都市です。
`,
  },
  ko: {
    title: '서울',
    text: `# 서울

서울은 **대한민국**의 수도이자 경제, 문화, 정치의 중심지입니다.

## 역사

서울은 **2000년 이상**의 역사를 가지고 있습니다. 기원전 18년, 백제 왕국이 한강 유역에 도읍을 정했습니다.

## 명소

- **경복궁**: 1395년에 지어진 조선 왕조의 정궁
- **남산타워**: 서울의 랜드마크로 도시 전체를 내려다볼 수 있습니다
- **명동**: 서울에서 가장 번화한 쇼핑 지역

## 음식

서울은 다양한 길거리 음식으로 유명합니다:

1. 한국식 프라이드 치킨
2. 떡볶이
3. 김밥

> 서울은 전통과 현대가 완벽하게 조화를 이루는 도시입니다.
`,
  },
  es: {
    title: 'Seúl',
    text: `# Seúl

Seúl es la capital de **Corea del Sur** y el centro de su economía, cultura y política.

## Historia

Seúl tiene más de **2000 años** de historia. Ya en el año 18 a.C., el reino de Baekje estableció su capital en la cuenca del río Han.

## Lugares de interés

- **Palacio Gyeongbokgung**: Construido en 1395, es el palacio principal de la dinastía Joseon
- **Torre Namsan**: El símbolo de Seúl, con vistas panorámicas de toda la ciudad
- **Myeongdong**: Una de las zonas comerciales más animadas de Seúl

## Comida

Seúl es famosa por su variada comida callejera:

1. Pollo frito coreano
2. Tteokbokki
3. Kimbap

> Seúl es una ciudad donde la tradición y la modernidad conviven en perfecta armonía.
`,
  },
  fr: {
    title: 'Séoul',
    text: `# Séoul

Séoul est la capitale de la **Corée du Sud** et le centre de son économie, de sa culture et de sa politique.

## Histoire

Séoul a plus de **2000 ans** d'histoire. Dès 18 avant J.-C., le royaume de Baekje a établi sa capitale dans le bassin du fleuve Han.

## Sites touristiques

- **Palais Gyeongbokgung** : Construit en 1395, c'est le palais principal de la dynastie Joseon
- **Tour Namsan** : L'emblème de Séoul, offrant une vue panoramique sur toute la ville
- **Myeongdong** : L'un des quartiers commerçants les plus animés de Séoul

## Cuisine

Séoul est réputée pour sa cuisine de rue variée :

1. Poulet frit coréen
2. Tteokbokki
3. Kimbap

> Séoul est une ville où tradition et modernité cohabitent en parfaite harmonie.
`,
  },
  de: {
    title: 'Seoul',
    text: `# Seoul

Seoul ist die Hauptstadt **Südkoreas** und das Zentrum seiner Wirtschaft, Kultur und Politik.

## Geschichte

Seoul blickt auf eine über **2000-jährige** Geschichte zurück. Bereits 18 v. Chr. errichtete das Königreich Baekje seine Hauptstadt im Han-Flussbecken.

## Sehenswürdigkeiten

- **Gyeongbokgung-Palast**: Erbaut 1395, der Hauptpalast der Joseon-Dynastie
- **Namsan-Turm**: Das Wahrzeichen Seouls mit Panoramablick über die Stadt
- **Myeongdong**: Eines der belebtesten Einkaufsviertel Seouls

## Essen

Seoul ist bekannt für sein vielfältiges Streetfood:

1. Koreanisches Brathähnchen
2. Tteokbokki
3. Kimbap

> Seoul ist eine Stadt, in der Tradition und Moderne in perfekter Harmonie koexistieren.
`,
  },
  en: {
    title: 'Seoul',
    text: `# Seoul

Seoul is the capital of **South Korea** and the center of its economy, culture, and politics.

## History

Seoul has over **2,000 years** of history. As early as 18 BCE, the Baekje Kingdom established its capital in the Han River basin.

## Attractions

- **Gyeongbokgung Palace**: Built in 1395, the main palace of the Joseon Dynasty
- **Namsan Tower**: Seoul's landmark offering panoramic views of the city
- **Myeongdong**: One of Seoul's busiest shopping districts

## Food

Seoul is famous for its diverse street food:

1. Korean fried chicken
2. Tteokbokki
3. Kimbap

> Seoul is a city where tradition and modernity coexist in perfect harmony.
`,
  },
};

function getSampleText(code: string): { title: string; text: string } | null {
  return SAMPLE_TEXTS[code] ?? SAMPLE_TEXTS[code.split('-')[0]!] ?? null;
}

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

export default function ReaderPage() {
  const searchParams = useSearchParams();
  const { l1, l2 } = useLanguage();
  const method = searchParams.get('method');
  const arg = searchParams.get('arg');

  const [text, setText] = useState('');
  const [translation, setTranslation] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'read'>('read');
  const [showTranslation, setShowTranslation] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  // Block-based interactive rendering
  const [blocks, setBlocks] = useState<ReaderBlock[] | null>(null);
  const [blockTokens, setBlockTokens] = useState<LemmatizedToken[][] | null>(null);
  const [tokenizing, setTokenizing] = useState(false);

  // Convert Simplified → Traditional when the user prefers traditional
  const isChinese = l2.code === 'zh' || l2.code.startsWith('zh-');
  const useTraditional = isChinese ? getUseTraditional() : false;
  const [convertedText, setConvertedText] = useState(text);
  const [converting, setConverting] = useState(false);

  // Script conversion effect (Chinese only)
  useEffect(() => {
    if (!isChinese || !text.trim() || !useTraditional) {
      setConvertedText(text);
      return;
    }
    let cancelled = false;
    setConverting(true);
    toTraditional(text).then((result) => {
      if (!cancelled) { setConvertedText(result); setConverting(false); }
    });
    return () => { cancelled = true; };
  }, [text, isChinese, useTraditional]);

  // Parse markdown into blocks (using converted text)
  useEffect(() => {
    if (!convertedText.trim()) { setBlocks(null); setBlockTokens(null); return; }
    try {
      const parsed = parseMarkdown(convertedText);
      setBlocks(parsed);
      setBlockTokens(null);
    } catch { setBlocks(null); setBlockTokens(null); }
  }, [convertedText]);

  // Batch-lemmatize all text blocks
  useEffect(() => {
    if (!blocks || !l2.code) return;
    const textBlocks = blocks.filter((b): b is TextBlock => b.kind === 'text');
    const texts = textBlocks.map(b => b.text);
    if (texts.length === 0) { setBlockTokens([]); return; }

    setTokenizing(true);
    let cancelled = false;
    fetch(`${PYTHON_API_URL}/lemmatize/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, l2: l2.code }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled) { setBlockTokens(data?.results ?? null); setTokenizing(false); } })
      .catch(() => { if (!cancelled) setTokenizing(false); });
    return () => { cancelled = true; };
  }, [blocks, l2.code]);

  // Load text from localStorage or query params
  useEffect(() => {
    const storedText = localStorage.getItem(READER_TEXT_KEY);
    const storedTitle = localStorage.getItem(READER_TITLE_KEY);
    if (storedText) {
      setText(storedText); setTitle(storedTitle || '');
      localStorage.removeItem(READER_TEXT_KEY); localStorage.removeItem(READER_TITLE_KEY);
      setActiveTab('read'); return;
    }
    if (method && arg) {
      if (['md', 'html', 'txt'].includes(method)) { setText(decodeURIComponent(arg)); setActiveTab('read'); }
      else if (method === 'md-url') loadUrl(arg, true);
      else if (method === 'html-url') loadUrl(arg, false);
    }
  }, []);

  const loadUrl = async (url: string, isMarkdown: boolean) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${PYTHON_API_URL}/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      if (isMarkdown) {
        setText(raw);
      } else {
        const md = await htmlToMarkdown(raw, url);
        setText(md);
      }
    } catch (err: any) { setError(err?.message || 'Failed to load URL'); }
    finally { setLoading(false); }
  };

  const ctx: Partial<SavedWordContext> = { text: stripMarkdown(text).slice(0, 200), textTitle: title || 'Reader' };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading text...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div><h1 className="text-xl font-bold">{title || 'Reader'}</h1>
            <p className="text-xs text-muted-foreground">{l2.name} → {l1.name}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
            <button onClick={() => setActiveTab('edit')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activeTab === 'edit' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <FileText className="mr-1 inline h-3 w-3" />Edit</button>
            <button onClick={() => setActiveTab('read')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activeTab === 'read' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <BookOpen className="mr-1 inline h-3 w-3" />Read</button>
          </div>
          {activeTab === 'read' && (
            <Button variant={showTranslation ? 'default' : 'outline'} size="sm" onClick={() => setShowTranslation(!showTranslation)}>
              <Columns2 className="mr-1 h-3.5 w-3.5" />Translation</Button>
          )}
        </div>
      </div>

      {/* URL input */}
      <form onSubmit={(e) => { e.preventDefault(); if (urlInput.trim()) loadUrl(urlInput.trim(), false); }} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste a URL to read a web page..."
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
        </div>
        <Button type="submit" size="sm" disabled={!urlInput.trim() || loading}>Load</Button>
      </form>

      {/* Edit mode */}
      {activeTab === 'edit' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Paste {l2.name} text here... (Markdown supported)
            </span>
            {getSampleText(l2.code) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const sample = getSampleText(l2.code);
                  if (sample) { setText(sample.text); setTitle(sample.title); }
                }}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Fill with sample
              </Button>
            )}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            placeholder={`Paste ${l2.name} text here... (Markdown supported)`}
            className="min-h-[40vh] w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'} lang={l2.code} />
          {showTranslation && (
            <textarea value={translation} onChange={(e) => setTranslation(e.target.value)}
              placeholder={`Paste ${l1.name} translation here...`}
              className="min-h-[20vh] w-full rounded-lg border border-border bg-background p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
          )}
        </div>
      )}

      {/* Read mode */}
      {activeTab === 'read' && text && (
        <div className={`${showTranslation ? 'grid grid-cols-2 gap-6' : ''}`}>
          <div
            className="rounded-lg border border-border bg-card p-6
              [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4
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
              [&_hr]:border-border [&_hr]:my-6
            "
            lang={l2.code} dir={l2.direction === 'rtl' ? 'rtl' : 'ltr'}
          >
            {/* Phase 1: ReactMarkdown while tokenizing */}
            {(!blocks || tokenizing) && (
              <>
                {tokenizing && (
                  <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Making words interactive...
                  </div>
                )}
                <div>
                  <ReactMarkdown>{text}</ReactMarkdown>
                </div>
              </>
            )}

            {/* Phase 2: Block-based interactive tokens */}
            {blocks && blockTokens && !tokenizing && (
              <>
                <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> Tap any word to look it up
                </div>
                {blocks.map((block, i) => {
                  if (block.kind === 'markdown') {
                    return (
                      <div key={i}>
                        <ReactMarkdown>{block.raw}</ReactMarkdown>
                      </div>
                    );
                  }
                  const tb = block as TextBlock;
                  const Tag = blockTag(tb);
                  const textBlockIndex = blocks.slice(0, i).filter((b): b is TextBlock => b.kind === 'text').length;
                  return (
                    <Tag key={i} className={blockClass(tb)}>
                      <TokenizedText text={tb.text} l2Code={l2.code} textScale={0} context={ctx}
                        tokens={blockTokens[textBlockIndex]} />
                    </Tag>
                  );
                })}
              </>
            )}

            {/* Fallback: block parser unavailable — plain TokenizedText */}
            {!blocks && (
              <TokenizedText text={stripMarkdown(text)} l2Code={l2.code} textScale={1.15} context={ctx} />
            )}
          </div>

          {/* Translation */}
          {showTranslation && (
            <div className="rounded-lg border border-border bg-muted/30 p-6">
              {translation ? (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{translation}</div>
              ) : (
                <div className="flex min-h-[20vh] flex-col items-center justify-center text-center text-sm text-muted-foreground">
                  <ArrowLeftRight className="mb-2 h-8 w-8 opacity-30" />
                  <p>No translation yet.</p>
                  <p className="mt-1 text-xs">Switch to <strong>Edit</strong> tab to paste a translation.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {activeTab === 'read' && !text && !loading && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
          <BookOpen className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold text-muted-foreground">Reader</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Paste {l2.name} text, load a URL, or open from an AI explanation. Tap any word to see its dictionary entry.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setActiveTab('edit')}>
            <FileText className="mr-1 h-4 w-4" />Start Writing</Button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950">{error}</div>
      )}
    </div>
  );
}
