# Language Content Audit — Library, Study Activity, and Popular L2

## Metadata

- **Arch ID**: ARCH-025
- **Feature**: Point-in-time audit of L2 content availability vs. learner activity vs. the popular-L2 picker list
- **Type**: analysis
- **Status**: draft
- **Created**: 2026-08-11
- **Last Updated**: 2026-08-11
- **ROADMAP Phase**: Cross-cutting (content library & analytics)
- **Scope**: Supabase `youtube_videos` + user-data tables; `@langplayer/shared` language picker lists; web + mobile
- **Supersedes**: none
- **See also**:
  - [SPEC-038 — Video Content → Supabase (complete)](../specs/038-video-content-supabase.md)
  - [ARCH-021 — Language Study Activity Analysis](021-language-study-activity-analysis.md)
  - [ADR-0030 — Data-Driven Popular L2 List](../adr/0030-popular-l2-list-usage-data.md)
  - [ARCH-023 — L1 / Interface Language Usage Analysis](023-l1-interface-language-analysis.md)
  - [ADR-0021 — Migrate Video Content to Supabase](../adr/0021-migrate-video-content-to-supabase.md)
  - [SPEC-044 — Subs-Search DB Optimizations](../specs/044-subs-search-db-optimizations.md)
  - [ADR-0026 — Continua Subs-Search Indexing](../adr/0026-continua-subs-search-indexing.md)

---

## Overview

This document aggregates three independent snapshots into one evidence base
for L2 content decisions:

1. **What content exists** — SPEC-038 documents the video library migration:
   1,045,422 videos across 216 mapped L2 codes (215 populated), now in one
   Supabase `youtube_videos` table.
2. **What learners actually study** — ARCH-021 ranks L2s by watch events,
   active users, unique videos, saved words, and progress across rolling,
   calendar, annual, and all-time windows. Chinese is the dominant studied
   language in every window.
3. **What the picker promotes** — ADR-0030 reorders the popular L2 list using
   the ARCH-021 activity data, splitting the shared constant into
   `POPULAR_L1S` / `POPULAR_L2S`.

The headline insight: the library is broad (215 populated L2 codes) but
learner activity is extremely concentrated (Chinese alone is ~64% of recent
watch events). On 2026-08-11 the per-L2 inventory was measured directly from
Supabase (see §2.2): English has the most videos (155,004), followed by
Chinese (121,834) and Korean (87,350). That measurement closes the original
SPEC-038 gap — we can now compare "how much content we have per language"
against "how much of it is studied."

---

## 1. Evidence sources

| Source | Provides | Snapshot date | Status |
|---|---|---|---|
| [SPEC-038](../specs/038-video-content-supabase.md) | Content-library totals, migration verification, schema facts | 2026-08-04 | complete |
| [ARCH-021](021-language-study-activity-analysis.md) | Per-L2 study activity (events, users, unique videos, est. hours, saved words, progress) | 2026-08-08 | accepted |
| [ADR-0030](../adr/0030-popular-l2-list-usage-data.md) | Popular-L2 list before/after, driven by ARCH-021 | 2026-08-09 | accepted |
| [SPEC-044](../specs/044-subs-search-db-optimizations.md) / [ADR-0026](../adr/0026-continua-subs-search-indexing.md) | Incidental per-language corpus measurements (partial) | 2026-08-05 | complete / accepted |
| Live probe of `public.youtube_videos` | Per-L2 video counts (215 codes), 1,045,422 total | 2026-08-11 | measured |

All activity and content data live in the Supabase Postgres project
(`tfugoojrqybaoukgpqza`).

---

## 2. Content library — SPEC-038 findings

SPEC-038 is the migration record for the video content family. It contributes
the **availability side** of this audit.

| Fact | Value |
|---|---:|
| Total videos | **1,045,422 rows** (14 Directus shards → one Supabase table, 100% row match) |
| Languages | **216 distinct L2 ISO codes** mapped (SPEC-038), **215 populated** in the live table, zero `l2 IS NULL` rows |
| Pre-migration size | ~15–18 GB, dominated by `subs_l1` / `subs_l2` CSV text |
| Post-migration size | ~6.6 GB after dropping `subs_l1` (regenerable via translation pipeline) |
| Related content tables | 16 small tables copied as-is: `youtube_channels`, `talks`, `tv_shows`, `phrasebooks`, `articles`, `resources`, `pages`, `heroes`, `drills`, `exams`, `reading`, `communities`, `subreddits`, `tutoring_kit`, `unavailable_videos`, `languages` |
| ID scheme | Fixed-width prefix per source shard (`new_id = prefix * 10^10 + old_id`), collision-free and invertible |
| Embeddings | 100% of videos carry a metadata embedding (ADR-0021 verification) |

