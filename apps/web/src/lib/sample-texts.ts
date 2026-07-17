/** Sample markdown texts for the reader, keyed by ISO 639-1 code. */
export const SAMPLE_TEXTS: Record<string, { title: string; text: string }> = {
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

export function getSampleText(code: string): { title: string; text: string } | null {
  return SAMPLE_TEXTS[code] ?? SAMPLE_TEXTS[code.split('-')[0]!] ?? null;
}
