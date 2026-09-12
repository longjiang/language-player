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
 * Picture images are named `<lesson><task>-<letter>.<ext>` and are extracted
 * from the workbook PDF. The extension follows whichever encoding is actually
 * smaller for that image: photographs and shaded illustrations come out JPEG
 * (PNG ran 5-7x larger on every one of them), and the flat vector map stays PNG.
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

  // ── Lesson B, task ➎ — the whole article read aloud (shared with ➏) ──
  audio('六B ➎ 开票一秒就空了.mp3'),

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

  // ── Lesson E — dictation recordings and their vocabulary pictures ──
  audio('六E ➊ ①.mp3'),
  audio('六E ➊ ②.mp3'),
  audio('六E ➊ ③.mp3'),
  audio('六E ➊ ④.mp3'),
  audio('六E ➋ ①.mp3'),
  audio('六E ➋ ②.mp3'),
  audio('六E ➋ ③.mp3'),
  audio('六E ➌.mp3'),
  image('e1-a.jpg'),
  image('e1-b.jpg'),
  image('e1-c.jpg'),
  image('e1-d.jpg'),
  image('e1-e.jpg'),
  image('e2-a.jpg'),
  image('e2-b.jpg'),
  image('e2-c.jpg'),
  image('e2-d.jpg'),

  // ── Lesson D ➏ — the note-taking recording ──
  audio('六D ➍.mp3'),

  // ── Lesson B ➍ — the workbook screenshot shown if the mock frame fails ──
  image('b4-fallback.jpg'),

  // ── Pictures, lesson B ➌ — the seat classes each table photographs ──
  image('b3-g41-wuzuo.jpg'),
  image('b3-g41-erdengzuo.jpg'),
  image('b3-g41-yidengzuo.jpg'),
  image('b3-g41-shangwuzuo.jpg'),
  image('b3-k1275-wuzuo.jpg'),
  image('b3-k1275-yingzuo.jpg'),
  image('b3-k1275-yingwo.jpg'),
  image('b3-k1275-ruanwo.jpg'),

  // ── Pictures, lesson B ➎ — the six illustrations the student places ──
  // Numbered as the workbook letters them: A calendar, B transfer, C passenger
  // info, D waitlist, E scam, F unpaid ticket.
  image('b5-illustration-a.jpg'),
  image('b5-illustration-b.jpg'),
  image('b5-illustration-c.jpg'),
  image('b5-illustration-d.jpg'),
  image('b5-illustration-e.jpg'),
  image('b5-illustration-f.jpg'),

  // ── Pictures, lesson A ➊ — the map and the ten scenic spots (A–J) ──
  // The map is a flat-colour graphic, so PNG; the spots are photographs, so
  // JPEG — a PNG of the same pixels is roughly six times the bytes for no
  // visible gain, and this set will grow into the hundreds.
  image('a1-map.png'),
  image('a1-sight-a.jpg'),
  image('a1-sight-b.jpg'),
  image('a1-sight-c.jpg'),
  image('a1-sight-d.jpg'),
  image('a1-sight-e.jpg'),
  image('a1-sight-f.jpg'),
  image('a1-sight-g.jpg'),
  image('a1-sight-h.jpg'),
  image('a1-sight-i.jpg'),
  image('a1-sight-j.jpg'),

  // ── Pictures, lesson A ➋ (A–G) ──
  image('a2-a.jpg'),
  image('a2-b.jpg'),
  image('a2-c.jpg'),
  image('a2-d.jpg'),
  image('a2-e.jpg'),
  image('a2-f.jpg'),
  image('a2-g.jpg'),

  // ── Pictures, lesson A ➌ — transport (A–E) and places (a–e) ──
  image('a3-transport-a.jpg'),
  image('a3-transport-b.jpg'),
  image('a3-transport-c.jpg'),
  image('a3-transport-d.jpg'),
  image('a3-transport-e.jpg'),
  image('a3-place-a.jpg'),
  image('a3-place-b.jpg'),
  image('a3-place-c.jpg'),
  image('a3-place-d.jpg'),
  image('a3-place-e.jpg'),

  // ── Pictures, lesson C ➊ (A–D) and ➋ (A–D) ──
  image('c1-a.jpg'),
  image('c1-b.jpg'),
  image('c1-c.jpg'),
  image('c1-d.jpg'),
  image('c2-a.jpg'),
  image('c2-b.jpg'),
  image('c2-c.jpg'),
  image('c2-d.jpg'),
];
