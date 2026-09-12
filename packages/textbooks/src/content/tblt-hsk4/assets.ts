/**
 * Asset manifest for Tasks for Life in China (HSK 4).
 *
 * This is the list of media that must exist under `ASSET_BASE_URL` (ADR-0043).
 * It is authored rather than derived on purpose: a derived manifest could never
 * disagree with the content, and then the validator would have nothing to check.
 * With it declared, a content file that references an asset nobody published
 * fails validation instead of failing in front of a student.
 *
 * Keys are the workbook's own audio filenames, so publishing is a straight
 * upload with no rename step — the key IS the source filename, prefixed by book
 * and unit so one host can serve many books.
 *
 * Picture images are named `<lesson><task>-<letter>.png` and are extracted from
 * the workbook PDF.
 */

const BOOK = 'tblt-hsk4';
const UNIT = 'u06';

/** Build a key from the workbook's audio filename. */
const audio = (filename: string) => `${BOOK}/${UNIT}/${filename}`;

/** Build a key for a picture-set image. */
const image = (name: string) => `${BOOK}/${UNIT}/${name}`;

export const TBLT_HSK4_ASSET_KEYS: string[] = [
  // ── Lesson A, task ➊ — nine spoken recommendations (拉萨 has no item) ──
  audio('六A ➊ 上海.mp3'),
  audio('六A ➊ 北京.mp3'),
  audio('六A ➊ 哈尔滨.mp3'),
  audio('六A ➊ 成都.mp3'),
  audio('六A ➊ 新疆.mp3'),
  audio('六A ➊ 杭州.mp3'),
  audio('六A ➊ 桂林.mp3'),
  audio('六A ➊ 苏州.mp3'),
  audio('六A ➊ 西安.mp3'),

  // ── Lesson A, task ➋ — seven transport announcements ──
  audio('六A ➋ ① 就要检票了.mp3'),
  audio('六A ➋ ② 全列禁烟.mp3'),
  audio('六A ➋ ③ 地铁广播.mp3'),
  audio('六A ➋ ④ 行李转盘.mp3'),
  audio('六A ➋ ⑤ 安全白线.mp3'),
  audio('六A ➋ ⑥ 请紧握扶手.mp3'),
  audio('六A ➋ ⑦ 登机口登机.mp3'),

  // ── Lesson A, task ➌ — five friends ──
  audio('六A ➌（1）卢沟桥.mp3'),
  audio('六A ➌（2）日本.mp3'),
  audio('六A ➌（3）汉阳陵.mp3'),
  audio('六A ➌（4）河内.mp3'),
  audio('六A ➌（5）爱宝乐园.mp3'),

  // ── Lesson C — listening pictures and the booking dialogue ──
  audio('六C ➊ ① 下一站，无锡站.mp3'),
  audio('六C ➊ ②.mp3'),
  audio('六C ➊ ③.mp3'),
  audio('六C ➊ ④.mp3'),
  audio('六C ➋ ①.mp3'),
  audio('六C ➋ ②.mp3'),
  audio('六C ➋ ③.mp3'),
  audio('六C ➋ ④.mp3'),
  // ➍ is the transcript-following task for the ➌ recording, so it reuses it.
  audio('六C ➌.mp3'),

  // ── Lesson B ➍ — the workbook screenshot shown if the mock frame fails ──
  image('b4-fallback.png'),

  // ── Pictures, lesson A ➊ — the map and the ten scenic spots (A–J) ──
  image('a1-map.png'),
  image('a1-sight-a.png'),
  image('a1-sight-b.png'),
  image('a1-sight-c.png'),
  image('a1-sight-d.png'),
  image('a1-sight-e.png'),
  image('a1-sight-f.png'),
  image('a1-sight-g.png'),
  image('a1-sight-h.png'),
  image('a1-sight-i.png'),
  image('a1-sight-j.png'),

  // ── Pictures, lesson A ➋ (A–G) ──
  image('a2-a.png'),
  image('a2-b.png'),
  image('a2-c.png'),
  image('a2-d.png'),
  image('a2-e.png'),
  image('a2-f.png'),
  image('a2-g.png'),

  // ── Pictures, lesson A ➌ — transport (A–E) and places (a–e) ──
  image('a3-transport-a.png'),
  image('a3-transport-b.png'),
  image('a3-transport-c.png'),
  image('a3-transport-d.png'),
  image('a3-transport-e.png'),
  image('a3-place-a.png'),
  image('a3-place-b.png'),
  image('a3-place-c.png'),
  image('a3-place-d.png'),
  image('a3-place-e.png'),

  // ── Pictures, lesson C ➊ (A–D) and ➋ (A–D) ──
  image('c1-a.png'),
  image('c1-b.png'),
  image('c1-c.png'),
  image('c1-d.png'),
  image('c2-a.png'),
  image('c2-b.png'),
  image('c2-c.png'),
  image('c2-d.png'),
];