### What SPEC-038 does NOT tell us

- It publishes **no per-L2 breakdown** — resolved by the live measurement in
  §2.2 (video counts per language; channel/subtitle coverage still not
  measured).
- It does not count how many of the 1,045,422 rows actually have usable
  `subs_l2` subtitles.
- "216 languages" is distinct `l2` values on videos, not "languages with
  curated content" or "languages with enough content to learn from"; only 215
  of the 216 mapped codes actually have rows.
- As of SPEC-038, the Flask read path still served from Directus; the Supabase
  cutover is tracked in SPEC-039 (WS-5).

### 2.2 Measured per-L2 video counts (2026-08-11)

Measured with a read-only `group by l2` against `public.youtube_videos`
(query in §7). Full CSV saved at `/tmp/youtube-videos-by-l2.csv` (not
committed; it keeps all 215 codes with a `duplicate_of` marker). 215 populated
L2 codes, zero `l2 IS NULL` rows, 1,045,422 total videos. The main table below
has **Table A — Popular L2s** on top (19 codes, ADR-0030 order), then lists
**42 codes** in the secondary inventory; 49 experimental (no dedicated tokenizer),
98 low-content, and 7 duplicate / macrolanguage member codes are listed
separately underneath. SPEC-038 mapped 216 distinct IDs, so one mapped code
has no rows in the table (or a mapping difference to check). `leiz1236`
(Leizhou Min) and `hain1238` (Hainanese) are Glottolog-style codes absent from
`public.languages`; their names come from the Sinitic varieties they denote.

#### A. Popular L2s (ADR-0030)

The 19 `POPULAR_L2S` languages from ADR-0030, ordered as they appear in the picker (activity-ranked). `he` has no dedicated tokenizer, so its lemmatizer/grade stay blank (see the experimental table below).

| Rank | Code | Name | Video Count | Lemmatizer | Grade |
|---:|---|---|---:|---|---:|
| 1 | zh | Chinese | 121,834 | jieba + pypinyin | A |
| 2 | en | English | 155,004 | LemmatizationList | A |
| 3 | ja | Japanese | 37,248 | MeCab | A |
| 4 | ko | Korean | 87,350 | Kiwi | B |
| 5 | fr | French | 51,244 | LemmatizationList | A |
| 6 | de | German | 54,684 | spaCy (trimmed) | B |
| 7 | es | Spanish | 42,784 | spaCy (trimmed) | B |
| 8 | vi | Vietnamese | 9,242 | pyvi | A |
| 9 | ru | Russian | 35,062 | pymorphy2 | B |
| 10 | ar | Arabic | 9,181 | CAMeL | B |
| 11 | tr | Turkish | 28,610 | Zeyrek | B |
| 12 | it | Italian | 73,608 | spaCy (trimmed) | B |
| 13 | hi | Hindi | 7,396 | spaCy xx (surface) | A |
| 14 | yue | Yue Chinese | 7,697 | jieba + cccanto | B |
| 15 | th | Thai | 15,549 | PyThaiNLP newmm | B |
| 16 | id | Indonesian | 19,083 | Simplemma | A |
| 17 | nl | Dutch | 22,164 | Simplemma | A |
| 18 | he | Hebrew | 9,249 |  |  |
| 19 | pt | Portuguese | 38,779 | LemmatizationList | A |

#### B. Secondary inventory

