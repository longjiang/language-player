/**
 * Lesson 六D — 那边的地铁好不好坐啊 (unit 6, lesson D).
 *
 * Note-taking task (➎, printed page 19), the one Phase 3 needs. The rest of the
 * lesson — the listening tasks ➊–➍, the draft-writing ➏ and the record-yourself ➐ —
 * is not authored yet.
 */

import type { LessonMeta } from '../../../types';

export const lessonD: LessonMeta = {
  id: 'D',
  letter: 'D',
  title: '那边的地铁好不好坐啊',
  canDo: '能比较流利地介绍自己的出行情况。',
  tasks: [
    {
      id: 'tblt-hsk4.u06.D.t1',
      number: '➊',
      type: 'listening',
      sourcePage: 16,
      // The booklet prints a~f but its bank is A~I; the bank is right.
      instructions: '听录音，在（　）中填入 A～I 的内容。',
      body: [
        {
          // One recording per paragraph, declared on the block it belongs to, so a
          // student plays each paragraph where they read it.
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六D ➊ 1.mp3' }],
          text:
            '现在好多地方的公共交通都需要先办卡，然后给里面（{{b1}}）。但是充得太多，钱剩下来了也挺浪费。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六D ➊ 2.mp3' }],
          text: '在国外旅游，与其住酒店，还是住（{{b2}}）更好。既省钱，还能多交朋友。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六D ➊ 3.mp3' }],
          text: '在伦敦，不管坐公交车还是地铁，都可以（{{b3}}）用信用卡碰一下支付。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六D ➊ 4.mp3' }],
          text:
            '我去过一次东京。那儿的地铁和电车，哎呀，太（{{b4}}）了！完全不明白，一不小心就坐错。' +
            '不过，日本的列车确实很（{{b5}}），而且不需要（{{b6}}），可以直接上车。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六D ➊ 5.mp3' }],
          text:
            '本来想用（{{b7}}）买票，但是发现只能用身份证，不能用护照，所以还是得去人工窗口（{{b8}}）。真麻烦啊。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六D ➊ 6.mp3' }],
          text: '在日本，坐电车之前一定要先看好车站的（{{b9}}），看清楚出发的时间、方向、和站台号码。',
        },
      ],
      blanks: {
        // The booklet prints ① A as the worked example.
        b1: { id: 'b1', kind: 'given', answer: 'A' },
        b2: { id: 'b2', kind: 'choose', answer: 'E', bank: 'd1-fill' },
        b3: { id: 'b3', kind: 'choose', answer: 'F', bank: 'd1-fill' },
        b4: { id: 'b4', kind: 'choose', answer: 'B', bank: 'd1-fill' },
        b5: { id: 'b5', kind: 'choose', answer: 'H', bank: 'd1-fill' },
        b6: { id: 'b6', kind: 'choose', answer: 'G', bank: 'd1-fill' },
        b7: { id: 'b7', kind: 'choose', answer: 'C', bank: 'd1-fill' },
        b8: { id: 'b8', kind: 'choose', answer: 'I', bank: 'd1-fill' },
        b9: { id: 'b9', kind: 'choose', answer: 'D', bank: 'd1-fill' },
      },
      banks: [
        {
          // The workbook prints a letter plus its word; the blank records the letter,
          // which is what the key gives.
          id: 'd1-fill',
          items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
          optionLabels: {
            A: '充值',
            B: '复杂',
            C: '售票机',
            D: '大屏幕',
            E: '青年旅店',
            F: '直接',
            G: '安检',
            H: '准时',
            I: '排队',
          },
        },
      ],
      answerKeyRaw: '② E；③ F；④ B；⑤ H；⑥ G；⑦ C；⑧ I；⑨ D。',
    },
    {
      id: 'tblt-hsk4.u06.D.t2',
      number: '➋',
      type: 'listening',
      sourcePage: 17,
      instructions:
        '听一段介绍温哥华的公共交通的成段表达录音，然后按照录音中说明的顺序，在（　）中填入数字1～5。接着根据录音的内容在［　］里填入A～E中最合适的描述。',
      audio: [{ key: 'tblt-hsk4/u06/六D ➋.mp3' }],
      body: [
        {
          kind: 'dataTable',
          id: 'd2-topics',
          columns: ['顺序', '话题', '描述'],
          rows: [
            // (1) 路线 and its description are printed as the worked example.
            { cells: ['（{{b1}}）', '路线', '［{{b2}}］'] },
            { cells: ['（{{b3}}）', '运营时刻', '［{{b4}}］'] },
            { cells: ['（{{b5}}）', '站台', '［{{b6}}］'] },
            { cells: ['（{{b7}}）', '买票、支付', '［{{b8}}］'] },
            { cells: ['（{{b9}}）', '其它需要注意的', '［{{b10}}］'] },
          ],
        },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'given', answer: '1' },
        b2: { id: 'b2', kind: 'given', answer: 'A' },
        // The order is the key's own row numbering, so these opt out of the
        // per-blank key check — their id does not correspond to a key item.
        b3: { id: 'b3', kind: 'choose', answer: '4', bank: 'd2-order', keyIndex: null },
        b5: { id: 'b5', kind: 'choose', answer: '3', bank: 'd2-order', keyIndex: null },
        b7: { id: 'b7', kind: 'choose', answer: '2', bank: 'd2-order', keyIndex: null },
        b9: { id: 'b9', kind: 'choose', answer: '5', bank: 'd2-order', keyIndex: null },
        // Each description is the key item for its row's number.
        b4: { id: 'b4', kind: 'choose', answer: 'C', bank: 'd2-desc', keyIndex: 4 },
        b6: { id: 'b6', kind: 'choose', answer: 'E', bank: 'd2-desc', keyIndex: 3 },
        b8: { id: 'b8', kind: 'choose', answer: 'D', bank: 'd2-desc', keyIndex: 2 },
        b10: { id: 'b10', kind: 'choose', answer: 'B', bank: 'd2-desc', keyIndex: 5 },
      },
      banks: [
        { id: 'd2-order', items: ['1', '2', '3', '4', '5'] },
        {
          id: 'd2-desc',
          items: ['A', 'B', 'C', 'D', 'E'],
          optionLabels: {
            A: '分蓝色、黄色、浅蓝色',
            B: '按照区域收费',
            C: '夜里1点停止运营',
            D: '可以直接用信用卡碰一下',
            E: '仔细看显示屏',
          },
        },
      ],
      answerKeyRaw: '(4) 运营时刻 [ C ]；(3) 站台 [ E ]；(2) 买票、支付 [ D ]；(5) 其它需要注意的 [ B ]。',
    },
    {
      id: 'tblt-hsk4.u06.D.t3',
      number: '➌',
      type: 'listening',
      sourcePage: 18,
      instructions: '再听一遍 ➋ 的录音，然后在（　）中填入适当的词语。',
      // Replays ➋'s recording, the same way C ➍ replays C ➌'s.
      audio: [{ key: 'tblt-hsk4/u06/六D ➋.mp3' }],
      body: [
        {
          kind: 'passage',
          text:
            '直接回答对方问题的话：\n\n' +
            '下了飞机以后（{{b1}}）Canada Line，也就是温哥华的……可以说是"地铁"吧。' +
            '然后你一直（{{b2}}），在最后一站，就是Waterfront站下车。Gastown就在车站旁边。' +
            '温哥华的"地铁"叫SkyTrain，（{{b3}}）就三条线……' +
            '反正你走之前用地图APP查下路线，（{{b4}}）就行了。',
        },
        {
          kind: 'passage',
          text:
            '提起其它信息或注意点的话：\n\n' +
            '你可以办个Compass卡，然后（{{b5}}）。……\n' +
            '有的站比较复杂，有好几个（{{b6}}）。你在站台等车的时候要仔细看屏幕，' +
            '确定车走的（{{b7}}）跟你地图APP说的一样，不要（{{b8}}）。……\n' +
            'SkyTrain是（{{b9}}）收费的。整个温哥华分成三个区。如果你只在一个区域坐车，就比较便宜；' +
            '如果要（{{b10}}）好几个区域就会比较贵。不过，晚上6:30以后，还有周末，' +
            '（{{b11}}）都算一个区域，所以晚上和周末会比较（{{b12}}）。',
        },
      ],
      blanks: {
        // ① is printed in the transcript as the worked example.
        b1: { id: 'b1', kind: 'given', answer: '直接上' },
        b2: { id: 'b2', kind: 'type', answer: '坐到头' },
        b3: { id: 'b3', kind: 'type', answer: '一共' },
        b4: { id: 'b4', kind: 'type', answer: '跟着走' },
        b5: { id: 'b5', kind: 'type', answer: '给里面充值' },
        b6: { id: 'b6', kind: 'type', answer: '站台' },
        b7: { id: 'b7', kind: 'type', answer: '方向' },
        b8: { id: 'b8', kind: 'type', answer: '坐错了' },
        b9: { id: 'b9', kind: 'type', answer: '按照区域' },
        b10: { id: 'b10', kind: 'type', answer: '经过' },
        b11: { id: 'b11', kind: 'type', answer: '去哪儿' },
        b12: { id: 'b12', kind: 'type', answer: '便宜' },
      },
      answerKeyRaw:
        '② 坐到头；③ 一共；④ 跟着走；⑤ 给里面充值；⑥ 站台；⑦ 方向；⑧ 坐错了；⑨ 按照区域；⑩ 经过；⑪ 去哪儿；⑫ 便宜。',
    },
    {
      id: 'tblt-hsk4.u06.D.t4',
      number: '➍',
      type: 'conversation',
      sourcePage: 18,
      instructions: '看看对话中成段表达的文本。听录音，然后跟读。',
      audio: [{ key: 'tblt-hsk4/u06/六D ➋.mp3' }],
      body: [
        {
          // Shadowing: the transcript and nothing to answer, so there are no blanks.
          kind: 'passage',
          text:
            '你酒店在哪儿？……哦，那容易。下了飞机以后直接上Canada Line，也就是温哥华的……' +
            '可以说是"地铁"吧。然后你一直坐到头，在最后一站，就是Waterfront站下车。' +
            'Gastown就在车站旁边。温哥华的"地铁"叫SkyTrain，一共就三条线：一条蓝的Expo Line，' +
            '一条黄的Millenium Line，还有一条浅蓝色的Canada Line。' +
            '反正你走之前用地图APP查下路线，跟着走就行了。\n\n' +
            '然后就是票。你可以办个Compass卡，然后给里面充值。Compass卡的话，' +
            'SkyTrain站的售票机就可以买。现金、刷卡都可以。充值的时候也用售票机充，' +
            '也可以随时在网上充。或者不用Compass卡，你进站的时候可以直接用你信用卡碰一下就可以。' +
            '不过就是，直接用信用卡的话会贵那么一点。\n\n' +
            '有的站比较复杂，有好几个站台。你在站台等车的时候要仔细看屏幕，' +
            '确定车走的方向跟你地图APP说的一样，不要坐错了。车的话，基本上每几分钟来一班，' +
            '特别方便。最后一班车大概是凌晨1点左右。\n\n' +
            '嗯，我想想还有什么要告诉你的……哦对了，SkyTrain是按照区域收费的。' +
            '整个温哥华分成三个区。如果你只在一个区域坐车，就比较便宜；' +
            '如果要经过好几个区域就会比较贵。不过，晚上6点半以后，还有周末，' +
            '去哪儿都算一个区域，所以晚上和周末会比较便宜。',
        },
      ],
    },
    {
      id: 'tblt-hsk4.u06.D.t5',
      number: '➎',
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
    {
      id: 'tblt-hsk4.u06.D.t6',
      number: '➏',
      type: 'writing',
      sourcePage: 20,
      instructions:
        '你的城市的公共交通怎么样？如果去你的城市去旅游，可以怎么坐车？请介绍一下。首先，用类似的结构写一个草稿。',
      body: [
        {
          // The same five headings ➎ used, since the instruction is to write a draft
          // with a similar structure; only the content differs.
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
        b1: { id: 'b1', kind: 'free', answer: '' },
        b2: { id: 'b2', kind: 'free', answer: '' },
        b3: { id: 'b3', kind: 'free', answer: '' },
        b4: { id: 'b4', kind: 'free', answer: '' },
        b5: { id: 'b5', kind: 'free', answer: '' },
      },
    },
    {
      id: 'tblt-hsk4.u06.D.t7',
      number: '➐',
      type: 'conversation',
      sourcePage: 20,
      // Recording itself is outside the app: it needs a microphone and somewhere to
      // put the audio, and neither app has that. The task is therefore the
      // instruction, the draft to read from, and a self-check the student fills in
      // afterwards — see SPEC-095's Known Gaps.
      instructions:
        '按照你写的草稿，录一段介绍自己城市的公共交通的音频。录完以后，回听一遍，在下面写下你想改进的地方。',
      body: [
        {
          kind: 'recall',
          taskId: 'tblt-hsk4.u06.D.t6',
          title: '你在 ➏ 写的草稿',
          items: [
            { blankId: 'b1', title: '路线' },
            { blankId: 'b2', title: '买票、支付' },
            { blankId: 'b3', title: '站台等车' },
            { blankId: 'b4', title: '运营时刻' },
            { blankId: 'b5', title: '其它' },
          ],
        },
        {
          kind: 'freeWrite',
          blankId: 'b1',
          rows: 4,
        },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'free', answer: '' },
      },
    },
  ],
};
