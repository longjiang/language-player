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
        // Transcripts are the booklet's, one per recording; the speaker is the voice
        // heard (广播 for the announcement, otherwise 女/男 as the booklet marks them).
        b1: {
          id: 'b1',
          kind: 'given',
          answer: 'A',
          audio: [
            {
              key: 'tblt-hsk4/u06/六C ➊ ① 下一站，无锡站.mp3',
              transcript: [
                { speaker: '广播', text: '各位乘客，您好。欢迎您乘坐和谐号动车组列车。下一站，无锡站。' },
              ],
            },
          ],
        },
        b2: {
          id: 'b2',
          kind: 'choose',
          answer: 'C',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六C ➊ ②.mp3',
              transcript: [
                { speaker: '女', text: '不好意思，需要补一张去杭州的票。' },
                { speaker: '男', text: '到杭州站是吗？身份证看一下。' },
              ],
            },
          ],
        },
        b3: {
          id: 'b3',
          kind: 'choose',
          answer: 'B',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六C ➊ ③.mp3',
              transcript: [
                { speaker: '男', text: '你好，用护照进站可以吗？' },
                { speaker: '女', text: '可以。你到中间那台闸机口，可以刷护照。' },
              ],
            },
          ],
        },
        b4: {
          id: 'b4',
          kind: 'choose',
          answer: 'D',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六C ➊ ④.mp3',
              transcript: [
                { speaker: '男1', text: '你好，我从西安过来的，现在要换乘去南京，应该怎么走啊？' },
                { speaker: '男2', text: '南京吗？几点的？' },
                { speaker: '男1', text: '2:45的。' },
                { speaker: '男2', text: '去5A。' },
                { speaker: '男1', text: '好的，谢谢啊。' },
              ],
            },
          ],
        },
      },
      answerKeyRaw: '② C; ③ B; ④ D。',
    },
    {
      id: 'tblt-hsk4.u06.C.t2',
      number: '➋',
      type: 'listening',
      sourcePage: 13,
      instructions: '听录音，选择最合适的图片：',
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
        // The booklet prints each of these as one run-on paragraph with the speakers
        // embedded; the transcript splits it back into turns, which is how the same
        // booklet prints its other conversations.
        b1: {
          id: 'b1',
          kind: 'given',
          answer: 'A',
          audio: [
            {
              key: 'tblt-hsk4/u06/六C ➋ ①.mp3',
              transcript: [
                { speaker: '女', text: '你好，一共是47元。' },
                { speaker: '男', text: '支付宝可以吗？' },
                { speaker: '女', text: '可以，我扫你付款码。' },
                { speaker: 'POS', text: '支付到账47元。' },
              ],
            },
          ],
        },
        b2: {
          id: 'b2',
          kind: 'choose',
          answer: 'C',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六C ➋ ②.mp3',
              transcript: [
                { speaker: '女1', text: '女士，您的美式好了。' },
                { speaker: '女2', text: '啊，谢谢。微信支付可以吗？' },
                { speaker: '女1', text: '嗯，我扫你支付码。' },
              ],
            },
          ],
        },
        b3: {
          id: 'b3',
          kind: 'choose',
          answer: 'B',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六C ➋ ③.mp3',
              transcript: [
                { speaker: '男1', text: '来两个煎饼。' },
                { speaker: '男2', text: '好。5块。' },
                { speaker: '男1', text: '给你10块。' },
                { speaker: '男2', text: '嗯，给你找5块。' },
              ],
            },
          ],
        },
        b4: {
          id: 'b4',
          kind: 'choose',
          answer: 'D',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六C ➋ ④.mp3',
              transcript: [
                { speaker: '男', text: '你好，这边可以刷信用卡吗？' },
                { speaker: '女', text: '可以，请用这边自助收银。' },
              ],
            },
          ],
        },
      },
      answerKeyRaw: '② C; ③ B; ④ D。',
    },
    {
      id: 'tblt-hsk4.u06.C.t3',
      number: '➌',
      type: 'listening',
      sourcePage: 13,
      instructions:
        '听听一段在高铁扬州东站的一位旅客和售票窗口工作人员的对话。听的时候请注意：',
      // The recording ➍ shows the transcript of.
      //
      // The transcript is that printed dialogue, with ➍'s blanks filled in from their
      // bank (`要不`, `我看一下`, `等一下`, `那就`) and the workbook's brackets around them
      // dropped — so the student reading along hears the words the speakers actually
      // say rather than the four the exercise removes. The workbook prints the two
      // stage directions (（拿出护照）, （"哔"的一声…）) inside the same dialogue, and they
      // are kept: this is the page ➍ prints, not a re-transcription of the audio.
      audio: [
        {
          key: 'tblt-hsk4/u06/六C ➌.mp3',
          transcript: [
            { speaker: '乘客', text: '你好，买一张去上海的商务票。' },
            { speaker: '售票员', text: '今天的吗？' },
            { speaker: '乘客', text: '今天，尽快的。' },
            {
              speaker: '售票员',
              text:
                '最近到上海的是下午2点29的。但是这班车没有商务座，只有一等座。' +
                '下一班2点56的这班车有商务座。',
            },
            { speaker: '乘客', text: '可以。那2点56的。' },
            {
              speaker: '售票员',
              text:
                '2点56的，好的……你要不买那个吧，买3点13的吧，这班车快一点，' +
                '比那一趟2点56的车早一点到。',
            },
            { speaker: '乘客', text: '价格一样吗？' },
            {
              speaker: '售票员',
              text:
                '价格啊，我看一下啊……2点56商务座503。等一下我看看这趟车，还有没有商务座……' +
                '没有商务座了，3点13的没有商务座了。那就2点56的这班车，可以有商务座。',
            },
            { speaker: '乘客', text: '行。' },
            {
              speaker: '售票员',
              text: '好的。那就给你买今天下午2点56这一班，扬州东站到上海站的，一张商务座，票价503，行吗？',
            },
            { speaker: '乘客', text: '行。' },
            { speaker: '售票员', text: '身份证。' },
            { speaker: '乘客', text: '（拿出护照）这是我护照……支付宝可以吗？' },
            { speaker: '售票员', text: '好，我扫你付款码。（“哔”的一声，付款完成。工作人员给票。）' },
            { speaker: '乘客', text: '好，谢谢。' },
          ],
        },
      ],
      body: [
        {
          kind: 'passage',
          text:
            '① 乘客想买什么样的票？（{{b1}}）\n\n' +
            '② 售票员一开始给出了什么建议？（{{b2}}）\n\n' +
            '③ 最后乘客买了几点的票？（{{b3}}）',
        },
      ],
      blanks: {
        // Comprehension answers, not exact strings: the key prints model sentences
        // (乘客想买今天、尽快的去上海的商务座票。) and any wording that carries the same
        // information is right, so these are recorded and not scored.
        b1: { id: 'b1', kind: 'free', answer: '' },
        b2: { id: 'b2', kind: 'free', answer: '' },
        b3: { id: 'b3', kind: 'free', answer: '' },
      },
      answerKeyRaw:
        '乘客想买今天、尽快的去上海的商务座票。售票员建议买3:13的快一点的票。最后乘客买了2:56的票。',
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
