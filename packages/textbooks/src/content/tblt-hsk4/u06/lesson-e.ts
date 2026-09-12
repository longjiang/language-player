/**
 * Lesson 六E — 完全不用排队 (unit 6, lesson E).
 *
 * The writing lesson. Source: workbook pages 21 and 22.
 */

import type { LessonMeta } from '../../../types';

export const lessonE: LessonMeta = {
  id: 'E',
  letter: 'E',
  title: '完全不用排队',
  canDo: '能写出一段话简单分享自己的出行经历和感受。',
  tasks: [
    {
      id: 'tblt-hsk4.u06.E.t1',
      number: '➊',
      type: 'writing',
      sourcePage: 21,
      instructions: '学习以下的词汇，然后听录音，写下听到的内容。',
      audio: [
        { key: 'tblt-hsk4/u06/六E ➊ ①.mp3' },
        { key: 'tblt-hsk4/u06/六E ➊ ②.mp3' },
        { key: 'tblt-hsk4/u06/六E ➊ ③.mp3' },
        { key: 'tblt-hsk4/u06/六E ➊ ④.mp3' },
      ],
      body: [
        {
          kind: 'pictureSet',
          id: 'vocab',
          items: [
            { letter: 'A', label: '转机', image: 'tblt-hsk4/u06/e1-a.png' },
            { letter: 'B', label: '门票（入场券）', image: 'tblt-hsk4/u06/e1-b.png' },
            { letter: 'C', label: '十字路口', image: 'tblt-hsk4/u06/e1-c.png' },
            { letter: 'D', label: '交警', image: 'tblt-hsk4/u06/e1-d.png' },
            { letter: 'E', label: '加油站', image: 'tblt-hsk4/u06/e1-e.png' },
          ],
        },
        { kind: 'dictation', ids: ['b1', 'b2', 'b3', 'b4'] },
      ],
      blanks: {
        // Dictation, so `expectedLength` is the workbook's printed box count —
        // the one place it is set explicitly rather than defaulting to the
        // answer length. Punctuation is not boxed, so it is excluded.
        b1: { id: 'b1', kind: 'type', answer: '我需要在北京转机。', expectedLength: 8 },
        b2: { id: 'b2', kind: 'type', answer: '博物馆门票多少钱？', expectedLength: 8 },
        b3: { id: 'b3', kind: 'type', answer: '十字路口站着一个交警。', expectedLength: 10 },
        b4: { id: 'b4', kind: 'type', answer: '路上有加油站吗？', expectedLength: 7 },
      },
      answerKeyRaw:
        '① 我需要在北京转机。② 博物馆门票多少钱？③ 十字路口站着一个交警。④ 路上有加油站吗？',
    },
    {
      id: 'tblt-hsk4.u06.E.t2',
      number: '➋',
      type: 'writing',
      sourcePage: 21,
      instructions: '学习以下的词汇，然后听录音，写下听到的内容。',
      audio: [
        { key: 'tblt-hsk4/u06/六E ➋ ①.mp3' },
        { key: 'tblt-hsk4/u06/六E ➋ ②.mp3' },
        { key: 'tblt-hsk4/u06/六E ➋ ③.mp3' },
      ],
      body: [
        {
          kind: 'pictureSet',
          id: 'vocab',
          items: [
            { letter: 'A', label: '停车', image: 'tblt-hsk4/u06/e2-a.png' },
            { letter: 'B', label: '停车场', image: 'tblt-hsk4/u06/e2-b.png' },
            { letter: 'C', label: '车位', image: 'tblt-hsk4/u06/e2-c.png' },
            { letter: 'D', label: '车速', image: 'tblt-hsk4/u06/e2-d.png' },
          ],
        },
        { kind: 'dictation', ids: ['b1', 'b2', 'b3'] },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'type', answer: '这里不能停车。', expectedLength: 6 },
        b2: { id: 'b2', kind: 'type', answer: '停车场还有车位了？', expectedLength: 8 },
        b3: { id: 'b3', kind: 'type', answer: '现在车速多少？', expectedLength: 6 },
      },
      answerKeyRaw: '① 这里不能停车。② 停车场还有车位了？③ 现在车速多少？',
    },
    {
      id: 'tblt-hsk4.u06.E.t3',
      number: '➌',
      type: 'reading',
      sourcePage: 22,
      instructions: '看一段乘坐商务座去上海的经历的社交媒体范文。',
      audio: [{ key: 'tblt-hsk4/u06/六E ➌.mp3' }],
      body: [
        {
          kind: 'passage',
          text:
            '这次去中国旅游，先去了扬州，然后去了上海。去上海这一程，我想试试商务座的高铁，' +
            '因为从来没坐过。在扬州东站，我去售票窗口买票。等了很久，因为经常有人在我前头插队。' +
            '这次发现中国插队的情况还是很普遍。如果不想有人插队，就必须和前面的人站得很近。' +
            '在中国，好像人们都急急忙忙的，经常有人要挤到你前头去，这一点我很不适应。' +
            '好在排到我时，我顺利买到了下一班的商务座车票。商务座有个好处，就是可以使用商务座' +
            '休息区，里面不但有舒服的沙发，还有免费的咖啡和小点心。快要出发时，候车区的' +
            '工作人员还会提醒你去检票口，非常周到。另外，你可以在其他人检票前，优先通过检票口' +
            '进入站台，完全不用排队。',
        },
      ],
    },
    {
      id: 'tblt-hsk4.u06.E.t4',
      number: '➍',
      type: 'writing',
      sourcePage: 22,
      instructions:
        '你自己出行时遇到过什么困难或者感到意外的经历？写一写，然后发布到你的社交平台上，或者贴在这一课的评论区里。',
      body: [{ kind: 'freeWrite', blankId: 'b1', rows: 8 }],
      blanks: {
        // No answer: free writing is recorded, not graded.
        b1: { id: 'b1', kind: 'free', answer: '' },
      },
    },
  ],
};
