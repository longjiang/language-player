/**
 * Lesson 六A — 你是怎么去的 (unit 6, lesson A).
 *
 * Source: workbook pages 3 and 4.
 */

import type { LessonMeta } from '../../../types';

export const lessonA: LessonMeta = {
  id: 'A',
  letter: 'A',
  title: '你是怎么去的',
  canDo: '能听懂日常交谈中关于交通出行的问题和介绍。',
  tasks: [
    {
      id: 'tblt-hsk4.u06.A.t1',
      number: '➊',
      type: 'listening',
      sourcePage: 2,
      instructions:
        '一些朋友用微信发来了一些语音消息，推荐我们去中国不同的地方旅游。请听一听，然后在城市旁边的（ ）中写下对应的景点。',
      // The nine cities the recording actually names. 拉萨 has no spoken item —
      // it is answered by elimination (and by geography: 布达拉宫 is in Lhasa),
      // which is how the workbook intends it.
      audio: [
        { key: 'tblt-hsk4/u06/六A ➊ 上海.mp3', label: '上海' },
        { key: 'tblt-hsk4/u06/六A ➊ 北京.mp3', label: '北京' },
        { key: 'tblt-hsk4/u06/六A ➊ 哈尔滨.mp3', label: '哈尔滨' },
        { key: 'tblt-hsk4/u06/六A ➊ 成都.mp3', label: '成都' },
        { key: 'tblt-hsk4/u06/六A ➊ 新疆.mp3', label: '吐鲁番' },
        { key: 'tblt-hsk4/u06/六A ➊ 杭州.mp3', label: '杭州' },
        { key: 'tblt-hsk4/u06/六A ➊ 桂林.mp3', label: '桂林' },
        { key: 'tblt-hsk4/u06/六A ➊ 苏州.mp3', label: '苏州' },
        { key: 'tblt-hsk4/u06/六A ➊ 西安.mp3', label: '西安' },
      ],
      body: [
        {
          kind: 'imageMap',
          id: 't1-map',
          image: 'tblt-hsk4/u06/a1-map.png',
          alt: '中国地图',
          // Positions are percentages of the image, sitting on the printed map
          // dots — the point each city's connector line terminates at, so there
          // is no ambiguity about which city a blank belongs to. Measured from
          // the image rather than estimated.
          pins: [
            { blankId: 'b1', x: 22.0, y: 32.4 }, // 吐鲁番
            { blankId: 'b2', x: 69.8, y: 21.7 }, // 哈尔滨
            { blankId: 'b3', x: 47.6, y: 53.5 }, // 西安 (given)
            { blankId: 'b4', x: 57.9, y: 38.3 }, // 北京
            { blankId: 'b5', x: 64.6, y: 58.8 }, // 苏州
            { blankId: 'b6', x: 66.9, y: 58.8 }, // 上海
            { blankId: 'b7', x: 64.6, y: 61.6 }, // 杭州
            { blankId: 'b8', x: 23.0, y: 61.6 }, // 拉萨
            { blankId: 'b9', x: 40.7, y: 61.6 }, // 成都
            { blankId: 'b10', x: 50.0, y: 75.1 }, // 桂林
          ],
        },
        {
          kind: 'pictureSet',
          id: 'sights',
          items: [
            { letter: 'A', label: '兵马俑', image: 'tblt-hsk4/u06/a1-sight-a.jpg' },
            { letter: 'B', label: '葡萄', image: 'tblt-hsk4/u06/a1-sight-b.jpg' },
            { letter: 'C', label: '长城', image: 'tblt-hsk4/u06/a1-sight-c.jpg' },
            { letter: 'D', label: '大熊猫', image: 'tblt-hsk4/u06/a1-sight-d.jpg' },
            { letter: 'E', label: '园林', image: 'tblt-hsk4/u06/a1-sight-e.jpg' },
            { letter: 'F', label: '西湖', image: 'tblt-hsk4/u06/a1-sight-f.jpg' },
            { letter: 'G', label: '冰雕', image: 'tblt-hsk4/u06/a1-sight-g.jpg' },
            { letter: 'H', label: '山水', image: 'tblt-hsk4/u06/a1-sight-h.jpg' },
            { letter: 'I', label: '电视塔', image: 'tblt-hsk4/u06/a1-sight-i.jpg' },
            { letter: 'J', label: '布达拉宫', image: 'tblt-hsk4/u06/a1-sight-j.jpg' },
      ],
        },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'choose', answer: 'B', optionSet: 'sights', keyLabel: '吐鲁番' },
        b2: { id: 'b2', kind: 'choose', answer: 'G', optionSet: 'sights', keyLabel: '哈尔滨' },
        // 西安 is pre-filled with A in the workbook, which is why the key omits it.
        b3: { id: 'b3', kind: 'given', answer: 'A', optionSet: 'sights' },
        b4: { id: 'b4', kind: 'choose', answer: 'C', optionSet: 'sights', keyLabel: '北京' },
        b5: { id: 'b5', kind: 'choose', answer: 'E', optionSet: 'sights', keyLabel: '苏州' },
        b6: { id: 'b6', kind: 'choose', answer: 'I', optionSet: 'sights', keyLabel: '上海' },
        b7: { id: 'b7', kind: 'choose', answer: 'F', optionSet: 'sights', keyLabel: '杭州' },
        b8: { id: 'b8', kind: 'choose', answer: 'J', optionSet: 'sights', keyLabel: '拉萨' },
        b9: { id: 'b9', kind: 'choose', answer: 'D', optionSet: 'sights', keyLabel: '成都' },
        b10: { id: 'b10', kind: 'choose', answer: 'H', optionSet: 'sights', keyLabel: '桂林' },
      },
      // Label-keyed: the blanks sit beside city names, so the key names them.
      answerKeyRaw:
        '北京：C；成都：D；吐鲁番：B；拉萨：J；上海：I；杭州：F；苏州：E；哈尔滨：G；桂林：H。',
    },
    {
      id: 'tblt-hsk4.u06.A.t2',
      number: '➋',
      type: 'listening',
      sourcePage: 3,
      instructions:
        '听一听在一些乘坐公共交通工具时经常听到的广播。这些广播说了什么？请选择最合适的图片。',
      // ① is pre-filled with A in the workbook, which is why the answer key
      // starts at ②.
      body: [
        {
          kind: 'pictureSet',
          id: 'ps1',
          items: [
            { letter: 'A', label: '请到检票口检票', image: 'tblt-hsk4/u06/a2-a.jpg' },
            { letter: 'B', label: '请在安全白线内通行', image: 'tblt-hsk4/u06/a2-b.jpg' },
            { letter: 'C', label: '列车全列禁烟', image: 'tblt-hsk4/u06/a2-c.jpg' },
            { letter: 'D', label: '列车要进站了', image: 'tblt-hsk4/u06/a2-d.jpg' },
            { letter: 'E', label: '请前往行李转盘', image: 'tblt-hsk4/u06/a2-e.jpg' },
            { letter: 'F', label: '请前往登机口登机', image: 'tblt-hsk4/u06/a2-f.jpg' },
            { letter: 'G', label: '请紧握扶手', image: 'tblt-hsk4/u06/a2-g.jpg' },
      ],
        },
        { kind: 'numberedBlanks', ids: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'] },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'given', answer: 'A', audio: [{ key: 'tblt-hsk4/u06/六A ➋ ① 就要检票了.mp3' }] },
        b2: { id: 'b2', kind: 'choose', answer: 'C', optionSet: 'ps1', audio: [{ key: 'tblt-hsk4/u06/六A ➋ ② 全列禁烟.mp3' }] },
        b3: { id: 'b3', kind: 'choose', answer: 'D', optionSet: 'ps1', audio: [{ key: 'tblt-hsk4/u06/六A ➋ ③ 地铁广播.mp3' }] },
        b4: { id: 'b4', kind: 'choose', answer: 'E', optionSet: 'ps1', audio: [{ key: 'tblt-hsk4/u06/六A ➋ ④ 行李转盘.mp3' }] },
        b5: { id: 'b5', kind: 'choose', answer: 'B', optionSet: 'ps1', audio: [{ key: 'tblt-hsk4/u06/六A ➋ ⑤ 安全白线.mp3' }] },
        b6: { id: 'b6', kind: 'choose', answer: 'G', optionSet: 'ps1', audio: [{ key: 'tblt-hsk4/u06/六A ➋ ⑥ 请紧握扶手.mp3' }] },
        b7: { id: 'b7', kind: 'choose', answer: 'F', optionSet: 'ps1', audio: [{ key: 'tblt-hsk4/u06/六A ➋ ⑦ 登机口登机.mp3' }] },
      },
      answerKeyRaw: '② C; ③ D; ④ E; ⑤ B; ⑥ G; ⑦ F。',
    },
    {
      id: 'tblt-hsk4.u06.A.t3',
      number: '➌',
      type: 'listening',
      sourcePage: 4,
      instructions: '几个朋友介绍自己都去了哪里，怎么去的。听录音，完成下面的表格。',
      body: [
        {
          kind: 'dataTable',
          id: 't3-table',
          columns: ['', '怎么去的', '去了哪里'],
          rows: [
            { cells: ['李婷婷', '{{b1}}', '{{b2}}'], audio: [{ key: 'tblt-hsk4/u06/六A ➌（1）卢沟桥.mp3' }] },
            { cells: ['金敏俊', '{{b3}}', '{{b4}}'], audio: [{ key: 'tblt-hsk4/u06/六A ➌（2）日本.mp3' }] },
            { cells: ['奥利维亚', '{{b5}}', '{{b6}}'], audio: [{ key: 'tblt-hsk4/u06/六A ➌（3）汉阳陵.mp3' }] },
            { cells: ['陈灵', '{{b7}}', '{{b8}}'], audio: [{ key: 'tblt-hsk4/u06/六A ➌（4）河内.mp3' }] },
            { cells: ['朴书妍', '{{b9}}', '{{b10}}'], audio: [{ key: 'tblt-hsk4/u06/六A ➌（5）爱宝乐园.mp3' }] },
          ],
        },
        {
          kind: 'pictureSet',
          id: 'transport',
          items: [
            { letter: 'A', label: '出租车', image: 'tblt-hsk4/u06/a3-transport-a.jpg' },
            { letter: 'B', label: '飞机（航班）', image: 'tblt-hsk4/u06/a3-transport-b.jpg' },
            { letter: 'C', label: '大巴', image: 'tblt-hsk4/u06/a3-transport-c.jpg' },
            { letter: 'D', label: '电动车', image: 'tblt-hsk4/u06/a3-transport-d.jpg' },
            { letter: 'E', label: '共享单车（自行车）', image: 'tblt-hsk4/u06/a3-transport-e.jpg' },
      ],
        },
        {
          kind: 'pictureSet',
          id: 'places',
          items: [
            { letter: 'a', label: '汉阳陵', image: 'tblt-hsk4/u06/a3-place-a.jpg' },
            { letter: 'b', label: '卢沟桥', image: 'tblt-hsk4/u06/a3-place-b.jpg' },
            { letter: 'c', label: '日本', image: 'tblt-hsk4/u06/a3-place-c.jpg' },
            { letter: 'd', label: '河内', image: 'tblt-hsk4/u06/a3-place-d.jpg' },
            { letter: 'e', label: '爱宝乐园', image: 'tblt-hsk4/u06/a3-place-e.jpg' },
      ],
        },
      ],
      blanks: {
        // Row 1 is the worked example printed in the workbook.
        b1: { id: 'b1', kind: 'given', answer: 'E' },
        b2: { id: 'b2', kind: 'given', answer: 'b' },
        // The key gives one item per row, covering BOTH columns
        // (`2. 金敏俊: B、c`), so each row's two blanks cite the same key item.
        b3: { id: 'b3', kind: 'choose', answer: 'B', optionSet: 'transport', keyIndex: 2 },
        b4: { id: 'b4', kind: 'choose', answer: 'c', optionSet: 'places', keyIndex: 2 },
        b5: { id: 'b5', kind: 'choose', answer: 'D', optionSet: 'transport', keyIndex: 3 },
        b6: { id: 'b6', kind: 'choose', answer: 'a', optionSet: 'places', keyIndex: 3 },
        b7: { id: 'b7', kind: 'choose', answer: 'C', optionSet: 'transport', keyIndex: 4 },
        b8: { id: 'b8', kind: 'choose', answer: 'd', optionSet: 'places', keyIndex: 4 },
        b9: { id: 'b9', kind: 'choose', answer: 'A', optionSet: 'transport', keyIndex: 5 },
        b10: { id: 'b10', kind: 'choose', answer: 'e', optionSet: 'places', keyIndex: 5 },
      },
      answerKeyRaw: '2. 金敏俊: B、c; 3. 奥利维亚: D, a; 4. 陈灵: C, d; 5. 朴书妍: A, e。',
    },
        {
      id: 'tblt-hsk4.u06.A.t4',
      number: '➍',
      type: 'listening',
      sourcePage: 4,
      instructions: '现在总结一下他们的谈话内容，在（　）中写下适当的词语。',
      // The same five friends as ➌, so this replays ➌'s recordings — one per
      // sub-item, declared on the passage it belongs to.
      body: [
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六A ➌（1）卢沟桥.mp3', label: '李婷婷' }],
          text:
            '（1）李婷婷觉得共享单车比较方便，因为可以①（{{b1}}）借，②（{{b2}}）还，' +
            '去哪儿都可以，特别自由。上次她去卢沟桥就是骑自行车去的。虽然是有点远，要四十多分钟，' +
            '但③（{{b3}}）不多，骑着很④（{{b4}}）。她从通县回家也是骑回去的。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六A ➌（2）日本.mp3', label: '金敏俊' }],
          text:
            '（2）金敏俊经常从他老家首尔坐飞机去日本。仁川机场每天都有好多去日本的航班。' +
            '①（{{b5}}）东京②（{{b6}}）大阪，都能直达。不管去北海道，去冲绳，' +
            '还是日本什么别的地方，一③（{{b7}}）航班就到，特别方便，所以他没事就老去日本旅游。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六A ➌（3）汉阳陵.mp3', label: '奥利维亚' }],
          text:
            '（3）奥利维亚在西安留学的时候，去哪里都骑电动车，因为便宜，而且方便。' +
            '上次她去汉阳陵就是骑电动车去的。①（{{b8}}）也可以坐地铁去，②（{{b9}}）地铁不能直接到景点门口。' +
            '③（{{b10}}）这种偏僻一点的地方她都是骑电动车去。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六A ➌（4）河内.mp3', label: '陈灵' }],
          text:
            '（4）陈灵是越南顺化人。去年她从老家坐大巴去了一①（{{b11}}）河内，是可以睡觉的那种。' +
            '陈灵说，大巴上的床很舒服，出发以后一路②（{{b12}}）着③（{{b13}}）着就睡着了。' +
            '她第二天醒来的时候已经④（{{b14}}）到河内了，所以觉得特别方便。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六A ➌（5）爱宝乐园.mp3', label: '朴书妍' }],
          text:
            '（5）朴书妍说她从老家首尔去哪儿都坐出租车，出远门也是。上次她从首尔去爱宝乐园，' +
            '就是坐出租车去的。路程①（{{b15}}）要1个小时，所以②（{{b16}}）是贵了点。' +
            '但是她觉得出租车还是方便。她说那天下大雨，像那样的天气，她还是觉得坐出租车③（{{b17}}）。',
        },
      ],
      blanks: {
        // (1) is the worked example the booklet prints in full.
        b1: { id: 'b1', kind: 'given', answer: '随处' },
        b2: { id: 'b2', kind: 'given', answer: '随处' },
        b3: { id: 'b3', kind: 'given', answer: '坡路' },
        b4: { id: 'b4', kind: 'given', answer: '舒服' },
        // The key numbers these by sub-item, so each blank names its group and
        // position — a flat index cannot express ① occurring in every group.
        b5: { id: 'b5', kind: 'type', answer: '不管', bank: 'a4-words', keyLabel: '2.1' },
        b6: { id: 'b6', kind: 'type', answer: '还是', bank: 'a4-words', keyLabel: '2.2' },
        b7: { id: 'b7', kind: 'type', answer: '趟', bank: 'a4-words', keyLabel: '2.3' },
        b8: { id: 'b8', kind: 'type', answer: '虽然', bank: 'a4-words', keyLabel: '3.1' },
        b9: { id: 'b9', kind: 'type', answer: '但是', bank: 'a4-words', keyLabel: '3.2' },
        b10: { id: 'b10', kind: 'type', answer: '一般', bank: 'a4-words', keyLabel: '3.3' },
        b11: { id: 'b11', kind: 'type', answer: '趟', bank: 'a4-words', keyLabel: '4.1' },
        b12: { id: 'b12', kind: 'type', answer: '摇', bank: 'a4-words', keyLabel: '4.2' },
        b13: { id: 'b13', kind: 'type', answer: '摇', bank: 'a4-words', keyLabel: '4.3' },
        b14: { id: 'b14', kind: 'type', answer: '快', bank: 'a4-words', keyLabel: '4.4' },
        b15: { id: 'b15', kind: 'type', answer: '要', bank: 'a4-words', keyLabel: '5.1' },
        b16: { id: 'b16', kind: 'type', answer: '确实', bank: 'a4-words', keyLabel: '5.2' },
        b17: { id: 'b17', kind: 'type', answer: '安心', bank: 'a4-words', keyLabel: '5.3' },
      },
      banks: [
        {
          // One combined bank for the whole task, as decided. Reuse is on: 随处 is
          // needed twice, and 趟 and 摇 each appear twice.
          id: 'a4-words',
          items: [
            '舒服', '随处', '坡路', '还是', '不管', '趟', '一般', '但是',
            '虽然', '摇', '快', '确实', '安心', '差不多',
          ],
          allowReuse: true,
        },
      ],
      answerKeyRaw:
        '(2) ① 不管；② 还是；③ 趟；(3) ① 虽然；② 但是；③ 一般；(4) ① 趟；② 摇；③ 摇；④ 快；(5) ① 要；② 确实；③ 安心。',
    },
  ],
};
