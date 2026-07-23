import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { Sparkles } from 'lucide-react-native';
import { TokenizedText } from '@/components/TokenizedText';

const SAMPLE_TEXTS: Record<string, string> = {
  zh: '首尔是韩国的首都，也是其经济、文化和政治的中心。这座沿着汉江的城市拥有现代的摩天大楼和传统的韩屋。',
  ja: 'ソウルは韓国の首都であり、経済、文化、政治の中心地です。漢江に沿ったこの都市は、現代的な高層ビルと伝統的な韓屋が共存しています。',
  ko: '서울은 대한민국의 수도이자 경제, 문화, 정치의 중심지입니다. 한강을 따라 자리잡은 이 도시는 현대적인 고층 빌딩과 전통적인 한옥이 공존하는 곳입니다.',
  ru: 'Сеул является столицей Южной Кореи и центром ее экономики, культуры и политики. Этот город вдоль реки Хан характеризуется современными небоскребами и традиционными ханоками.',
  es: 'Seúl es la capital de Corea del Sur y el centro de su economía, cultura y política. Esta ciudad a lo largo del río Han cuenta con rascacielos modernos y casas tradicionales hanok.',
  fr: "Séoul est la capitale de la Corée du Sud et le centre de son économie, de sa culture et de sa politique. Cette ville le long du fleuve Han présente des gratte-ciel modernes et des maisons traditionnelles hanok.",
  de: 'Seoul ist die Hauptstadt Südkoreas und das Zentrum seiner Wirtschaft, Kultur und Politik. Diese Stadt am Han-Fluss zeichnet sich durch moderne Wolkenkratzer und traditionelle Hanok-Häuser aus.',
  en: 'Seoul is the capital of South Korea and the center of its economy, culture, and politics. This city along the Han River features modern skyscrapers and traditional hanok houses.',
  ar: 'سيول هي عاصمة كوريا الجنوبية ومركز اقتصادها وثقافتها وسياستها. هذه المدينة الواقعة على طول نهر هان تتميز بناطحات السحاب الحديثة والمنازل التقليدية.',
  tr: "Seul, Güney Kore'nin başkenti ve ekonomisinin, kültürünün ve politikasının merkezidir. Han Nehri boyunca uzanan bu şehir, modern gökdelenler ve geleneksel hanok evleri ile turistlere çeşitli cazibeler sunmaktadır.",
  fa: 'سئول پایتخت کره جنوبی و مرکز اقتصاد، فرهنگ و سیاست آن است. این شهر در امتداد رودخانه هان دارای آسمان‌خراش‌های مدرن و خانه‌های سنتی هان‌اوک است.',
  vi: 'Seoul là thủ đô của Hàn Quốc và là trung tâm kinh tế, văn hóa và chính trị. Thành phố này dọc theo sông Hàn có các tòa nhà chọc trời hiện đại và những ngôi nhà hanok truyền thống.',
};

function getSampleText(code: string): string {
  return SAMPLE_TEXTS[code] ?? SAMPLE_TEXTS.en ?? 'Seoul is the capital...';
}

export default function TokenizerScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const [customText, setCustomText] = useState('');
  const [tokens, setTokens] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sampleText = getSampleText(l2Lang.code);

  const handleTokenize = async () => {
    const text = customText.trim() || sampleText;
    if (!text) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setTokens(null);

    try {
      const res = await fetch(`${PYTHON_API_URL}/lemmatize-normalized`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, l2: l2Lang.code }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!controller.signal.aborted) {
        setTokens(data.tokens ?? []);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (!controller.signal.aborted) {
        setTokens([{ text, lemmas: [] }]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const handleUseSample = () => {
    setCustomText(sampleText);
    setTokens(null);
  };

  return (
    <ScrollView className="flex-1 bg-background px-4 py-5">
      <Text className="text-2xl font-bold text-foreground">
        {t('title.tokenizer_test')}
      </Text>
      <Text className="mt-2 text-sm text-muted-foreground">
        {t('msg.tokenizer_desc', { l2: l2Lang.name })}
      </Text>

      {/* ── Input ── */}
      <View className="mt-6">
        <TextInput
          className="mb-4 min-h-[100px] rounded-lg border border-border bg-background p-4 text-sm text-foreground"
          value={customText}
          onChangeText={setCustomText}
          placeholder={t('placeholder.enter_text', { l2: l2Lang.name })}
          placeholderTextColor={ICON_MUTED}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View className="flex-row gap-2">
          <Pressable
            onPress={handleTokenize}
            disabled={!customText.trim() && !sampleText}
            className={`flex-row items-center rounded-lg px-4 py-2.5 ${
              !customText.trim() && !sampleText
                ? 'bg-muted'
                : 'bg-primary active:bg-primary/80'
            }`}
          >
            <Sparkles size={16} color="#fff" />
            <Text className="ml-2 text-sm font-medium text-primary-foreground">
              {t('action.tokenize')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleUseSample}
            className="flex-row items-center rounded-lg border border-border bg-card px-4 py-2.5 active:bg-muted"
          >
            <Text className="text-sm font-medium text-foreground">
              {t('action.use_sample_text')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Output ── */}
      {(loading || tokens) && (
        <View className="mt-8 rounded-lg border border-border bg-card p-6">
          <Text className="mb-4 text-sm font-medium text-muted-foreground">
            Tokenized Result
          </Text>
          {loading ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="text-sm text-muted-foreground">
                {t('msg.loading')}
              </Text>
            </View>
          ) : tokens && tokens.length > 0 ? (
            <TokenizedText
              text={customText.trim() || sampleText}
              l2Code={l2Lang.code}
              tokens={tokens}
            />
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