| Rank | Code | Name | Video Count | Lemmatizer | Grade |
|---:|---|---|---:|---|---:|
| 1 | pl | Polish | 27,725 | Simplemma | B |
| 2 | da | Danish | 15,756 | Simplemma | B |
| 3 | sv | Swedish | 15,133 | LemmatizationList | A |
| 4 | uk | Ukrainian | 14,742 | LemmatizationList | A |
| 5 | no | Norwegian | 11,689 | Simplemma | B |
| 6 | fi | Finnish | 10,996 | Simplemma | B |
| 7 | ca | Catalan | 10,059 | LemmatizationList | A |
| 8 | nan | Min Nan Chinese | 8,625 | jieba (han family) | B |
| 9 | cs | Czech | 7,907 | Simplemma | B |
| 10 | el | Modern Greek (1453-) | 7,227 | Simplemma | B |
| 11 | sk | Slovak | 6,752 | Simplemma | B |
| 12 | ro | Romanian | 6,209 | LemmatizationList | A |
| 13 | hu | Hungarian | 6,197 | Simplemma | B |
| 14 | fa | Persian | 5,101 | Hazm | B |
| 15 | sr | Serbian | 4,402 | Simplemma | B |
| 16 | ms | Malay (macrolanguage) | 3,870 | Simplemma | B |
| 17 | bg | Bulgarian | 3,824 | Simplemma | B |
| 18 | lt | Lithuanian | 2,720 | Simplemma | B |
| 19 | lv | Latvian | 2,524 | Simplemma | B |
| 20 | sl | Slovenian | 2,382 | Simplemma | B |
| 21 | tl | Tagalog | 2,179 | Simplemma | B |
| 22 | et | Estonian | 1,881 | Simplemma | B |
| 23 | hr | Croatian | 1,687 | spaCy (full) | B |
| 24 | gl | Galician | 1,304 | Simplemma | B |
| 25 | cy | Welsh | 1,189 | LemmatizationList | A |
| 26 | ka | Georgian | 1,124 | Simplemma | B |
| 27 | is | Icelandic | 1,069 | Simplemma | B |
| 28 | hy | Armenian | 882 | Simplemma | B |
| 29 | la | Latin | 427 | Simplemma | B |
| 30 | km | Khmer | 346 | ICU word break / regex | C |
| 31 | mk | Macedonian | 320 | Simplemma | B |
| 32 | ga | Irish | 304 | Simplemma | B |
| 33 | my | Burmese | 297 | pyidaungsu | B |
| 34 | lzh | Literary Chinese | 285 | jieba (han family) | B |
| 35 | sq | Albanian | 269 | Simplemma | B |
| 36 | och | Old Chinese | 259 | jieba (han family) | B |
| 37 | bo | Tibetan | 241 | ICU word break / regex | C |
| 38 | hak | Hakka Chinese | 171 | jieba (han family) | B |
| 39 | lb | Luxembourgish | 161 | Simplemma | B |
| 40 | gd | Scottish Gaelic | 141 | Simplemma | B |
| 41 | sw | Swahili (macrolanguage) | 124 | Simplemma | B |
| 42 | lo | Lao | 95 | ICU word break / regex | C |

Grade basis: the 19 `POPULAR_L2S` languages were measured by SPEC-056 (v2 scorecard, 2026-08-09); all other grades are extrapolated from the ARCH-016 engine assignment — LemmatizationList → A, Simplemma / dedicated-but-unmeasured / Han-variant / spaCy → B, ICU-word-break → C. 49 codes with no dedicated tokenizer were moved to the experimental table below (blank lemmatizer / grade = regex fallback), 98 low-content codes to the reject table, and 7 duplicate / macrolanguage member codes to the duplicate table.

#### C. Experimental (no dedicated tokenizer)

These 49 codes have no registered tokenizer, so the server falls back to regex splitting (surface-as-lemma, no POS, no pronunciation). Their former main-table ranks are retained for traceability; their videos are still included in the 1,045,422 total.

| Rank | Code | Name | Video Count | Lemmatizer | Grade |
|---:|---|---|---:|---|---:|
| 33 | ase | American Sign Language | 6,034 |  |  |
| 42 | ur | Urdu | 2,097 |  |  |
| 43 | ta | Tamil | 2,026 |  |  |
| 44 | az | Azerbaijani | 1,910 |  |  |
| 46 | kk | Kazakh | 1,719 |  |  |
| 48 | eo | Esperanto | 1,625 |  |  |
| 52 | mn | Mongolian | 1,117 |  |  |
| 54 | ky | Kirghiz | 1,023 |  |  |
| 56 | wo | Wolof | 818 |  |  |
| 57 | bn | Bengali | 778 |  |  |
| 58 | br | Breton | 622 |  |  |
| 59 | hsh | Hungarian Sign Language | 559 |  |  |
| 60 | gu | Gujarati | 519 |  |  |
| 61 | mr | Marathi | 452 |  |  |
| 63 | cnr | Montenegrin | 405 |  |  |
| 64 | be | Belarusian | 395 |  |  |
| 65 | te | Telugu | 390 |  |  |
| 66 | tlh | Klingon | 387 |  |  |
| 69 | su | Sundanese | 309 |  |  |
| 71 | pa | Panjabi | 300 |  |  |
| 75 | ins | Indian Sign Language | 263 |  |  |
| 78 | eu | Basque | 232 |  |  |
| 79 | as | Assamese | 220 |  |  |
| 80 | ku | Kurdish | 185 |  |  |
| 81 | grc | Ancient Greek (to 1453) | 182 |  |  |
| 82 | kn | Kannada | 177 |  |  |
| 83 | mi | Maori | 177 |  |  |
| 84 | mg | Malagasy | 174 |  |  |
| 85 | uz | Uzbek | 172 |  |  |
| 87 | ml | Malayalam | 165 |  |  |
| 89 | mt | Maltese | 161 |  |  |
| 90 | gsw | Swiss German | 148 |  |  |
| 92 | ckb | Central Kurdish | 133 |  |  |
| 94 | kac | Kachin | 123 |  |  |
| 95 | ami | Amis | 122 |  |  |
| 96 | si | Sinhala | 112 |  |  |
| 97 | af | Afrikaans | 109 |  |  |
| 98 | tt | Tatar | 107 |  |  |
| 99 | fo | Faroese | 101 |  |  |
| 100 | sa | Sanskrit | 98 |  |  |
| 102 | svk | Slovakian Sign Language | 94 |  |  |
| 103 | nsl | Norwegian Sign Language | 93 |  |  |
| 104 | ceb | Cebuano | 91 |  |  |
| 105 | am | Amharic | 89 |  |  |
| 106 | qu | Quechua | 88 |  |  |
| 107 | sm | Samoan | 86 |  |  |
| 108 | jv | Javanese | 75 |  |  |
| 109 | so | Somali | 74 |  |  |
| 110 | yo | Yoruba | 64 |  |  |

