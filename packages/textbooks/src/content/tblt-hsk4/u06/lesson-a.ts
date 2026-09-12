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
          // Positions are percentages of the image, placed over the printed
          // "( )" beside each city name.
          pins: [
            { blankId: 'b1', x: 37.5, y: 18.0 }, // 吐鲁番
            { blankId: 'b2', x: 78.1, y: 20.5 }, // 哈尔滨
            { blankId: 'b3', x: 46.9, y: 32.0 }, // 西安 (given)
            { blankId: 'b4', x: 78.1, y: 43.0 }, // 北京
            { blankId: 'b5', x: 76.9, y: 53.5 }, // 苏州
            { blankId: 'b6', x: 81.3, y: 62.0 }, // 上海
            { blankId: 'b7', x: 84.4, y: 73.0 }, // 杭州
            { blankId: 'b8', x: 28.1, y: 85.0 }, // 拉萨
            { blankId: 'b9', x: 38.8, y: 93.0 }, // 成都
            { blankId: 'b10', x: 65.6, y: 84.5 }, // 桂林
          ],
        },
        {
          kind: 'pictureSet',
          id: 'sights',
          items: [
            { letter: 'A', label: '兵马俑', image: 'tblt-hsk4/u06/a1-sight-a.png' },
            { letter: 'B', label: '葡萄', image: 'tblt-hsk4/u06/a1-sight-b.png' },
            { letter: 'C', label: '长城', image: 'tblt-hsk4/u06/a1-sight-c.png' },
            { letter: 'D', label: '大熊猫', image: 'tblt-hsk4/u06/a1-sight-d.png' },
            { letter: 'E', label: '园林', image: 'tblt-hsk4/u06/a1-sight-e.png' },
            { letter: 'F', label: '西湖', image: 'tblt-hsk4/u06/a1-sight-f.png' },
            { letter: 'G', label: '冰雕', image: 'tblt-hsk4/u06/a1-sight-g.png' },
            { letter: 'H', label: '山水', image: 'tblt-hsk4/u06/a1-sight-h.png' },
            { letter: 'I', label: '电视塔', image: 'tblt-hsk4/u06/a1-sight-i.png' },
            { letter: 'J', label: '布达拉宫', image: 'tblt-hsk4/u06/a1-sight-j.png' },
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
      audio: [
        { key: 'tblt-hsk4/u06/六A ➋ ① 就要检票了.mp3' },
        { key: 'tblt-hsk4/u06/六A ➋ ② 全列禁烟.mp3' },
        { key: 'tblt-hsk4/u06/六A ➋ ③ 地铁广播.mp3' },
        { key: 'tblt-hsk4/u06/六A ➋ ④ 行李转盘.mp3' },
        { key: 'tblt-hsk4/u06/六A ➋ ⑤ 安全白线.mp3' },
        { key: 'tblt-hsk4/u06/六A ➋ ⑥ 请紧握扶手.mp3' },
        { key: 'tblt-hsk4/u06/六A ➋ ⑦ 登机口登机.mp3' },
      ],
      body: [
        {
          kind: 'pictureSet',
          id: 'ps1',
          items: [
            { letter: 'A', label: '请到检票口检票', image: 'tblt-hsk4/u06/a2-a.png' },
            { letter: 'B', label: '请在安全白线内通行', image: 'tblt-hsk4/u06/a2-b.png' },
            { letter: 'C', label: '列车全列禁烟', image: 'tblt-hsk4/u06/a2-c.png' },
            { letter: 'D', label: '列车要进站了', image: 'tblt-hsk4/u06/a2-d.png' },
            { letter: 'E', label: '请前往行李转盘', image: 'tblt-hsk4/u06/a2-e.png' },
            { letter: 'F', label: '请前往登机口登机', image: 'tblt-hsk4/u06/a2-f.png' },
            { letter: 'G', label: '请紧握扶手', image: 'tblt-hsk4/u06/a2-g.png' },
          ],
        },
        { kind: 'numberedBlanks', ids: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'] },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'given', answer: 'A' },
        b2: { id: 'b2', kind: 'choose', answer: 'C', optionSet: 'ps1' },
        b3: { id: 'b3', kind: 'choose', answer: 'D', optionSet: 'ps1' },
        b4: { id: 'b4', kind: 'choose', answer: 'E', optionSet: 'ps1' },
        b5: { id: 'b5', kind: 'choose', answer: 'B', optionSet: 'ps1' },
        b6: { id: 'b6', kind: 'choose', answer: 'G', optionSet: 'ps1' },
        b7: { id: 'b7', kind: 'choose', answer: 'F', optionSet: 'ps1' },
      },
      answerKeyRaw: '② C; ③ D; ④ E; ⑤ B; ⑥ G; ⑦ F。',
    },
    {
      id: 'tblt-hsk4.u06.A.t3',
      number: '➌',
      type: 'listening',
      sourcePage: 4,
      instructions: '几个朋友介绍自己都去了哪里，怎么去的。听录音，完成下面的表格。',
      audio: [
        { key: 'tblt-hsk4/u06/六A ➌（1）卢沟桥.mp3', label: '李婷婷' },
        { key: 'tblt-hsk4/u06/六A ➌（2）日本.mp3', label: '金敏俊' },
        { key: 'tblt-hsk4/u06/六A ➌（3）汉阳陵.mp3', label: '奥利维亚' },
        { key: 'tblt-hsk4/u06/六A ➌（4）河内.mp3', label: '陈灵' },
        { key: 'tblt-hsk4/u06/六A ➌（5）爱宝乐园.mp3', label: '朴书妍' },
      ],
      body: [
        {
          kind: 'dataTable',
          id: 't3-table',
          columns: ['', '怎么去的', '去了哪里'],
          rows: [
            ['李婷婷', '{{b1}}', '{{b2}}'],
            ['金敏俊', '{{b3}}', '{{b4}}'],
            ['奥利维亚', '{{b5}}', '{{b6}}'],
            ['陈灵', '{{b7}}', '{{b8}}'],
            ['朴书妍', '{{b9}}', '{{b10}}'],
          ],
        },
        {
          kind: 'pictureSet',
          id: 'transport',
          items: [
            { letter: 'A', label: '出租车', image: 'tblt-hsk4/u06/a3-transport-a.png' },
            { letter: 'B', label: '飞机（航班）', image: 'tblt-hsk4/u06/a3-transport-b.png' },
            { letter: 'C', label: '大巴', image: 'tblt-hsk4/u06/a3-transport-c.png' },
            { letter: 'D', label: '电动车', image: 'tblt-hsk4/u06/a3-transport-d.png' },
            { letter: 'E', label: '共享单车（自行车）', image: 'tblt-hsk4/u06/a3-transport-e.png' },
          ],
        },
        {
          kind: 'pictureSet',
          id: 'places',
          items: [
            { letter: 'a', label: '汉阳陵', image: 'tblt-hsk4/u06/a3-place-a.png' },
            { letter: 'b', label: '卢沟桥', image: 'tblt-hsk4/u06/a3-place-b.png' },
            { letter: 'c', label: '日本', image: 'tblt-hsk4/u06/a3-place-c.png' },
            { letter: 'd', label: '河内', image: 'tblt-hsk4/u06/a3-place-d.png' },
            { letter: 'e', label: '爱宝乐园', image: 'tblt-hsk4/u06/a3-place-e.png' },
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
  ],
};
