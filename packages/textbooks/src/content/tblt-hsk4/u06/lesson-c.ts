/**
 * Lesson 六C — 有商务座吗 (unit 6, lesson C).
 *
 * Source: workbook pages 13 and 14.
 */

import type { LessonMeta } from '../../../types';

export const lessonC: LessonMeta = {
  id: 'C',
  letter: 'C',
  title: '有商务座吗',
  canDo: '能询问交通出行的情况，回答关于交通出行的有一定复杂度的问题。',
  tasks: [
    {
      id: 'tblt-hsk4.u06.C.t1',
      number: '➊',
      type: 'listening',
      sourcePage: 13,
      instructions: '听录音，选择最合适的图片：',
      audio: [
        { key: 'tblt-hsk4/u06/六C ➊ ① 下一站，无锡站.mp3', blankId: 'b1' },
        { key: 'tblt-hsk4/u06/六C ➊ ②.mp3', blankId: 'b2' },
        { key: 'tblt-hsk4/u06/六C ➊ ③.mp3', blankId: 'b3' },
        { key: 'tblt-hsk4/u06/六C ➊ ④.mp3', blankId: 'b4' },
      ],
      body: [
        {
          kind: 'pictureSet',
          id: 'ps1',
          items: [
            { letter: 'A', label: '乘客正在乘坐高铁', image: 'tblt-hsk4/u06/c1-a.jpg' },
            { letter: 'B', label: '乘客用护照通过检票口', image: 'tblt-hsk4/u06/c1-b.jpg' },
            {
              letter: 'C',
              label: '乘务员要旅客出示身份证',
              image: 'tblt-hsk4/u06/c1-c.jpg',
            },
            {
              letter: 'D',
              label: '西安去南京，需要在郑州换乘',
              image: 'tblt-hsk4/u06/c1-d.jpg',
            },
      ],
        },
        { kind: 'numberedBlanks', ids: ['b1', 'b2', 'b3', 'b4'] },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'given', answer: 'A' },
        b2: { id: 'b2', kind: 'choose', answer: 'C', optionSet: 'ps1' },
        b3: { id: 'b3', kind: 'choose', answer: 'B', optionSet: 'ps1' },
        b4: { id: 'b4', kind: 'choose', answer: 'D', optionSet: 'ps1' },
      },
      answerKeyRaw: '② C; ③ B; ④ D。',
    },
    {
      id: 'tblt-hsk4.u06.C.t2',
      number: '➋',
      type: 'listening',
      sourcePage: 13,
      instructions: '听录音，选择最合适的图片：',
      audio: [
        { key: 'tblt-hsk4/u06/六C ➋ ①.mp3', blankId: 'b1' },
        { key: 'tblt-hsk4/u06/六C ➋ ②.mp3', blankId: 'b2' },
        { key: 'tblt-hsk4/u06/六C ➋ ③.mp3', blankId: 'b3' },
        { key: 'tblt-hsk4/u06/六C ➋ ④.mp3', blankId: 'b4' },
      ],
      body: [
        {
          kind: 'pictureSet',
          id: 'ps1',
          items: [
            { letter: 'A', label: '拿出“支付宝”付款码', image: 'tblt-hsk4/u06/c2-a.jpg' },
            { letter: 'B', label: '用现金支付', image: 'tblt-hsk4/u06/c2-b.jpg' },
            { letter: 'C', label: '拿出“微信支付”付款码', image: 'tblt-hsk4/u06/c2-c.jpg' },
            { letter: 'D', label: '刷信用卡', image: 'tblt-hsk4/u06/c2-d.jpg' },
      ],
        },
        { kind: 'numberedBlanks', ids: ['b1', 'b2', 'b3', 'b4'] },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'given', answer: 'A' },
        b2: { id: 'b2', kind: 'choose', answer: 'C', optionSet: 'ps1' },
        b3: { id: 'b3', kind: 'choose', answer: 'B', optionSet: 'ps1' },
        b4: { id: 'b4', kind: 'choose', answer: 'D', optionSet: 'ps1' },
      },
      answerKeyRaw: '② C; ③ B; ④ D。',
    },
    {
      id: 'tblt-hsk4.u06.C.t4',
      number: '➍',
      type: 'conversation',
      sourcePage: 14,
      instructions: '看着对话文本再听一遍 ➌ 的录音，在（　）里填写需要的词语。',
      audio: [{ key: 'tblt-hsk4/u06/六C ➌.mp3' }],
      body: [
        {
          kind: 'dialogue',
          id: 't4-dialogue',
          lines: [
            { speaker: '乘客', text: '你好，买一张去上海的商务票。' },
            { speaker: '售票员', text: '今天的吗？' },
            { speaker: '乘客', text: '今天，尽快的。' },
            {
              speaker: '售票员',
              text:
                '最近到上海的是下午2点29的。但是这班车没有商务座，只有一等座。' +
                '下一班2点56的这班车有商务座。',
            },
            { speaker: '乘客', text: '可以。（{{b1}}）2点56的。' },
            {
              speaker: '售票员',
              text:
                '2点56的，好的……你（{{b2}}）买那个吧，买3点13的吧，' +
                '这班车快一点，比那一趟2点56的车早一点到。',
            },
            { speaker: '乘客', text: '价格一样吗？' },
            {
              speaker: '售票员',
              text:
                '价格啊，（{{b3}}）啊……2点56商务座503。（{{b4}}）我看看这趟车，' +
                '还有没有商务座……没有商务座了，3点13的没有商务座了。' +
                '那就2点56的这班车，可以有商务座。',
            },
            { speaker: '乘客', text: '行。' },
            {
              speaker: '售票员',
              text:
                '好的。（{{b5}}）给你买今天下午2点56这一班，扬州东站到上海站的，' +
                '一张商务座，票价503，行吗？',
            },
            { speaker: '乘客', text: '行。' },
            { speaker: '售票员', text: '身份证。' },
            { speaker: '乘客', text: '（拿出护照）这是我护照……支付宝可以吗？' },
            {
              speaker: '售票员',
              text: '好，我扫你付款码。（“哔”的一声，付款完成。工作人员给票。）',
            },
            { speaker: '乘客', text: '好，谢谢。' },
      ],
        },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'given', answer: 'A' },
        b2: { id: 'b2', kind: 'choose', answer: 'C', bank: 'w1' },
        b3: { id: 'b3', kind: 'choose', answer: 'D', bank: 'w1' },
        b4: { id: 'b4', kind: 'choose', answer: 'E', bank: 'w1' },
        b5: { id: 'b5', kind: 'choose', answer: 'B', bank: 'w1' },
      },
      banks: [
        {
          id: 'w1',
          items: ['A', 'B', 'C', 'D', 'E'],
          optionLabels: { A: '那', B: '那就', C: '要不', D: '我看一下', E: '等一下' },
          allowReuse: false,
        },
      ],
      answerKeyRaw: '② C; ③ D; ④ E; ⑤ B。',
    },
      ],
};