#### D. Low-content codes (reject list)

These 98 codes each have fewer than 60 videos (former ranks 111–208) and are excluded from the secondary inventory. Their videos are still included in the 1,045,422 total.

| Rank | Code | Name | Video Count | Lemmatizer | Grade |
|---:|---|---|---:|---|---:|
| 111 | ba | Bashkir | 58 |  |  |
| 112 | fsl | French Sign Language | 48 |  |  |
| 113 | fy | Western Frisian | 44 |  |  |
| 114 | oc | Occitan (post 1500) | 41 |  |  |
| 115 | sd | Sindhi | 41 |  |  |
| 116 | wuu | Wu Chinese | 40 | jieba (han family) | B |
| 117 | yi | Yiddish | 37 |  |  |
| 118 | ne | Nepali (macrolanguage) | 32 |  |  |
| 119 | non | Old Norse | 32 |  |  |
| 120 | zu | Zulu | 31 |  |  |
| 121 | ti | Tigrinya | 30 |  |  |
| 122 | csb | Kashubian | 24 |  |  |
| 123 | om | Oromo | 24 |  |  |
| 124 | srm | Saramaccan | 22 |  |  |
| 125 | sco | Scots | 19 |  |  |
| 126 | mxv | Metlatónoc Mixtec | 15 |  |  |
| 127 | hbo | Ancient Hebrew | 14 |  |  |
| 128 | bho | Bhojpuri | 13 |  |  |
| 129 | ksw | S'gaw Karen | 13 |  |  |
| 130 | rm | Romansh | 13 |  |  |
| 131 | kvk | Korean Sign Language | 12 |  |  |
| 132 | scn | Sicilian | 12 |  |  |
| 133 | crh | Crimean Tatar | 11 |  |  |
| 134 | eso | Estonian Sign Language | 11 |  |  |
| 135 | hil | Hiligaynon | 11 |  |  |
| 136 | nv | Navajo | 11 |  |  |
| 137 | ang | Old English (ca. 450-1100) | 10 |  |  |
| 138 | cop | Coptic | 10 |  |  |
| 139 | hsn | Xiang Chinese | 10 | jieba (han family) | B |
| 140 | ia | Interlingua (International Auxiliary Language Association) | 10 |  |  |
| 141 | krl | Karelian | 10 |  |  |
| 142 | tg | Tajik | 10 |  |  |
| 143 | xh | Xhosa | 10 |  |  |
| 144 | ab | Abkhazian | 9 |  |  |
| 145 | got | Gothic | 9 |  |  |
| 146 | ln | Lingala | 9 |  |  |
| 147 | ryu | Central Okinawan | 8 |  |  |
| 148 | ug | Uighur | 8 |  |  |
| 149 | za | Zhuang | 8 |  |  |
| 150 | gn | Guarani | 7 |  |  |
| 151 | hni | Hani | 7 |  |  |
| 152 | ps | Pushto | 7 |  |  |
| 153 | sah | Yakut | 7 |  |  |
| 154 | sli | Lower Silesian | 7 |  |  |
| 155 | aib | Ainu (China) | 6 |  |  |
| 156 | cpx | Pu-Xian Chinese | 6 | jieba (han family) | B |
| 157 | ha | Hausa | 6 |  |  |
| 158 | mnp | Min Bei Chinese | 6 | jieba (han family) | B |
| 159 | ain | Ainu (Japan) | 5 |  |  |
| 160 | cjy | Jinyu Chinese | 5 | jieba (han family) | B |
| 161 | kl | Kalaallisut | 5 |  |  |
| 162 | lad | Ladino | 5 |  |  |
| 163 | acu | Achuar-Shiwiar | 4 |  |  |
| 164 | arc | Official Aramaic (700-300 BCE) | 4 |  |  |
| 165 | dsb | Lower Sorbian | 4 |  |  |
| 166 | gv | Manx | 4 | Simplemma | B |
| 167 | ii | Sichuan Yi | 4 |  |  |
| 168 | ojp | Old Japanese | 4 |  |  |
| 169 | sux | Sumerian | 4 |  |  |
| 170 | dz | Dzongkha | 3 |  |  |
| 171 | fur | Friulian | 3 |  |  |
| 172 | hne | Chhattisgarhi | 3 |  |  |
| 173 | ig | Igbo | 3 |  |  |
| 174 | leiz1236 | Leizhou Min Chinese | 3 | jieba (han family) | B |
| 175 | sc | Sardinian | 3 |  |  |
| 176 | acf | Saint Lucian Creole French | 2 |  |  |
| 177 | akk | Akkadian | 2 |  |  |
| 178 | ay | Aymara | 2 |  |  |
| 179 | co | Corsican | 2 |  |  |
| 180 | hain1238 | Hainanese Chinese | 2 | jieba (han family) | B |
| 181 | ik | Inupiaq | 2 |  |  |
| 182 | kab | Kabyle | 2 |  |  |
| 183 | kok | Konkani (macrolanguage) | 2 |  |  |
| 184 | mai | Maithili | 2 |  |  |
| 185 | min | Minangkabau | 2 |  |  |
| 186 | mni | Manipuri | 2 |  |  |
| 187 | pms | Piemontese | 2 |  |  |
| 188 | ss | Swati | 2 |  |  |
| 189 | vec | Venetian | 2 |  |  |
| 190 | vo | Volapük | 2 |  |  |
| 191 | ast | Asturian | 1 | Simplemma | B |
| 192 | bea | Beaver | 1 |  |  |
| 193 | bsk | Burushaski | 1 |  |  |
| 194 | csp | Southern Ping Chinese | 1 | jieba (han family) | B |
| 195 | czo | Min Zhong Chinese | 1 | jieba (han family) | B |
| 196 | enm | Middle English (1100-1500) | 1 | Simplemma | B |
| 197 | gan | Gan Chinese | 1 | jieba (han family) | B |
| 198 | gkp | Guinea Kpelle | 1 |  |  |
| 199 | goh | Old High German (ca. 750-1050) | 1 |  |  |
| 200 | jam | Jamaican Creole English | 1 |  |  |
| 201 | ltc | Late Middle Chinese | 1 |  |  |
| 202 | or | Oriya (macrolanguage) | 1 |  |  |
| 203 | osc | Oscan | 1 |  |  |
| 204 | se | Northern Sami | 1 | Simplemma | B |
| 205 | soa | Thai Song | 1 |  |  |
| 206 | tsd | Tsakonian | 1 |  |  |
| 207 | xpe | Liberia Kpelle | 1 |  |  |
| 208 | yrk | Nenets | 1 |  |  |

