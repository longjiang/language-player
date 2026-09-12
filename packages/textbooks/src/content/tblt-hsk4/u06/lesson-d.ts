/**
 * Lesson 六D — 那边的地铁好不好坐啊 (unit 6, lesson D).
 *
 * Note-taking task. Source: workbook pages 17 and 19. The listening tasks (➊–➌
 * and ➍/➎) are not authored yet; this lesson currently contributes the
 * note-capture task, which is the one Phase 3 needs.
 */

import type { LessonMeta } from '../../../types';

export const lessonD: LessonMeta = {
  id: 'D',
  letter: 'D',
  title: '那边的地铁好不好坐啊',
  canDo: '能比较流利地介绍自己的出行情况。',
  tasks: [
    {
      id: 'tblt-hsk4.u06.D.t6',
      number: '➏',
      type: 'writing',
      sourcePage: 19,
      instructions: '讲话的人主要都说了些什么？按照下面列出的话题，把讲话内容写成笔记。',
      audio: [{ key: 'tblt-hsk4/u06/六D ➍.mp3' }],
      body: [
        {
          kind: 'noteCards',
          cards: [
            { blankId: 'b1', title: '路线' },
            { blankId: 'b2', title: '买票、支付' },
            { blankId: 'b3', title: '站台等车' },
            { blankId: 'b4', title: '运营时刻' },
            { blankId: 'b5', title: '其它' },
          ],
        },
      ],
      blanks: {
        // Notes are recorded, not graded — the workbook prints 路线's first two
        // lines as a worked example, which the student continues.
        b1: { id: 'b1', kind: 'free', answer: '' },
        b2: { id: 'b2', kind: 'free', answer: '' },
        b3: { id: 'b3', kind: 'free', answer: '' },
        b4: { id: 'b4', kind: 'free', answer: '' },
        b5: { id: 'b5', kind: 'free', answer: '' },
      },
    },
  ],
};
