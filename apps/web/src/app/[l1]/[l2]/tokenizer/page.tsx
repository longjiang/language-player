'use client';

import { useState } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { TokenizedText } from '@/components/tokenized-text';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

const SAMPLE_TEXTS: Record<string, string> = {
  zh: '首尔是韩国的首都，也是其经济、文化和政治的中心。这座沿着汉江的城市拥有现代的摩天大楼和传统的韩屋。',
  'zh-Hans': '首尔是韩国的首都，也是其经济、文化和政治的中心。这座沿着汉江的城市拥有现代的摩天大楼和传统的韩屋。',
  'zh-Hant': '首爾是韓國的首都，也是其經濟、文化和政治的中心。這座沿著漢江的城市擁有現代的摩天大樓和傳統的韓屋。',
  ja: 'ソウルは韓国の首都であり、経済、文化、政治の中心地です。漢江に沿ったこの都市は、現代的な高層ビルと伝統的な韓屋が共存しています。',
  ko: '서울은 대한민국의 수도이자 경제, 문화, 정치의 중심지입니다. 한강을 따라 자리잡은 이 도시는 현대적인 고층 빌딩과 전통적인 한옥이 공존하는 곳입니다.',
  ru: 'Сеул является столицей Южной Кореи и центром ее экономики, культуры и политики. Этот город вдоль реки Хан характеризуется современными небоскребами и традиционными ханоками.',
  es: 'Seúl es la capital de Corea del Sur y el centro de su economía, cultura y política. Esta ciudad a lo largo del río Han cuenta con rascacielos modernos y casas tradicionales hanok.',
  fr: "Séoul est la capitale de la Corée du Sud et le centre de son économie, de sa culture et de sa politique. Cette ville le long du fleuve Han présente des gratte-ciel modernes et des maisons traditionnelles hanok.",
  de: 'Seoul ist die Hauptstadt Südkoreas und das Zentrum seiner Wirtschaft, Kultur und Politik. Diese Stadt am Han-Fluss zeichnet sich durch moderne Wolkenkratzer und traditionelle Hanok-Häuser aus.',
  en: 'Seoul is the capital of South Korea and the center of its economy, culture, and politics. This city along the Han River features modern skyscrapers and traditional hanok houses.',
  ar: 'سيول هي عاصمة كوريا الجنوبية ومركز اقتصادها وثقافتها وسياستها. هذه المدينة الواقعة على طول نهر هان تتميز بناطحات السحاب الحديثة والمنازل التقليدية.',
  tr: 'Seul, Güney Kore\'nin başkenti ve ekonomisinin, kültürünün ve politikasının merkezidir. Han Nehri boyunca uzanan bu şehir, modern gökdelenler ve geleneksel hanok evleri ile turistlere çeşitli cazibeler sunmaktadır.',
  fa: 'سئول پایتخت کره جنوبی و مرکز اقتصاد، فرهنگ و سیاست آن است. این شهر در امتداد رودخانه هان دارای آسمان‌خراش‌های مدرن و خانه‌های سنتی هان‌اوک است.',
  vi: 'Seoul là thủ đô của Hàn Quốc và là trung tâm kinh tế, văn hóa và chính trị. Thành phố này dọc theo sông Hàn có các tòa nhà chọc trời hiện đại và những ngôi nhà hanok truyền thống.',
};

function getSampleText(code: string): string {
  return SAMPLE_TEXTS[code] ?? SAMPLE_TEXTS.en ?? 'Seoul is the capital...';
}

export default function TokenizerPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const [customText, setCustomText] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [key, setKey] = useState(0); // force remount

  const sampleText = getSampleText(l2.code);

  const handleUseSample = () => {
    setCustomText(sampleText);
    setDisplayText(sampleText);
    setKey(k => k + 1);
  };

  const handleTokenize = () => {
    const text = customText.trim() || sampleText;
    setDisplayText(text);
    setKey(k => k + 1);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold">Tokenizer Test</h1>
      <p className="mt-2 text-muted-foreground">
        Tokenization + lemmatization for {languageName(l2.code)}. Click any word to see its lemma.
      </p>

      {/* ── Input ── */}
      <div className="mt-8 space-y-4">
        <textarea
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder={`Enter text in ${languageName(l2.code)}...`}
          className="w-full min-h-[100px] rounded-lg border bg-background p-4 text-sm"
          rows={4}
        />
        <div className="flex gap-2">
          <Button onClick={handleTokenize} disabled={!customText.trim() && !sampleText}>
            <Sparkles className="mr-2 h-4 w-4" />
            Tokenize
          </Button>
          <Button variant="outline" onClick={handleUseSample}>
            Use Sample Text
          </Button>
        </div>
      </div>

      {/* ── Output ── */}
      {displayText && (
        <div className="mt-8 rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Tokenized Result</h2>
          <TokenizedText key={key} text={displayText} l2Code={l2.code} textScale={1.2} />
        </div>
      )}
    </div>
  );
}