#### E. Duplicate / macrolanguage member codes (moved out of the main table)

These codes denote the same language as (or a standardized variety of) a code already counted in the main table. Their videos are still included in the 1,045,422 total.

| Rank | Code | Name | Video Count | Lemmatizer | Grade | Duplicate of |
|---:|---|---|---:|---|---:|---|
| 1 | cmn | Mandarin Chinese | 2,217 | jieba (han family) | B | zh (Chinese) |
| 2 | sh | Serbo-Croatian | 276 | Simplemma | B | sr (Serbian) |
| 3 | bs | Bosnian | 162 |  |  | sr (Serbian) |
| 4 | prs | Dari | 24 |  |  | fa (Persian) |
| 5 | nb | Norwegian Bokmål | 10 | Simplemma | B | no (Norwegian) |
| 6 | nn | Norwegian Nynorsk | 9 | Simplemma | B | no (Norwegian) |
| 7 | pes | Iranian Persian | 8 |  |  | fa (Persian) |
---

## 3. Study activity — ARCH-021 findings

ARCH-021 answers "what are users studying?" using `user_watch_history` as the
primary signal, with `user_saved_words` and `user_progress` as secondary
signals.

### 3.1 Headline

**Chinese is the dominant studied language in every window** — ~64% of watch
events in the rolling 30 days and ~52% all-time. Japanese, English, Korean,
and French round out the top five, with German and Spanish close behind.

