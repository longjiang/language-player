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
      id: 'tblt-hsk4.u06.B.t2',
      number: '➋',
      type: 'reading',
      sourcePage: 7,
      instructions: '看看上面的信息，然后用给出的选项在（　）中填入合适的词。',
      instructionsL1:
        'Look at the information above, then fill each blank with the right word from the list.',
      body: [
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
  ],
};
