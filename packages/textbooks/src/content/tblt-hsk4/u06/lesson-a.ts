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
      id: 'tblt-hsk4.u06.A.t2',
      number: '➋',
      type: 'listening',
      sourcePage: 3,
      instructions:
        '听一听在一些乘坐公共交通工具时经常听到的广播。这些广播说了什么？请选择最合适的图片。',
      instructionsL1:
        'Listen to some announcements you often hear on public transport. What do they say? Choose the most suitable picture.',
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
      instructionsL1:
        'Several friends say where they went and how they got there. Listen and complete the table.',
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