### 3.2 Rolling 30 days (2026-07-10 → 2026-08-09 UTC)

| Rank | Language | Watch events | Active users | Unique videos | Est. content hours* |
|---:|---|---|---:|---:|---:|
| 1 | Chinese | 1,853 | 477 | 1,054 | ~630 |
| 2 | Japanese | 353 | 42 | 334 | ~58 |
| 3 | English | 138 | 33 | 134 | ~32 |
| 4 | Korean | 133 | 32 | 114 | ~20 |
| 5 | French | 86 | 28 | 80 | ~15 |
| 6 | German | 50 | 24 | 48 | ~10 |
| 7 | Spanish | 44 | 22 | 41 | ~8 |
| 8 | Vietnamese | 29 | 5 | 29 | ~10 |
| 9 | Russian | 28 | 13 | 28 | ~10 |
| 10 | Arabic | 24 | 8 | 22 | ~2 |

\* Sum of full video durations — upper bound, not actual watch time.

Long tail (≤16 events each): Turkish, Yue Chinese, Czech, Croatian, Italian,
Indonesian, Lithuanian, Thai, Hebrew, Klingon, Tagalog, Romanian, Dutch,
Danish.

### 3.3 Calendar July 2026

| Rank | Language | Watch events | Active users |
|---:|---|---|---:|
| 1 | Chinese | 2,014 | 508 |
| 2 | Japanese | 445 | 44 |
| 3 | English | 142 | 38 |
| 4 | Korean | 117 | 37 |
| 5 | French | 109 | 36 |
| 6 | German | 72 | 20 |
| 7 | Spanish | 44 | 23 |
| 8 | Vietnamese | 33 | 5 |
| 9 | Russian | 32 | 16 |
| 10 | Turkish | 24 | 7 |

### 3.4 Annual top-5 (watch events / active users)

| Year | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| **2024** | Chinese 36,161 / 4,378 | English 9,192 / 2,281 | (unknown) 4,774 / 2,049 | Japanese 3,824 / 825 | Spanish 3,243 / 564 |
| **2025** | Chinese 42,224 / 5,707 | English 4,810 / 1,003 | Korean 3,039 / 834 | Japanese 2,754 / 656 | (unknown) 2,161 / 1,420 |
| **2026 YTD** (through Aug 9) | Chinese 17,169 / 2,941 | English 1,587 / 394 | Japanese 1,406 / 260 | Korean 1,012 / 253 | French 927 / 188 |

### 3.5 All-time (2023-10-02 → 2026-08-09 UTC)

204,676 watch events from 24,589 users.

| Rank | Language | Watch events | Active users | Unique videos |
|---:|---|---|---:|---:|
| 1 | Chinese | 106,780 | 12,086 | 11,269 |
| 2 | English | 18,797 | 4,202 | 4,009 |
| 3 | (unknown) | 13,965 | 4,468 | 5,791 |
| 4 | Japanese | 9,334 | 1,834 | 2,510 |
| 5 | Korean | 7,253 | 1,642 | 1,563 |
| 6 | German | 6,767 | 993 | 1,959 |
| 7 | Spanish | 6,588 | 1,181 | 1,696 |
| 8 | French | 5,948 | 1,137 | 1,657 |
| 9 | Russian | 3,920 | 599 | 1,200 |
| 10 | Italian | 2,061 | 427 | 901 |
| 11 | Hindi | 1,527 | 911 | 265 |
| 12 | Finnish | 1,461 | 85 | 963 |
| 13 | Arabic | 1,391 | 324 | 478 |
| 14 | Turkish | 1,265 | 192 | 595 |
| 15 | Portuguese | 988 | 210 | 538 |

### 3.6 Vocabulary & progress (all-time)

**Saved words** (rows / users): Chinese 361,289 / 3,809; English 26,209 /
759; French 18,847 / 189; Japanese 14,096 / 327; German 13,433 / 201;
Spanish 9,731 / 204; Russian 8,798 / 120; Korean 7,093 / 206; Turkish
4,085 / 30; Slovak 3,338 / 5; Italian 3,014 / 65; Dutch 2,081 / 29; Finnish
1,801 / 18; Indonesian 1,702 / 23; Portuguese 1,396 / 28.

