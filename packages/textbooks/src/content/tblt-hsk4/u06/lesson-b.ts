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
      body: [
        {
          kind: 'dataTable',
          id: 't1-trains',
          columns: ['车次和读法', '车型', '路线', '时速'],
          // Each row is marked with the emoji for the kind of train its letter stands for, so
          // the letter-to-type correspondence the instructions point at is visible before the
          // student reads the pool: 高 🚄, 动 and 城 🚅, 直 🚈, 特 and 快 🚃.
          rows: [
            { icon: '🚄', cells: ['G815 “高815”', '{{b1}}', '北京南 → 宁波', '250-350km'] },
            { icon: '🚅', cells: ['D17 “动17”', '{{b2}}', '北京 → 杭州', '160-250km'] },
            { icon: '🚅', cells: ['C2131 “城2131”', '{{b3}}', '北京南 → 天津西', '160-300km'] },
            { icon: '🚈', cells: ['Z281 “直281”', '{{b4}}', '包头 → 杭州', '160km'] },
            { icon: '🚃', cells: ['T109 “特109”', '{{b5}}', '北京 → 上海', '140km'] },
            { icon: '🚃', cells: ['K1275 “快1275”', '{{b6}}', '包头 → 温州', '120km'] },
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
      body: [
        {
          kind: 'dataTable',
          id: 't2-compare',
          columns: ['', '和谐号', '复兴号'],
          rows: [
            { cells: ['行驶速度', '160 - 250km/h', '160 - 350km/h'] },
            { cells: ['制造开始', '2007年', '2015年'] },
            { cells: ['免费Wi-Fi网络', '✗', '✓'] },
            { cells: ['充电口', '✗', '✓'] },
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
      id: 'tblt-hsk4.u06.B.t3',
      number: '➌',
      type: 'reading',
      sourcePage: 8,
      instructions: '比较一下两次列车的不同座位，回答下面的问题。',
      body: [
        {
          // Each table is introduced by its own line, so the train it describes is named
          // beside it rather than in one instruction covering both.
          kind: 'passage',
          text: '北京南站到杭州东站的G41（读“高四十一”）次列车，车程4小时28分。以下是不同座位的价格：',
        },
        {
          // Seat classes and their prices. The bank items below are these exact
          // strings, so a pick can be checked against the table it came from, and the
          // photographs the workbook prints above each class are the column headings:
          // a picture per column, with the class name captioned under it.
          kind: 'dataTable',
          id: 'g41',
          columns: ['G41', '无座', '二等座', '一等座', '商务座'],
          columnImages: [
            '',
            'tblt-hsk4/u06/b3-g41-wuzuo.jpg',
            'tblt-hsk4/u06/b3-g41-erdengzuo.jpg',
            'tblt-hsk4/u06/b3-g41-yidengzuo.jpg',
            'tblt-hsk4/u06/b3-g41-shangwuzuo.jpg',
          ],
          rows: [
            { cells: ['每排座位数', '—', '每排5座', '每排4座', '每排3座'] },
            { cells: ['价格', '673元', '673元', '1076元', '2354元'] },
          ],
        },
        {
          kind: 'passage',
          text: '北京丰台站到杭州站的K1275（读“快一二七五”）次列车，车程21小时1分，有卧铺，适合睡觉。以下是不同座位的价格：',
        },
        {
          kind: 'dataTable',
          id: 'k1275',
          columns: ['K1275', '无座', '硬座', '硬卧', '软卧'],
          columnImages: [
            '',
            'tblt-hsk4/u06/b3-k1275-wuzuo.jpg',
            'tblt-hsk4/u06/b3-k1275-yingzuo.jpg',
            'tblt-hsk4/u06/b3-k1275-yingwo.jpg',
            'tblt-hsk4/u06/b3-k1275-ruanwo.jpg',
          ],
          rows: [{ cells: ['价格', '189.5元', '189.5元', '322.5元', '504.5元'] }],
        },
        {
          kind: 'passage',
          text:
            '① G41的哪种座位最便宜？（{{b1}}）\n\n② G41的哪种座位最舒服？（{{b2}}）\n\n③ K1275的哪两种座位可以睡觉？（{{b3}}）\n\n④ K1275的哪种座位最难受？（{{b4}}）',
        },
      ],
      blanks: {
        // The workbook prints the first answer as the worked example.
        b1: { id: 'b1', kind: 'given', answer: '二等座、无座' },
        b2: { id: 'b2', kind: 'choose', answer: '商务座', bank: 'g41-seats' },
        // Two seats may be picked, in either order. `accept` carries the key's
        // wording, which joins them with 和 rather than the pick separator.
        b3: {
          id: 'b3',
          kind: 'choose',
          answer: '硬卧、软卧',
          accept: ['硬卧和软卧'],
          bank: 'k1275-seats',
          multiple: true,
        },
        b4: { id: 'b4', kind: 'choose', answer: '无座', bank: 'k1275-seats' },
      },
      banks: [
        {
          id: 'g41-seats',
          items: ['无座', '二等座', '一等座', '商务座'],
          // Answered at the blank in a dialog, not from a pool: the classes are printed in the
          // table above, with their photographs, so a second tappable copy below the task only
          // puts the options a screen away from the question.
          choicesInDialog: true,
          // The workbook prints 无座（站着）; the answer is the class alone.
          optionLabels: { 无座: '（站着）' },
          // The class photographs printed above the table, so the student picks the
          // seat they can see. The blank still answers with the class name.
          optionImages: {
            无座: 'tblt-hsk4/u06/b3-g41-wuzuo.jpg',
            二等座: 'tblt-hsk4/u06/b3-g41-erdengzuo.jpg',
            一等座: 'tblt-hsk4/u06/b3-g41-yidengzuo.jpg',
            商务座: 'tblt-hsk4/u06/b3-g41-shangwuzuo.jpg',
          },
        },
        {
          id: 'k1275-seats',
          items: ['无座', '硬座', '硬卧', '软卧'],
          optionLabels: { 无座: '（站着）' },
          choicesInDialog: true,
          optionImages: {
            无座: 'tblt-hsk4/u06/b3-k1275-wuzuo.jpg',
            硬座: 'tblt-hsk4/u06/b3-k1275-yingzuo.jpg',
            硬卧: 'tblt-hsk4/u06/b3-k1275-yingwo.jpg',
            软卧: 'tblt-hsk4/u06/b3-k1275-ruanwo.jpg',
          },
        },
      ],
      answerKeyRaw: '② 商务座；③ 硬卧和软卧；④ 无座。',
    },
    {
      id: 'tblt-hsk4.u06.B.t4',
      number: '➍',
      type: 'reading',
      sourcePage: 9,
      instructions:
        '这个周末，你想从北京坐高铁去杭州玩。参照下面“铁路12306”APP 的截图，回答问题。',
      body: [
        {
          kind: 'mockApp',
          app: 'railway-12306',
          fallbackImage: 'tblt-hsk4/u06/b4-fallback.jpg',
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
        // Three goals match several trains. They are sets, not one answer with
        // alternatives: `accept` would mark a student who picked only one of the four
        // 复兴号 correct.
        b3: { id: 'b3', kind: 'goal', answer: 'G875、G49、D17、D11', multiple: true },
        b4: { id: 'b4', kind: 'goal', answer: 'Z281' },
        b5: { id: 'b5', kind: 'goal', answer: 'G871、G875', multiple: true },
        b6: { id: 'b6', kind: 'goal', answer: 'D17、D11', multiple: true },
      },
      answerKeyRaw: '② K1275; ③ G875、G49、D17、D11; ④ Z281; ⑤ G871、G875; ⑥ D17、D11。',
    },
    {
      id: 'tblt-hsk4.u06.B.t5',
      number: '➎',
      type: 'reading',
      sourcePage: 10,
      instructions:
        '读读下面这一篇社交平台上关于黄金周高铁"抢票"的文章。以下的插图，放在文章中的哪里最合适？在文章插图一～六中填入A~F。',
      // One recording of the whole article, shared with B ➏.
      //
      // The transcript is the article as authored below with ➏'s eleven-word blanks
      // filled back in from their bank — the recording reads the published article, so
      // it says what the workbook's cloze version leaves out. Declared once, here,
      // because ➏ replays this recording and the book indexes transcripts by recording
      // rather than by task.
      audio: [
        {
          key: 'tblt-hsk4/u06/六B ➎ 开票一秒就空了.mp3',
          transcript: [
            { text: '"开票一秒就空了"——国庆抢高铁票抢到哭？' },
            { text: '自己试了试，这几个12306建议的办法真的有用！国庆成功抢到高铁票！' },
            { text: '#黄金周抢票好办法＃国庆抢票' },
            {
              text:
                '9月16日12306开始卖国庆假期高铁票。过去几年不少网友表示，国庆车票比演唱会门票还难抢，' +
                '这件事很快就成了"热搜"。关于抢票难的情况，12306工作人员表示，国庆期间买票比较难，' +
                '所以需要旅客做好准备。',
            },
            {
              text:
                '12306估计，今年国庆假期每天有2.19亿人使用铁路，10月1日人数最多。国庆假期突然很多人' +
                '都要出门，探亲、旅游、学生回家等需要同时出现，让铁路压力很大。虽然铁路部门已想了办法，' +
                '计划发出约1.3万列旅客列车，但还是很难让所有旅客满意。这种情况下，有些路线使用的人比较多，' +
                '车票"秒光"。假期快到了，怎么才能提高抢票成功率呢？给大家以下几个建议，可以试一试。',
            },
            {
              text:
                '1. 记准放票时间。预订车票的最早时间是发车前15天。假期第一日国庆节（10月1日）的车票' +
                '9月17日可以预订，9月16日可以购买国庆前一天（9月30日工作日）的车票。假期最后一天' +
                '（10月8日）的回家的车票会在9月24日开始卖。如果要确定买票的最早时间，可以打开12306' +
                '"我的""起售时间"，输入出发站、随便选个日期就能查。确认了起售时间后就定好闹钟，' +
                '别错过最好的抢票时间。',
            },
            {
              text:
                '2. 提前填好信息。在买票前可通过铁路12306APP提前填好信息，在火车票起售那一天就可以' +
                '快速完成购买。卖票那一天要"快准狠"：提前2分钟进12306，把要订的车次看好，填好个人信息。' +
                '有的网友表示，提前填好了个人信息，时间一到马上下拉更新，确定购买，一分多钟后就成功完成了付款。',
            },
            {
              text:
                '3. 候补买票。如果没有第一时间抢到票也不用担心，可以通过12306APP"候补"功能，提出几个' +
                '不同日期、车次、座位的候补订单，提高成功率。要使用"候补"功能，可以在网页上点击"候补"按钮，' +
                '加到购物车，点"下一步"，然后再加上更多候补车次、座位和日期。',
            },
            {
              text:
                '4. 选择换乘。如果买不到直达的车票，还可选择买换乘车票。另外，可以先买短距离的车票，' +
                '上车后再找车上的乘务员补票。有网友自己试过这种"先上车，后补票"的方式，发现能大大提高成功率，' +
                '只是担心可能会没有位置坐，所以必须做好长时间站着的心理准备。',
            },
            {
              text:
                '5. 买别人退了的票。开车前8天，是退票最多的时候；开车前48小时和24小时，12306会开始卖' +
                '这些退了的车票；一般每天22时到23时也是退票最多的时候；开车前一天平台又会开始卖剩下的票，' +
                '所以旅客可以在以上时间点试试抢票，也许可以成功买到票。另外，很多旅客订了票但一直没有支付，' +
                '这些会在20分钟后自动取消，让其他需要的旅客可以订。所以如果多刷新，也许可以买到这些没有支付的票，' +
                '增加成功率。',
            },
            {
              text:
                '6. 不要选择别的平台买票。最后提醒旅客，只有铁路12306网站和APP才是中国铁路正式的火车票' +
                '网络订票平台。因此，不要使用别的平台买车票。有不少APP或微信小程序说，"多付XX元钱就可以提高' +
                '百分之XX的抢票成功率"。对此，12306服务人员提醒，"这些都是没用的，加再多钱也是一样的，' +
                '不要再多付钱了"。另外，这些订票平台还有个人信息和资金的危险，所以一定要通过铁路12306正式的' +
                '订票平台。',
            },
          ],
        },
      ],
      body: [
        {
          // The article, one block per paragraph group so each tip's illustration
          // slot lands at the end of the tip it belongs to. The article's ①–⑦ text
          // blanks belong to B ➏, so here they are printed as the workbook prints
          // them, with ① and ③ showing their worked-example answers.
          kind: 'passage',
          text:
            '"开票一秒就空了"——国庆抢高铁票抢到哭？' +
            '\n\n自己试了试，这几个12306建议的办法真的有用！国庆成功抢到高铁票！' +
            '\n\n#黄金周抢票好办法＃国庆抢票' +
            '\n\n9月16日12306开始卖国庆假期高铁票。过去几年不少网友表示，国庆车票比演唱会门票还难抢，这件事很快就成了"热搜"。关于抢票难的情况，12306工作人员表示，国庆期间买票比较难，所以需要旅客做好准备。' +
            '\n\n12306估计，今年国庆假期每天有2.19亿人使用铁路，10月1日人数最多。国庆假期突然很多人都要出门，探亲、旅游、学生回家等需要同时出现，让铁路压力很大。虽然铁路部门已想了办法，计划发出约1.3万列旅客列车，但（① A）。这种情况下，有些路线使用的人比较多，车票"秒光"。假期快到了，怎么才能提高抢票成功率呢？给大家以下几个建议，可以试一试。',
        },
        {
          kind: 'passage',
          text:
            '1. 记准放票时间。预订车票的最早时间是发车前15天。假期第一日国庆节（10月1日）的车票9月17日可以预订，9月16日可以购买国庆前一天（9月30日工作日）的车票。假期最后一天（10月8日）的回家的车票会在9月24日开始卖。如果要确定买票的最早时间，可以打开12306"我的""起售时间"，输入出发站、随便选个日期就能查。确认了起售时间后就定好闹钟，（② ）。{{b1}}',
        },
        {
          kind: 'passage',
          text:
            '2. 提前填好信息。在买票前可通过铁路12306APP提前填好信息，在火车票起售那一天就可以快速完成购买。卖票那一天要"快准狠"：提前2分钟进12306，把要订的车次看好，填好个人信息。有的网友表示，提前填好了个人信息，时间一到马上下拉更新，（③确定购买），一分多钟后就成功完成了付款。{{b2}}',
        },
        {
          kind: 'passage',
          text:
            '3. 候补买票。如果没有第一时间抢到票也不用担心，可以通过12306APP"候补"功能，提出几个不同日期、车次、座位的候补订单，提高成功率。要使用"候补"功能，可以（④ ），加到购物车，点"下一步"，然后再加上更多候补车次、座位和日期。{{b3}}',
        },
        {
          kind: 'passage',
          text:
            '4. 选择换乘。如果买不到直达的车票，还可选择买换乘车票。另外，可以先买短距离的车票，上车后再找车上的乘务员补票。有网友自己试过这种"（⑤ ）"的方式，发现能大大提高成功率，只是担心可能会没有位置坐，所以必须做好长时间站着的心理准备。{{b4}}',
        },
        {
          kind: 'passage',
          text:
            '5. 买别人退了的票。开车前8天，是退票最多的时候；开车前48小时和24小时，12306会开始卖这些退了的车票；一般每天22时到23时也是退票最多的时候；开车前一天平台又会开始卖剩下的票，所以旅客可以在以上时间点试试抢票，也许可以成功买到票。另外，很多旅客订了票但一直没有支付，这些会在20分钟后自动取消，让其他需要的旅客可以订。所以如果多刷新，也许（⑥ ），增加成功率。{{b5}}',
        },
        {
          kind: 'passage',
          text:
            '6. 不要选择别的平台买票。最后提醒旅客，只有铁路12306网站和APP才是中国铁路正式的火车票网络订票平台。因此，不要使用别的平台买车票。有不少APP或微信小程序说，"多付XX元钱就可以提高百分之XX的抢票成功率"。对此，12306服务人员提醒，"这些都是没用的，加再多钱也是一样的，不要再多付钱了"。另外，这些订票平台还有个人信息和资金的危险，所以（⑦ ）。{{b6}}',
        },
        {
          kind: 'pictureSet',
          id: 'illustrations',
          items: [
            { letter: 'A', label: '日历和闹钟（记准放票时间）', image: 'tblt-hsk4/u06/b5-illustration-a.jpg' },
            { letter: 'B', label: '换乘（选择换乘）', image: 'tblt-hsk4/u06/b5-illustration-b.jpg' },
            { letter: 'C', label: '乘客信息预填（提前填好信息）', image: 'tblt-hsk4/u06/b5-illustration-c.jpg' },
            { letter: 'D', label: '候补车次表格（候补买票）', image: 'tblt-hsk4/u06/b5-illustration-d.jpg' },
            { letter: 'E', label: '网络诈骗（不要选择别的平台）', image: 'tblt-hsk4/u06/b5-illustration-e.jpg' },
            { letter: 'F', label: '未支付的车票（买别人退了的票）', image: 'tblt-hsk4/u06/b5-illustration-f.jpg' },
          ],
        },
      ],
      blanks: {
        // 插图一 is printed with A as the worked example.
        b1: { id: 'b1', kind: 'given', answer: 'A' },
        b2: { id: 'b2', kind: 'choose', answer: 'C', optionSet: 'illustrations' },
        b3: { id: 'b3', kind: 'choose', answer: 'D', optionSet: 'illustrations' },
        b4: { id: 'b4', kind: 'choose', answer: 'B', optionSet: 'illustrations' },
        b5: { id: 'b5', kind: 'choose', answer: 'F', optionSet: 'illustrations' },
        b6: { id: 'b6', kind: 'choose', answer: 'E', optionSet: 'illustrations' },
      },
      // The key writes these as 插图二 C; … which `parseAnswerKey` reads as index 2.
      answerKeyRaw: '插图二 C；插图三 D；插图四 B；插图五 F；插图六 E。',
    },
    {
      id: 'tblt-hsk4.u06.B.t6',
      number: '➏',
      type: 'reading',
      sourcePage: 12,
      instructions: '文章中①～⑦应该填哪个最合适？如果不确定，可以听听文章的音频。',
      // The same recording as ➎: one article, two tasks.
      audio: [{ key: 'tblt-hsk4/u06/六B ➎ 开票一秒就空了.mp3' }],
      body: [
        {
          kind: 'passage',
          text:
            '"开票一秒就空了"——国庆抢高铁票抢到哭？' +
            '\n\n自己试了试，这几个12306建议的办法真的有用！国庆成功抢到高铁票！' +
            '\n\n#黄金周抢票好办法＃国庆抢票' +
            '\n\n9月16日12306开始卖国庆假期高铁票。过去几年不少网友表示，国庆车票比演唱会门票还难抢，这件事很快就成了"热搜"。关于抢票难的情况，12306工作人员表示，国庆期间买票比较难，所以需要旅客做好准备。' +
            '\n\n12306估计，今年国庆假期每天有2.19亿人使用铁路，10月1日人数最多。国庆假期突然很多人都要出门，探亲、旅游、学生回家等需要同时出现，让铁路压力很大。虽然铁路部门已想了办法，计划发出约1.3万列旅客列车，但（{{b1}}）。这种情况下，有些路线使用的人比较多，车票"秒光"。假期快到了，怎么才能提高抢票成功率呢？给大家以下几个建议，可以试一试。',
        },
        {
          kind: 'passage',
          text:
            '1. 记准放票时间。预订车票的最早时间是发车前15天。假期第一日国庆节（10月1日）的车票9月17日可以预订，9月16日可以购买国庆前一天（9月30日工作日）的车票。假期最后一天（10月8日）的回家的车票会在9月24日开始卖。如果要确定买票的最早时间，可以打开12306"我的""起售时间"，输入出发站、随便选个日期就能查。确认了起售时间后就定好闹钟，（{{b2}}）。',
        },
        {
          kind: 'passage',
          text:
            '2. 提前填好信息。在买票前可通过铁路12306APP提前填好信息，在火车票起售那一天就可以快速完成购买。卖票那一天要"快准狠"：提前2分钟进12306，把要订的车次看好，填好个人信息。有的网友表示，提前填好了个人信息，时间一到马上下拉更新，（{{b3}}），一分多钟后就成功完成了付款。',
        },
        {
          kind: 'passage',
          text:
            '3. 候补买票。如果没有第一时间抢到票也不用担心，可以通过12306APP"候补"功能，提出几个不同日期、车次、座位的候补订单，提高成功率。要使用"候补"功能，可以（{{b4}}），加到购物车，点"下一步"，然后再加上更多候补车次、座位和日期。',
        },
        {
          kind: 'passage',
          text:
            '4. 选择换乘。如果买不到直达的车票，还可选择买换乘车票。另外，可以先买短距离的车票，上车后再找车上的乘务员补票。有网友自己试过这种"（{{b5}}）"的方式，发现能大大提高成功率，只是担心可能会没有位置坐，所以必须做好长时间站着的心理准备。',
        },
        {
          kind: 'passage',
          text:
            '5. 买别人退了的票。开车前8天，是退票最多的时候；开车前48小时和24小时，12306会开始卖这些退了的车票；一般每天22时到23时也是退票最多的时候；开车前一天平台又会开始卖剩下的票，所以旅客可以在以上时间点试试抢票，也许可以成功买到票。另外，很多旅客订了票但一直没有支付，这些会在20分钟后自动取消，让其他需要的旅客可以订。所以如果多刷新，也许（{{b6}}），增加成功率。',
        },
        {
          kind: 'passage',
          text:
            '6. 不要选择别的平台买票。最后提醒旅客，只有铁路12306网站和APP才是中国铁路正式的火车票网络订票平台。因此，不要使用别的平台买车票。有不少APP或微信小程序说，"多付XX元钱就可以提高百分之XX的抢票成功率"。对此，12306服务人员提醒，"这些都是没用的，加再多钱也是一样的，不要再多付钱了"。另外，这些订票平台还有个人信息和资金的危险，所以（{{b7}}）。',
        },
      ],
      blanks: {
        // ① is printed as the worked example.
        b1: { id: 'b1', kind: 'given', answer: 'A' },
        b2: { id: 'b2', kind: 'choose', answer: 'B', bank: 'b6-fill' },
        b3: { id: 'b3', kind: 'choose', answer: 'G', bank: 'b6-fill' },
        b4: { id: 'b4', kind: 'choose', answer: 'F', bank: 'b6-fill' },
        b5: { id: 'b5', kind: 'choose', answer: 'E', bank: 'b6-fill' },
        b6: { id: 'b6', kind: 'choose', answer: 'D', bank: 'b6-fill' },
        b7: { id: 'b7', kind: 'choose', answer: 'C', bank: 'b6-fill' },
      },
      banks: [
        { id: 'b6-fill', items: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], optionLabels: { A: '还是很难让所有旅客满意', B: '别错过最好的抢票时间', C: '一定要通过铁路12306正式的订票平台', D: '可以买到这些没有支付的票', E: '先上车，后补票', F: '在网页上点击"候补"按钮', G: '确定购买' } },
      ],
      answerKeyRaw: '② B；③ G；④ F；⑤ E；⑥ D；⑦ C。',
    },
  ],
};
