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
      //
      // Each keeps the transcript the workbook's Audio Transcript booklet prints for
      // it — one line per city, so ➒ transcripts for nine files, in city order here
      // and in the booklet's own order there (which is not this one).
      audio: [
        {
          key: 'tblt-hsk4/u06/六A ➊ 上海.mp3',
          label: '上海',
          transcript: [{ speaker: '男', text: '不能不去上海啊。必须要跟上海电视塔一起拍一张照啊。' }],
        },
        {
          key: 'tblt-hsk4/u06/六A ➊ 北京.mp3',
          label: '北京',
          transcript: [{ speaker: '女', text: '当然是北京啊！这辈子，不去一次长城，那多遗憾啊。' }],
        },
        {
          key: 'tblt-hsk4/u06/六A ➊ 哈尔滨.mp3',
          label: '哈尔滨',
          transcript: [{ speaker: '女', text: '冬天你去过哈尔滨没？哈尔滨的冰雕很值得一看。' }],
        },
        {
          key: 'tblt-hsk4/u06/六A ➊ 成都.mp3',
          label: '成都',
          transcript: [{ speaker: '女', text: '一定要去成都！大熊猫太可爱了。' }],
        },
        {
          key: 'tblt-hsk4/u06/六A ➊ 新疆.mp3',
          label: '吐鲁番',
          transcript: [{ speaker: '男', text: '新疆特别好玩，而且新疆的吐鲁番有特别好吃的葡萄。' }],
        },
        {
          key: 'tblt-hsk4/u06/六A ➊ 杭州.mp3',
          label: '杭州',
          transcript: [{ speaker: '女', text: '还没去过杭州吧？西湖的景色可美了。' }],
        },
        {
          key: 'tblt-hsk4/u06/六A ➊ 桂林.mp3',
          label: '桂林',
          transcript: [{ speaker: '男', text: '来我们桂林看看吧。‘桂林山水甲天下’嘛！' }],
        },
        {
          key: 'tblt-hsk4/u06/六A ➊ 苏州.mp3',
          label: '苏州',
          transcript: [{ speaker: '男', text: '推荐你去苏州。苏州的园林可是世界遗产啊！' }],
        },
        {
          key: 'tblt-hsk4/u06/六A ➊ 西安.mp3',
          label: '西安',
          transcript: [{ speaker: '男', text: '西安是我的老家，我希望大家都能来西安看看这里的兵马俑。' }],
        },
      ],
      body: [
        {
          kind: 'imageMap',
          id: 't1-map',
          image: 'tblt-hsk4/u06/a1-map.png',
          alt: '中国地图',
          // Positions are percentages of the image, sitting in the printed `（ ）`
          // brackets beside each city name — which is where the instructions tell
          // the student to write ("在城市旁边的（ ）中写下对应的景点") and where the
          // answer's letter belongs. Not on the leader-line dots: a cell there
          // would cover the map instead of filling the blank the workbook prints.
          //
          // Each was measured from the image by detecting the bracket pair and
          // taking the middle of the gap between them (all ten gaps came out 71–79
          // image px, which is the printed spacing), so the cell lands centred in
          // the brackets rather than beside them.
          pins: [
            { blankId: 'b1', x: 32.5, y: 8.26 }, // 吐鲁番
            { blankId: 'b2', x: 96.9, y: 8.26 }, // 哈尔滨
            { blankId: 'b3', x: 50.7, y: 22.68 }, // 西安 (given — the map prints its A)
            { blankId: 'b4', x: 93.6, y: 37.24 }, // 北京
            { blankId: 'b5', x: 82.95, y: 50.44 }, // 苏州
            { blankId: 'b6', x: 93.6, y: 61.27 }, // 上海
            { blankId: 'b7', x: 84.7, y: 74.81 }, // 杭州
            { blankId: 'b8', x: 26.1, y: 82.33 }, // 拉萨
            { blankId: 'b9', x: 43.55, y: 96.95 }, // 成都
            { blankId: 'b10', x: 71.1, y: 89.91 }, // 桂林
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
      //
      // Transcripts are the booklet's, one per announcement. The speaker is where each
      // one is heard — 车站广播, 车内广播, 地铁广播, 机场广播, 扶梯安全提示 — which is
      // the distinction the task is about, so it belongs in the transcript rather than
      // in the text. The booklet numbers them 1.–7.; that numbering is the item index
      // the page already prints as ①, so it is not repeated in the text.
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
        b1: {
          id: 'b1',
          kind: 'given',
          answer: 'A',
          audio: [
            {
              key: 'tblt-hsk4/u06/六A ➋ ① 就要检票了.mp3',
              transcript: [
                {
                  speaker: '车站广播',
                  text: '旅客们，请注意，高7007次列车开始检票。有乘坐高7007次列车的旅客，请到2B检票口。',
                },
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
              key: 'tblt-hsk4/u06/六A ➋ ② 全列禁烟.mp3',
              transcript: [
                {
                  speaker: '车内广播',
                  text:
                    '欢迎您乘坐复兴号动车组列车。本次列车全列禁烟。请不要在车厢内和厕所内吸烟。' +
                    '列车环境关系每一位旅客的出行体验，需要大家共同营造和维护。',
                },
              ],
            },
          ],
        },
        b3: {
          id: 'b3',
          kind: 'choose',
          answer: 'D',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六A ➋ ③ 地铁广播.mp3',
              transcript: [
                {
                  speaker: '地铁广播',
                  text: '乘客们，列车马上就要进站了。本次列车终点站——康文路。请乘客们有序候车。',
                },
              ],
            },
          ],
        },
        b4: {
          id: 'b4',
          kind: 'choose',
          answer: 'E',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六A ➋ ④ 行李转盘.mp3',
              transcript: [
                {
                  speaker: '机场广播',
                  text:
                    '乘坐美国航空公司 AA127，中国南方航空公司 CZ4620 航班，从达拉斯到达本站的旅客请注意：' +
                    '请前往第 28 号行李转盘提取行李。谢谢。',
                },
              ],
            },
          ],
        },
        b5: {
          id: 'b5',
          kind: 'choose',
          answer: 'B',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六A ➋ ⑤ 安全白线.mp3',
              transcript: [
                { speaker: '车站广播', text: '狭长地带，请在安全白线内有序通行，注意安全。' },
              ],
            },
          ],
        },
        b6: {
          id: 'b6',
          kind: 'choose',
          answer: 'G',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六A ➋ ⑥ 请紧握扶手.mp3',
              transcript: [
                { speaker: '扶梯安全提示', text: '请紧握扶手，不要倚靠电梯，注意脚下安全。' },
              ],
            },
          ],
        },
        b7: {
          id: 'b7',
          kind: 'choose',
          answer: 'F',
          optionSet: 'ps1',
          audio: [
            {
              key: 'tblt-hsk4/u06/六A ➋ ⑦ 登机口登机.mp3',
              transcript: [
                {
                  speaker: '机场广播',
                  text:
                    '乘坐加拿大航空公司 AC026（中国国际航空公司 CA7455）次航班前往温哥华的旅客，' +
                    '请注意。请前往 D87 号登机口登机，谢谢。',
                },
              ],
            },
          ],
        },
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
          // Each row's recording carries the booklet's transcript for that speaker: a
          // short interview, so the lines alternate between the speaker and 听者.
          // Declared here rather than in ➍, which replays the same five files — a
          // transcript belongs to the recording, and the book indexes it by key.
          rows: [
            {
              cells: ['李婷婷', '{{b1}}', '{{b2}}'],
              audio: [
                {
                  key: 'tblt-hsk4/u06/六A ➌（1）卢沟桥.mp3',
                  transcript: [
                    {
                      speaker: '李婷婷',
                      text:
                        '在北京还是共享单车比较方便，因为共享单车可以随处借，随处还，去哪儿都可以，特别自由。' +
                        '上次我去卢沟桥就是骑自行车去的。',
                    },
                    { speaker: '听者', text: '骑自行车去卢沟桥啊？那不是很远？' },
                    {
                      speaker: '李婷婷',
                      text: '嗯……是有点远，大概四十多分钟吧。不过坡路不多，骑着很舒服。',
                    },
                  ],
                },
              ],
            },
            {
              cells: ['金敏俊', '{{b3}}', '{{b4}}'],
              audio: [
                {
                  key: 'tblt-hsk4/u06/六A ➌（2）日本.mp3',
                  transcript: [
                    {
                      speaker: '金敏俊',
                      text:
                        '我经常从我老家首尔坐飞机去日本。仁川机场每天都有好多去日本的航班。' +
                        '不管东京还是大阪，都能直达。',
                    },
                    { speaker: '听者', text: '啊，日本全国都可以啊？' },
                    {
                      speaker: '金敏俊',
                      text:
                        '嗯，不管去北海道，去冲绳，还是去什么别的地方，一趟航班就能到，特别方便。' +
                        '所以我没事就老去日本旅游。',
                    },
                  ],
                },
              ],
            },
            {
              cells: ['奥利维亚', '{{b5}}', '{{b6}}'],
              audio: [
                {
                  key: 'tblt-hsk4/u06/六A ➌（3）汉阳陵.mp3',
                  transcript: [
                    {
                      speaker: '奥利维亚',
                      text:
                        '我在西安留学的时候，去哪里都骑电动车，因为便宜，而且方便。' +
                        '记得有次我去汉阳陵，就是骑电动车去的。',
                    },
                    { speaker: '听者', text: '那么远啊，地铁不行吗？' },
                    {
                      speaker: '奥利维亚',
                      text:
                        '嗯……地铁也可以，但是不能直接到景点门口。' +
                        '一般这种偏僻一点的地方我都是骑电动车去的。',
                    },
                  ],
                },
              ],
            },
            {
              cells: ['陈灵', '{{b7}}', '{{b8}}'],
              audio: [
                {
                  key: 'tblt-hsk4/u06/六A ➌（4）河内.mp3',
                  transcript: [
                    {
                      speaker: '陈灵',
                      text:
                        '我是越南顺化人。去年我从老家坐大巴去了一趟河内。我是坐那种可以睡觉的大巴去的，' +
                        '真的很舒服。',
                    },
                    { speaker: '听者', text: '啊？大巴上真的能睡着吗？' },
                    {
                      speaker: '陈灵',
                      text:
                        '真的可以，大巴上的床可舒服了。出发以后一路摇着摇着就睡着了。' +
                        '第二天醒来的时候已经快到河内了，特别方便。',
                    },
                  ],
                },
              ],
            },
            {
              cells: ['朴书妍', '{{b9}}', '{{b10}}'],
              audio: [
                {
                  key: 'tblt-hsk4/u06/六A ➌（5）爱宝乐园.mp3',
                  transcript: [
                    {
                      speaker: '朴书妍',
                      text:
                        '我在我老家首尔去哪儿都坐出租车，出远门也是。上次我从首尔去爱宝乐园，' +
                        '就是坐出租车去的。',
                    },
                    { speaker: '听者', text: '爱宝乐园？那离首尔很远吧？' },
                    { speaker: '朴书妍', text: '嗯，差不多1个小时。' },
                    { speaker: '听者', text: '1小时出租车，那很贵吧？' },
                    {
                      speaker: '朴书妍',
                      text:
                        '嗯，确实是贵了点。但是出租车还是方便。记得那天下大雨。' +
                        '那样的天气，还是出租车安心。',
                    },
                  ],
                },
              ],
            },
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
          // This summary's own pool, printed under it.
          banks: ['a4-1'],
          text:
            '（1）李婷婷觉得共享单车比较方便，因为可以①（{{b1}}）借，②（{{b2}}）还，' +
            '去哪儿都可以，特别自由。上次她去卢沟桥就是骑自行车去的。虽然是有点远，要四十多分钟，' +
            '但③（{{b3}}）不多，骑着很④（{{b4}}）。她从通县回家也是骑回去的。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六A ➌（2）日本.mp3', label: '金敏俊' }],
          // This summary's own pool, printed under it.
          banks: ['a4-2'],
          text:
            '（2）金敏俊经常从他老家首尔坐飞机去日本。仁川机场每天都有好多去日本的航班。' +
            '①（{{b5}}）东京②（{{b6}}）大阪，都能直达。不管去北海道，去冲绳，' +
            '还是日本什么别的地方，一③（{{b7}}）航班就到，特别方便，所以他没事就老去日本旅游。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六A ➌（3）汉阳陵.mp3', label: '奥利维亚' }],
          // This summary's own pool, printed under it.
          banks: ['a4-3'],
          text:
            '（3）奥利维亚在西安留学的时候，去哪里都骑电动车，因为便宜，而且方便。' +
            '上次她去汉阳陵就是骑电动车去的。①（{{b8}}）也可以坐地铁去，②（{{b9}}）地铁不能直接到景点门口。' +
            '③（{{b10}}）这种偏僻一点的地方她都是骑电动车去。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六A ➌（4）河内.mp3', label: '陈灵' }],
          // This summary's own pool, printed under it.
          banks: ['a4-4'],
          text:
            '（4）陈灵是越南顺化人。去年她从老家坐大巴去了一①（{{b11}}）河内，是可以睡觉的那种。' +
            '陈灵说，大巴上的床很舒服，出发以后一路②（{{b12}}）着③（{{b13}}）着就睡着了。' +
            '她第二天醒来的时候已经④（{{b14}}）到河内了，所以觉得特别方便。',
        },
        {
          kind: 'passage',
          audio: [{ key: 'tblt-hsk4/u06/六A ➌（5）爱宝乐园.mp3', label: '朴书妍' }],
          // This summary's own pool, printed under it.
          banks: ['a4-5'],
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
        b5: { id: 'b5', kind: 'type', answer: '不管', bank: 'a4-2', keyLabel: '2.1' },
        b6: { id: 'b6', kind: 'type', answer: '还是', bank: 'a4-2', keyLabel: '2.2' },
        b7: { id: 'b7', kind: 'type', answer: '趟', bank: 'a4-2', keyLabel: '2.3' },
        b8: { id: 'b8', kind: 'type', answer: '虽然', bank: 'a4-3', keyLabel: '3.1' },
        b9: { id: 'b9', kind: 'type', answer: '但是', bank: 'a4-3', keyLabel: '3.2' },
        b10: { id: 'b10', kind: 'type', answer: '一般', bank: 'a4-3', keyLabel: '3.3' },
        b11: { id: 'b11', kind: 'type', answer: '趟', bank: 'a4-4', keyLabel: '4.1' },
        b12: { id: 'b12', kind: 'type', answer: '摇', bank: 'a4-4', keyLabel: '4.2' },
        b13: { id: 'b13', kind: 'type', answer: '摇', bank: 'a4-4', keyLabel: '4.3' },
        b14: { id: 'b14', kind: 'type', answer: '快', bank: 'a4-4', keyLabel: '4.4' },
        b15: { id: 'b15', kind: 'type', answer: '差不多', bank: 'a4-5', keyLabel: '5.1' },
        b16: { id: 'b16', kind: 'type', answer: '确实', bank: 'a4-5', keyLabel: '5.2' },
        b17: { id: 'b17', kind: 'type', answer: '安心', bank: 'a4-5', keyLabel: '5.3' },
      },
      // One pool per summary, as the booklet prints them: the words are beside the blanks
      // they fill rather than in a single list at the foot of the task, and the student
      // works one summary at a time. 趟 is printed in both (2)'s and (4)'s pool because
      // each summary is answered on its own — which is also why this is not one shared
      // bank: a shared pool would have had to contain 趟 once and reuse it across items.
      //
      // Reuse is on only where the key reuses a word *within* one summary: 随处 twice in
      // (1) and 摇 twice in (4). Elsewhere every word is used once, so `allowReuse: false`
      // lets a used word read as used.
      banks: [
        { id: 'a4-1', items: ['舒服', '随处', '坡路'], allowReuse: true },
        { id: 'a4-2', items: ['不管', '还是', '趟'] },
        { id: 'a4-3', items: ['虽然', '但是', '一般'] },
        { id: 'a4-4', items: ['趟', '摇', '快'], allowReuse: true },
        { id: 'a4-5', items: ['确实', '安心', '差不多'] },
      ],
      // (5) ① is the booklet's own misprint: it prints 要, but the blank sits *before* the
      // printed 要 (路程①（　）要1个小时) and the pool under (5) is 确实、安心、差不多, so the
      // word that goes in the blank is 差不多 — 路程差不多要1个小时. Printing 要 as the answer
      // would read 路程要要1个小时, and would ask for a word the student's own pool does not
      // contain. The key line is corrected here rather than carried verbatim.
      answerKeyRaw:
        '(2) ① 不管；② 还是；③ 趟；(3) ① 虽然；② 但是；③ 一般；(4) ① 趟；② 摇；③ 摇；④ 快；(5) ① 差不多；② 确实；③ 安心。',
    },
  ],
};