**Progress rows** (distinct `(user, language)`): Chinese 18,166; English
12,881; Japanese 3,441; French 2,605; Korean 2,506; Spanish 2,454; German
2,105; Russian 930; Arabic 709; Italian 651; Hindi 608; Portuguese 333; Yue
Chinese 314; Turkish 255; Persian 193.

### 3.7 Trend

Overall activity declined from ~5,000 events/month (Sep–Oct 2025) to
~3,200–3,500/month (Apr–Jul 2026). Chinese's share of the top-6 has stayed
around 65–80% throughout.

### 3.8 ARCH-021 caveats carried into this audit

- Watch events are recorded position updates, **not minutes watched**.
- Est. content hours sum full video durations — an upper bound.
- 13,965 all-time rows (6.8%) have `l2 = NULL` ("unknown").
- Watch history only exists from Oct 2023 onward.
- `user_progress` timestamps were stamped during the Aug 4 migration, so it
  cannot be sliced by time.

---

## 4. Popular L2 list — ADR-0030 findings

ADR-0030 is the **decision side**: it converts the ARCH-021 activity data into
the list users see in the language picker.

### 4.1 Why the old list was wrong

Before ADR-0030, one hardcoded `POPULAR_LANGUAGES` list fed both the L1 and L2
columns of the picker, and its L2 ordering was stale:

- `pl` and `sv` had only 2 watch events each in the rolling 30 days.
- `pt` had zero recent events (988 all-time).
- `vi` (29 events), `ru` (28), `ar` (24), and `tr` (16) ranked below
  languages with less recent activity.
- `yue` (Cantonese, 805 all-time / 14 recent) and `he` (833 all-time) were
  missing entirely.

### 4.2 Decision

Split the shared constant by column and order `POPULAR_L2S` by observed study
activity:

```ts
['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es',
 'vi', 'ru', 'ar', 'tr', 'it', 'hi', 'yue', 'th', 'id', 'nl', 'he', 'pt']
```

`POPULAR_L1S` keeps the legacy L1 composition (minus `zh`, which is not a
valid L1), so `pl` / `sv` remain legitimate popular native-language options on
the L1 side. Chinese (`zh`) is first on the L2 side because it dominates every
activity window.

### 4.3 Consequences

- The L2 "Popular" section now reflects actual learner activity.
- Cantonese and Hebrew were added; Polish and Swedish were demoted out of the
  shortlist.
- The list is still static and will drift again — the ADR itself recommends
  deriving it from analytics in the future.

---

## 5. Synthesis — what the aggregated evidence shows

### 5.1 Broad library, concentrated demand

The library spans **215 populated L2 codes** (216 mapped, §2.2), but the top
10 languages by all-time activity account for the overwhelming majority of
the 204,676 watch events (ARCH-021). Chinese alone is ~52% all-time and ~64%
in the rolling 30 days. Any content-curation decision should beware optimizing
for the long tail of 200+ languages that have almost no measurable demand.

### 5.2 Picker order now tracks demand, not content

ADR-0030's `POPULAR_L2S` is purely activity-driven. With the §2.2 inventory we
can now compare the two directly:

- **Every top-10 activity language also has a top-24 content corpus.** The
  strongest pairing is Chinese: #1 activity and #2 content.
- **English is the biggest content/activity mismatch.** It has the largest
  corpus (155,004) but only 138 watch events / 33 users in the rolling 30
  days — #3 activity.
- **Vietnamese and Arabic are demand-heavy but content-thin.** They rank #8
  and #10 by recent activity but sit at #23 (9,242) and #24 (9,181) by video
  count.
- **Italian and Portuguese are content-rich but demand-light.** They are #4
  and #8 by video count, yet neither made the rolling-30-day top 10 (Portuguese
  had zero recent events per ADR-0030).

The picker therefore does not over-promote languages with thin content at the
top of the list — the top promoted languages all have large corpora — but the
mid-list ordering (and content sourcing) may deserve a second look.

### 5.3 Known data points where content and activity do meet

The §2.2 measurement confirms that the corpus numbers previously published in
SPEC-044 / ADR-0026 were **full table counts, not samples**: `en` 155,004,
`zh` 121,834, `ja` 37,248, and `th` 15,549 all match exactly.

Corpus size correlates with activity for the top languages, but the
correlation is not monotonic in the middle: `it` (73,608) and `pt` (38,779)
have far more videos than `vi` (9,242) or `ar` (9,181), while the latter pair
has more recent study activity.

### 5.4 Marketing number vs. database reality

