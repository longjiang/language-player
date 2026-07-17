import React from "react";
import { View, StyleSheet } from "react-native";
import { TokenizedText } from "@/components/TokenizedText";
import { ThemedScreen } from "@/components/ThemedScreen";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useLanguage } from "@/contexts/LanguageContext";
import { router } from "expo-router";
import { Link } from "@react-navigation/native";
import { ThemedButton } from "@/components/ThemedButton";

// Sample texts for different languages
const sampleTexts = {
  ko: "서울은 대한민국의 수도이자 경제, 문화, 정치의 중심지입니다. 한강을 따라 자리잡은 이 도시는 현대적인 고층 빌딩과 전통적인 한옥이 공존하는 곳으로, 관광객들에게 다양한 매력을 제공합니다. 광화문, 경복궁, 남산타워와 같은 명소는 서울을 방문하는 이들이 꼭 찾아야 할 장소입니다.",
  en: "Seoul is the capital of South Korea and the center of its economy, culture, and politics. This city along the Han River features modern skyscrapers and traditional hanok houses, offering a variety of attractions to tourists. Landmarks such as Gwanghwamun, Gyeongbokgung, and Namsan Tower are must-visit places for those visiting Seoul.",
  zh: "首尔是韩国的首都，也是其经济、文化和政治的中心。这座沿着汉江的城市拥有现代的摩天大楼和传统的韩屋，向游客提供各种各样的魅力。景福宫、南山塔等地标是访问首尔的游客必去的地方。",
  es: "Seúl es la capital de Corea del Sur y el centro de su economía, cultura y política. Esta ciudad a lo largo del río Han cuenta con rascacielos modernos y casas tradicionales hanok, ofreciendo una variedad de atracciones a los turistas. Lugares emblemáticos como Gwanghwamun, Gyeongbokgung y la Torre Namsan son visitas obligadas para quienes visitan Seúl.",
  fr: "Séoul est la capitale de la Corée du Sud et le centre de son économie, de sa culture et de sa politique. Cette ville le long du fleuve Han présente des gratte-ciel modernes et des maisons traditionnelles hanok, offrant diverses attractions aux touristes. Les monuments tels que Gwanghwamun, Gyeongbokgung et la tour Namsan sont des lieux incontournables pour ceux qui visitent Séoul.",
  de: "Seoul ist die Hauptstadt Südkoreas und das Zentrum seiner Wirtschaft, Kultur und Politik. Diese Stadt am Han-Fluss zeichnet sich durch moderne Wolkenkratzer und traditionelle Hanok-Häuser aus und bietet Touristen eine Vielzahl von Attraktionen. Wahrzeichen wie Gwanghwamun, Gyeongbokgung und der Namsan-Turm sind ein Muss für Besucher Seouls.",
  ja: "ソウルは韓国の首都であり、経済、文化、政治の中心地です。漢江に沿ったこの都市は、現代的な高層ビルと伝統的な韓屋が共存しており、観光客に多様な魅力を提供します。光化門、景福宮、南山タワーなどのランドマークは、ソウルを訪れる人々が必ず訪れるべき場所です。",
  ru: "Сеул является столицей Южной Кореи и центром ее экономики, культуры и политики. Этот город вдоль реки Хан характеризуется современными небоскребами и традиционными ханоками, предлагая туристам разнообразные достопримечательности. Такие знаковые места, как Кванхвамун, Кенбоккун и Башня Намсан, являются обязательными для посещения в Сеуле.",
  it: "Seul è la capitale della Corea del Sud e il centro della sua economia, cultura e politica. Questa città lungo il fiume Han presenta grattacieli moderni e case tradizionali hanok, offrendo una varietà di attrazioni ai turisti. I punti di riferimento come Gwanghwamun, Gyeongbokgung e la Torre di Namsan sono luoghi da visitare assolutamente per chi visita Seul.",
  my: "ဆိုးလ်မြို့သည် ကားမြို့တော်ဖြစ်ပြီး စီးပွားရေး၊ ယဉ်ကျေးမှုနှင့် နိုင်ငံရေး၏ အလယ်ဗဟို ဖြစ်သည်။ ဟန်မြစ်အနီးရှိ ဤမြို့တွင် ခေတ်မှီသော မြင့်မားသော အဆောက်အဦများနှင့် ရိုးရာ ဟန်အိုးအိမ်များရှိပြီး ခရီးသည်များအတွက် အမျိုးမျိုးသော ဆွဲဆောင်မှုများကို ပေးစွမ်းပါသည်။ Gwanghwamun၊ Gyeongbokgung နှင့် Namsan Tower ကဲ့သို့သော အထိမ်းအမှတ် နေရာများသည် ဆိုးလ်ကို ရောက်သောသူများအတွက် မဖြစ်မနေ လည်ပတ်သင့်သော နေရာများဖြစ်သည်။",
  fa: "سئول پایتخت کره جنوبی و مرکز اقتصاد، فرهنگ و سیاست آن است. این شهر در امتداد رودخانه هان دارای آسمان‌خراش‌های مدرن و خانه‌های سنتی هان‌اوک است که جذابیت‌های متنوعی را به گردشگران ارائه می‌دهد. بناهایی مانند گوانگ‌هوا‌مون، گیونگ‌بوک‌گونگ و برج نامسان از مکان‌هایی هستند که بازدیدکنندگان سئول باید حتماً از آنها بازدید کنند.",
  tr: "Seul, Güney Kore'nin başkenti ve ekonomisinin, kültürünün ve politikasının merkezidir. Han Nehri boyunca uzanan bu şehir, modern gökdelenler ve geleneksel hanok evleri ile turistlere çeşitli cazibeler sunmaktadır. Gwanghwamun, Gyeongbokgung ve Namsan Kulesi gibi simge yapılar, Seul'u ziyaret edenlerin mutlaka görmesi gereken yerlerdir.",
  ar: "سيول هي عاصمة كوريا الجنوبية ومركز اقتصادها وثقافتها وسياستها. هذه المدينة الواقعة على طول نهر هان تتميز بناطحات السحاب الحديثة والمنازل التقليدية (هان أوك)، وتوفر مجموعة متنوعة من الجاذبيات للسياح. المعالم مثل غوانغهوامون، قصر جيونجبوك، وبرج نامسان هي أماكن لا بد من زيارتها لأولئك الذين يزورون سيول.",
};



function getSampleText(languageCode: string): string {
  return sampleTexts[languageCode as keyof typeof sampleTexts] || sampleTexts.en;
}

function Test() {
  const { l2Lang } = useLanguage();
  if (!l2Lang) return null;
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");
  const text = getSampleText(l2Lang.code);

  return (
    <View style={{ flex: 1 }}>
      <ThemedScreen
        title="Test"
        showFlag={true}
        onBackPress={() => {
          router.back();
        }}
      >
        <TokenizedText text={text} textScale={1.3} />
        <ThemedButton 
          title="Settings" 
          onPress={() => router.push("/settings" as never)} 
          style={{ marginTop: 20 }} 
          type="neutral" 
        />
      </ThemedScreen>
    </View>
  );
}

export default Test;