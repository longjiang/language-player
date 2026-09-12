/**
 * Lesson 六B — 开票一秒就空了 (unit 6, lesson B).
 *
 * Source: workbook page 7 (B ➋ and the comparison table above it).
 */

import type { LessonMeta } from '../../../types';

export const lessonB: LessonMeta = {
  id: 'B',
  letter: 'B',
  title: '开票一秒就空了',
  canDo: '能看懂关于交通出行内容的一般性介绍或短文故事。',
  tasks: [
    {
      id: 'tblt-hsk4.u06.B.t1',
      number: '➊',
      type: 'reading',
      sourcePage: 6,
      instructions:
        '看下面的表格列出的不同车次，然后在“车型”列的空白处填入适当的选项。注意车次例子的第一个字母。',
      instructionsL1:
        'Look at the train numbers in the table, then fill each blank in the 车型 column with the right option. Note the first letter of each example train number.',
      body: [
        {
          kind: 'dataTable',
          id: 't1-trains',
          columns: ['车次和读法', '车型', '路线', '时速'],
          rows: [
            ['G815 “高815”', '{{b1}}', '北京南 → 宁波', '250-350km'],
            ['D17 “动17”', '{{b2}}', '北京 → 杭州', '160-250km'],
            ['C2131 “城2131”', '{{b3}}', '北京南 → 天津西', '160-300km'],
            ['Z281 “直281”', '{{b4}}', '包头 → 杭州', '160km'],
            ['T109 “特109”', '{{b5}}', '北京 → 上海', '140km'],
            ['K1275 “快1275”', '{{b6}}', '包头 → 温州', '120km'],
          ],
        },
      ],
      blanks: {
        // Rows 1 and 2 are the worked examples the key omits.
        b1: { id: 'b1', kind: 'given', answer: 'a' },
        b2: { id: 'b2', kind: 'given', answer: 'b' },
        b3: { id: 'b3', kind: 'choose', answer: 'f', bank: 'w1' },
        b4: { id: 'b4', kind: 'choose', answer: 'c', bank: 'w1' },
        b5: { id: 'b5', kind: 'choose', answer: 'e', bank: 'w1' },
        b6: { id: 'b6', kind: 'choose', answer: 'd', bank: 'w1' },
      },
      banks: [
        {
          // The workbook prints each option as a letter plus its description;
          // the blank records only the letter, so the descriptions are labels.
          id: 'w1',
          items: ['a', 'b', 'c', 'd', 'e', 'f'],
          optionLabels: {
            a: '高速动车组列车',
            b: '动车组列车',
            c: '直达特快列车',
            d: '快速列车',
            e: '特快列车',
            f: '城际动车组列车',
          },
          allowReuse: false,
        },
      ],
      answerKeyRaw: '③ f; ④ c; ⑤ e; ⑥ d。',
    },
    {
      id: 'tblt-hsk4.u06.B.t2',
      number: '➋',
      type: 'reading',
      sourcePage: 7,
      instructions: '看看上面的信息，然后用给出的选项在（　）中填入合适的词。',
      instructionsL1:
        'Look at the information above, then fill each blank with the right word from the list.',
      body: [
        {
          kind: 'dataTable',
          id: 't2-compare',
          columns: ['', '和谐号', '复兴号'],
          rows: [
            ['行驶速度', '160 - 250km/h', '160 - 350km/h'],
            ['制造开始', '2007年', '2015年'],
            ['免费Wi-Fi网络', '✗', '✓'],
            ['充电口', '✗', '✓'],
          ],
        },
        {
          kind: 'passage',
          text:
            '和谐号和复兴号的主要区别是，复兴号比较{{b1}}，比较{{b2}}，而且比较舒适。' +
            '比如，复兴号全车都有{{b3}}，方便上网。另外，复兴号的每个座位都有{{b4}}，' +
            '手机没电的时候真的很有用。',
        },
      ],
      blanks: {
        // ① is pre-filled in the workbook as a worked example, which is why the
        // printed answer key starts at ②.
        b1: { id: 'b1', kind: 'given', answer: '快' },
        b2: { id: 'b2', kind: 'choose', answer: '新', bank: 'w1' },
        b3: { id: 'b3', kind: 'choose', answer: '免费Wi-Fi', bank: 'w1' },
        b4: { id: 'b4', kind: 'choose', answer: '充电口', bank: 'w1' },
      },
      banks: [{ id: 'w1', items: ['快', '免费Wi-Fi', '充电口', '新'], allowReuse: false }],
      answerKeyRaw: '② 新; ③ 免费Wi-Fi; ④ 充电口。',
    },
    {
      id: 'tblt-hsk4.u06.B.t4',
      number: '➍',
      type: 'reading',
      sourcePage: 9,
      instructions:
        '这个周末，你想从北京坐高铁去杭州玩。参照下面“铁路12306”APP 的截图，回答问题。',
      instructionsL1:
        'This weekend you want to take the high-speed train from Beijing to Hangzhou. Look at the 12306 app screen and answer the questions.',
      body: [
        {
          kind: 'mockApp',
          app: 'railway-12306',
          fallbackImage: 'tblt-hsk4/u06/b4-fallback.png',
          goals: [
            { id: 'fastest', blankId: 'b1', prompt: '哪次列车最快？' },
            { id: 'cheapest', blankId: 'b2', prompt: '哪次列车最便宜？' },
            { id: 'fuxing', blankId: 'b3', prompt: '哪些列车是“复兴号”？' },
            { id: 'sold-out', blankId: 'b4', prompt: '哪次列车的票已经卖完了（售罄）？' },
            { id: 'business', blankId: 'b5', prompt: '哪些列车有商务座（不包括候补）？' },
            { id: 'sleeper', blankId: 'b6', prompt: '哪次列车有卧铺票（一等卧、二等卧、硬卧、软卧等，但不包括候补）？' },
          ],
        },
      ],
      blanks: {
        // ① is pre-filled in the workbook, so the key starts at ②.
        b1: { id: 'b1', kind: 'given', answer: 'G49' },
        b2: { id: 'b2', kind: 'goal', answer: 'K1275' },
        // Several trains answer this, so any of them satisfies the goal and all
        // of them are accepted by grading. The validator additionally proves each
        // accepted value is in the printed key.
        b3: { id: 'b3', kind: 'goal', answer: 'G875', accept: ['G49', 'D17', 'D11'] },
        b4: { id: 'b4', kind: 'goal', answer: 'Z281' },
        b5: { id: 'b5', kind: 'goal', answer: 'G871', accept: ['G875'] },
        b6: { id: 'b6', kind: 'goal', answer: 'D17', accept: ['D11'] },
      },
      answerKeyRaw: '② K1275; ③ G875、G49、D17、D11; ④ Z281; ⑤ G871、G875; ⑥ D17、D11。',
    },
  ],
};