Public pricing copy claims "600,000+ videos across 207+ languages." The
migration records **1,045,422 video rows across 215 populated L2 codes**.
These numbers are not directly comparable without defining what counts as a
marketable/available video (e.g. rows with `subs_l2`, excluding
`unavailable_videos`), so the audit should flag this as an open reconciliation
item rather than a contradiction.

### 5.5 Legacy reach vs. current activity

Some languages have meaningful all-time reach but weak current activity (e.g.
`hi` 1,527 all-time events / 911 users vs. 0 events in the rolling 30 days).
This matters for decisions like ADR-0033's L1 locale trim and for whether
`hi` deserves its #13 spot on `POPULAR_L2S`. Current-window evidence should
outweigh all-time reach when the question is "what to prioritize next."

---

## 6. Gaps & recommendations

1. **Keep the per-L2 inventory refreshed.** The 2026-08-11 measurement (§2.2)
   closes the SPEC-038 gap. Snapshot it into an analytics table on the same
   quarterly cadence as ARCH-021 / ARCH-023 so the audit does not go stale.
2. **Define "available video" for marketing.** Reconcile the 1,045,422 rows /
   215 populated L2 codes against the "600,000+ / 207+" claim using a single
   definition (e.g. rows with non-empty `subs_l2`, not in
   `unavailable_videos`).
3. **Reconcile picker order with content availability.** `POPULAR_L2S` is
   activity-driven today. With §2.2 we can see the top of the list is
   content-rich, but mid-list mismatches exist (`vi`/`ar` demand-heavy,
   `it`/`pt` content-heavy); add content-coverage context before the next
   reorder.
4. **Re-run quarterly.** ARCH-021 and ARCH-023 both note their evidence
   decays; the popular list and this audit should refresh on the same
   cadence.

---

## 7. Reproducible queries

All queries are read-only against the Supabase Postgres database
(`SUPABASE_DB_URL` in `zerotohero-python-server/.env`).

### Per-L2 content inventory (query used for the 2026-08-11 measurement)

```sql
select l2, count(*) as videos
from public.youtube_videos
group by l2
order by videos desc, l2;
```

Note: adding `subs_l2` coverage (`length(subs_l2) > 0`) detoasts every subtitle
blob and times out against the production pooler; the 2026-08-11 measurement
deliberately counts rows only.

### Rolling 30-day top L2s (ARCH-021)

```sql
select wh.l2,
       coalesce(l.name, wh.l2) as lang_name,
       count(*) as watch_events,
       count(distinct wh.user_id) as active_users,
       count(distinct wh.video_id) as unique_videos
from public.user_watch_history wh
left join public.languages l
  on l."iso639-1" = wh.l2 or l."iso639-3" = wh.l2
where wh.date >= now() - interval '30 days'
group by wh.l2, coalesce(l.name, wh.l2)
order by watch_events desc;
```

### Current `POPULAR_L2S` (ADR-0030)

```ts
// packages/shared/src/language-data.ts
['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es',
 'vi', 'ru', 'ar', 'tr', 'it', 'hi', 'yue', 'th', 'id', 'nl', 'he', 'pt']
```

---

## 8. Caveats

- This is a point-in-time aggregation: SPEC-038 (2026-08-04), ARCH-021
  (2026-08-08), ADR-0030 (2026-08-09).
- The `en` / `zh` / `ja` / `th` counts in SPEC-044 / ADR-0026 match the
  full-table measurement in §2.2 exactly; they were complete counts, not
  samples.
- The inventory counts every row in `youtube_videos`; it does not distinguish
  available vs. unavailable videos, and 215 populated codes vs. 216 mapped in
  SPEC-038 means one mapped code has no rows (or a mapping difference).
- The Flask read path may still have been serving Directus at the time of the
  content migration (SPEC-038 outstanding item, tracked in SPEC-039).
- `zh` is a single L2 code; script variants (`zh-Hans` / `zh-Hant`) are L1
  locale concerns and are not separable in either content or activity data.

---

## Related Documents

- [SPEC-038 — Video Content → Supabase](../specs/038-video-content-supabase.md)
- [ARCH-021 — Language Study Activity Analysis](021-language-study-activity-analysis.md)
- [ADR-0030 — Data-Driven Popular L2 List](../adr/0030-popular-l2-list-usage-data.md)
- [ARCH-023 — L1 / Interface Language Usage Analysis](023-l1-interface-language-analysis.md)
- [SPEC-044 — Subs-Search DB Optimizations](../specs/044-subs-search-db-optimizations.md)
- [ADR-0026 — Continua Subs-Search Indexing](../adr/0026-continua-subs-search-indexing.md)
