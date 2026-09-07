/* ═══ 薯藏 RedVault · Demo（Mock 数据 + 交互） ═══ */
"use strict";

const COV = {
  "美食": ["linear-gradient(135deg,#FFE7CE,#FBCFAB)", "🍝"],
  "健康": ["linear-gradient(135deg,#DDF2E4,#B9E4CE)", "🥗"],
  "穿搭": ["linear-gradient(135deg,#F3E4F7,#DDC2F0)", "🧥"],
  "美妆": ["linear-gradient(135deg,#FDE2E8,#F7C3D2)", "💧"],
  "家居": ["linear-gradient(135deg,#E4ECF7,#C3D4EE)", "🛋"],
  "旅行": ["linear-gradient(135deg,#DFF1F5,#BFE3EC)", "🧭"],
  "学习": ["linear-gradient(135deg,#E6E5FA,#C8C5F2)", "📖"],
  "职场": ["linear-gradient(135deg,#E9E8EF,#CFCCDD)", "💼"],
  "科技": ["linear-gradient(135deg,#E3E9F2,#C4CFDF)", "💾"],
  "理财": ["linear-gradient(135deg,#EAF2E3,#CFE2BA)", "💰"],
  "运动": ["linear-gradient(135deg,#E3F0F9,#C0DCF0)", "🏃"],
};

const NOTES = [
  {
    id: "n1", type: "normal", title: "减脂期一周晚餐备餐：热量缺口这样吃才不饿",
    author: "低卡厨房日记", url: "https://www.xiaohongshu.com/explore/n1",
    published_at: "2026-08-30", collected_at: "2026-09-01", liked: 12483,
    category: "健康", subcategory: "减脂饮食", tags: ["减脂", "备餐", "热量缺口"], h: 1.25,
    summary: "以 TDEE −300kcal 为目标示范一周晚餐备餐：杂粮饭 150g 熟重、每餐蛋白 30g 起（鸡胸/虾/豆腐轮换）、蔬菜不限量先吃。结论：热量缺口不必挨饿，靠大体积蔬菜与足量蛋白稳住饱腹感；适用条件是有冰箱与微波炉的上班族。",
    key_points: [
      "每餐结构：蛋白 30g + 杂粮主食 150g + 蔬菜 200g 以上，先吃菜再吃主食",
      "周日统一备餐 90 分钟：腌肉分装、杂粮饭冷冻、切好的蔬菜三天内吃完",
      "酱汁是隐形炸弹：油醋汁热量不到焙煎芝麻酱的一半",
      "平台期优先加运动量而非继续砍热量，缺口不建议超过 500kcal",
    ],
    ocr: ["图1：备餐盒标注 热量 412kcal / 蛋白 34g / 碳水 38g", "图2：一周采购清单与预算约 ¥180"],
    comments: [
      { text: "照着吃了两周，掉了 1.8kg 而且真的不饿", likes: 2140, author: "momo", replies: [
          { text: "晚餐也这么吃吗？会不会半夜饿醒", likes: 58, author: "niki" },
          { text: "晚餐主食减半再加一拳蔬菜，完全不饿", likes: 240, author: "momo", op: true },
        ] },
      { text: "补充：杂粮饭冷冻后抗性淀粉增加，升糖更友好", likes: 986, author: "营养师范范", replies: [
          { text: "冷冻后需要解冻再加热吗，还是直接蒸", likes: 33, author: "阿花" },
        ] },
      { text: "问一下酱汁是什么牌子", likes: 203, author: "小王" },
    ],
    remark: "下周试做图 2 的采购清单，预算控制在 200 以内。",
    attachments: [{ name: "备餐热量表.pdf", size: "412KB", merged: true }],
  },
  {
    id: "n2", type: "normal", title: "手冲咖啡进阶：粉水比、水温与三段注水",
    author: "豆叔的冲煮笔记", url: "https://www.xiaohongshu.com/explore/n2",
    published_at: "2026-08-22", collected_at: "2026-08-24", liked: 8951,
    category: "美食", subcategory: "咖啡冲煮", tags: ["手冲", "咖啡", "冲煮参数"], h: 1.0,
    summary: "从 1:15 与 1:16 两个粉水比对照讲起：浅烘豆 92°C 三段注水（闷蒸 30s → 补至 60% → 收尾绕圈），深烘降到 88°C 并缩短总时长到 2 分钟。结论：先固定研磨再调比，一次只动一个变量。",
    key_points: [
      "浅烘豆：92°C / 1:15 / 总时长 2'15\"；深烘豆：88°C / 1:14 / 2'00\"",
      "闷蒸水量为粉量 2 倍，出现汉堡状排气说明豆子新鲜",
      "调参顺序：研磨度 → 粉水比 → 水温，一次只改一项",
      "注水绕圈半径恒定，避免冲刷滤纸壁造成通道效应",
    ],
    ocr: ["图1：萃取率与浓度控制图（SCA 金杯区间）"],
    comments: [
      { text: "一次只动一个变量这句是真理，我调了一个月才懂", likes: 1502, author: "拿铁不加糖" },
      { text: "深烘 88 度亲测有效，苦味干净很多", likes: 741, author: "晨晨" },
    ],
    remark: "", attachments: [],
  },
  {
    id: "n3", type: "normal", title: "京都五日：避开人流的寺院与咖啡散步路线",
    author: "散步系旅行家", url: "https://www.xiaohongshu.com/explore/n3",
    published_at: "2026-09-02", collected_at: "2026-09-03", liked: 23610,
    category: "旅行", subcategory: "日本关西", tags: ["京都", "citywalk", "小众路线"], h: 1.4,
    summary: "以「早寺院 + 午咖啡 + 傍晚町屋」为骨架：清晨 7 点的永观堂几乎无人，午后穿插三家独立烘焙店，傍晚走石塀小路避开二年坂人潮。附各段步行时间与巴士换乘方案。",
    key_points: [
      "寺院赶早：永观堂 7:30 入场，游客比清水寺少一个量级",
      "咖啡动线：quinciunques（京大前）→ Weekenders（木屋町）→ 小川咖啡三条本店",
      "石塀小路 17:00 后光线最佳且人流回落，适合收尾",
      "巴士一日券 ¥700，全程步行加巴士可覆盖，不需要打车",
    ],
    ocr: ["图3：手绘路线图，标注五日步行分段与耗时"],
    comments: [
      { text: "石塀小路傍晚真的绝，跟着走一天不踩雷", likes: 3211, author: "kyoto_mai", replies: [
          { text: "请问永观堂银杏几点去人最少", likes: 76, author: "Taka" },
          { text: "工作日早上九点前基本包场，亲测", likes: 412, author: "kyoto_mai", op: true },
        ] },
      { text: "补充：永观堂每周四有坐禅体验需预约", likes: 862, author: "阿叶" },
    ],
    remark: "明年樱花季用这条路线，重点标记永观堂。", attachments: [],
  },
  {
    id: "n4", type: "normal", title: "8 平米出租房灯光改造：¥300 以内的三层光",
    author: "租屋改造手册", url: "https://www.xiaohongshu.com/explore/n4",
    published_at: "2026-07-18", collected_at: "2026-07-20", liked: 15702,
    category: "家居", subcategory: "出租屋改造", tags: ["出租屋", "灯光", "低成本改造"], h: 1.1,
    summary: "用「环境光 + 功能光 + 氛围光」三层结构改造出租屋：顶灯 4000K 做环境光，桌面 5000K 条形灯做功能光，床头 2700K 落地灯做氛围光。全部走插座无需改线，退租可整体带走。",
    key_points: [
      "三层光公式：4000K 环境 + 5000K 功能 + 2700K 氛围，各层独立开关",
      "首选可换泡的落地灯与夹灯，避免吊装破坏天花板",
      "显色指数 Ra≥90，看灯泡包装的 CRI 一行",
      "预算分配：落地灯 129 / 桌面条灯 89 / 灯泡×3 共 72",
    ],
    ocr: ["图2：改造前后对比，同机位同白平衡"],
    comments: [
      { text: "Ra≥90 这个细节太重要，之前的灯把饭菜拍得发绿", likes: 1980, author: "夕颜" },
    ],
    remark: "", attachments: [],
  },
  {
    id: "n5", type: "normal", title: "通勤西装的松弛感：三件套的四种穿法",
    author: "衣柜编辑室", url: "https://www.xiaohongshu.com/explore/n5",
    published_at: "2026-08-28", collected_at: "2026-08-29", liked: 6420,
    category: "穿搭", subcategory: "通勤西装", tags: ["通勤", "西装", "叠穿"], h: 1.5,
    summary: "同一套灰蓝三件套换内搭与鞋包装出四种场景：马甲单穿配乐福鞋的周末版、高领针织配切尔西的秋冬版、oversize 衬衫配帆布鞋的创意行业版。核心是西装选微垫肩单排两粒扣，留出叠穿余量。",
    key_points: [
      "西装买大半码留叠穿余量，袖长以衬衫露出 1cm 为准",
      "马甲单穿利用率最高，配九分裤拉高腰线",
      "鞋决定场合：乐福 → 周末，德比 → 会议，帆布 → 创意行业",
    ],
    ocr: [],
    comments: [
      { text: "买大半码这个建议救了我，之前总是紧绷", likes: 913, author: "林林" },
    ],
    remark: "", attachments: [],
  },
  {
    id: "n6", type: "normal", title: "敏感肌早 C 晚 A 实操：建立耐受的 8 周",
    author: "成分党小葵", url: "https://www.xiaohongshu.com/explore/n6",
    published_at: "2026-08-15", collected_at: "2026-08-16", liked: 18922,
    category: "美妆", subcategory: "成分护肤", tags: ["早C晚A", "敏感肌", "建立耐受"], h: 1.2,
    summary: "敏感肌低浓度起步：VC 选 10% 以下衍生物，A 醛从每周两次短时接触法开始，第 5 周起隔天使用，全程修护霜打底。出现持续泛红立即回退上一阶段。结论：慢就是快，8 周建立耐受比激进用法成功率高得多。",
    key_points: [
      "起步浓度：VC 选 8–10% 衍生物，A 类选 0.05–0.1% A 醛或 HPR",
      "短时接触法：A 类上脸 20 分钟后洗掉，前两周每周仅 2 次",
      "泛红超过 30 分钟就回退到上一阶段",
      "早 C 必须配防晒，否则反黑风险大于收益",
    ],
    ocr: ["图1：8 周耐受建立节奏表"],
    comments: [
      { text: "短时接触法真的适合我这种烂脸体质", likes: 2760, author: "敏感肌十年", replies: [
          { text: "短时是多久？五分钟吗", likes: 91, author: "干皮星人" },
          { text: "我从 10 分钟开始建立耐受，逐步拉长", likes: 305, author: "敏感肌十年", op: true },
        ] },
      { text: "提醒：屏障受损期先修护再上功效", likes: 1520, author: "皮肤科 Dr.Lu" },
    ],
    remark: "第 3 周开始尝试，记录泛红时长。", attachments: [],
  },
];
NOTES.push(
  {
    id: "n7", type: "normal", title: "用间隔重复法三个月背完 6000 词：全部设置",
    author: "学习工具箱", url: "https://www.xiaohongshu.com/explore/n7",
    published_at: "2026-09-01", collected_at: "2026-09-02", liked: 9877,
    category: "学习", subcategory: "记忆方法", tags: ["间隔重复", "Anki", "背单词"], h: 0.95,
    summary: "6000 词拆成 60 组×100，每天 1 组新词，复习按默认调度，三个月完成第一轮。关键设置：新卡上限 100/天、只做认读方向不做拼写、复习优先于新卡。日均投入 35 分钟。",
    key_points: [
      "卡片只做英→中认读，拼写交给阅读自然巩固",
      "新卡 100/天上限，只在状态好的上午开新",
      "连错两次的卡片加助记符字段，不硬背",
      "时间不够时先保复习队列清零，再开新卡",
    ],
    ocr: [],
    comments: [
      { text: "复习优先于新卡，这条救了我的调度", likes: 1103, author: "烤鸭人" },
    ],
    remark: "", attachments: [],
  },
  {
    id: "n8", type: "normal", title: "和领导 1v1 怎么汇报：结构化模板与三个禁忌",
    author: "职场观察员K", url: "https://www.xiaohongshu.com/explore/n8",
    published_at: "2026-08-25", collected_at: "2026-08-26", liked: 14205,
    category: "职场", subcategory: "向上管理", tags: ["汇报", "1v1", "沟通模板"], h: 1.05,
    summary: "1v1 汇报用「结论 → 进展 → 卡点 → 需要支持」四段结构，全程 10 分钟内。卡点必须附带至少一个自己的方案选项，让领导做选择题而非问答题。三个禁忌：报喜不报忧、超时、把 1v1 当吐槽会。",
    key_points: [
      "四段模板：结论 30s / 进展 3min / 卡点 3min / 需要支持 2min",
      "卡点永远带 2 个选项加自己的倾向，附代价说明",
      "数字先行：进展用完成率与日期，不描述过程",
    ],
    ocr: ["图1：四段结构的一页纸模板"],
    comments: [
      { text: "带着选项去汇报之后，领导对我的态度明显变了", likes: 3521, author: "PM阿森", replies: [
          { text: "选项一般准备几个比较合适", likes: 120, author: "实习生小k" },
        ] },
      { text: "补充：纪要 24 小时内发，留痕比说得好更重要", likes: 1688, author: "老陈" },
    ],
    remark: "", attachments: [],
  },
  {
    id: "n9", type: "normal", title: "家庭数据冷备：一套 NAS 加一块离线盘",
    author: "数字仓鼠君", url: "https://www.xiaohongshu.com/explore/n9",
    published_at: "2026-07-30", collected_at: "2026-08-02", liked: 5233,
    category: "科技", subcategory: "家庭服务器", tags: ["NAS", "备份", "数据安全"], h: 1.35,
    summary: "3-2-1 原则的家庭落地：NAS 做热数据与每天自动快照，重要档案约 200GB 每月手动拷到离线硬盘，另有一块 2.5 寸盘放公司做异地副本。勒索与误删场景都可恢复，年成本不到 ¥150。",
    key_points: [
      "热数据：NAS 快照每天自动保留 7 份，误删秒级回滚",
      "冷数据：每月最后一个周末手动同步离线盘，写入后只读",
      "异地副本用 2.5 寸盘放公司抽屉，防家庭级灾难",
      "照片类再加一层按量付费云盘，比包年便宜",
    ],
    ocr: ["图2：目录结构与快照策略截图"],
    comments: [
      { text: "离线盘这条很多人忽略，勒索软件加密不了断电的盘", likes: 2003, author: "运维老张" },
    ],
    remark: "", attachments: [],
  },
  {
    id: "n10", type: "normal", title: "指数基金定投的止盈纪律：目标收益法实操",
    author: "慢富实验室", url: "https://www.xiaohongshu.com/explore/n10",
    published_at: "2026-08-10", collected_at: "2026-08-12", liked: 7410,
    category: "理财", subcategory: "指数基金", tags: ["定投", "止盈", "指数基金"], h: 1.15,
    summary: "宽基指数定投用目标收益法止盈：年化 15% 触发即分批卖出 1/3，落袋部分转入债基；回撤超过 20% 恢复定投并把金额上调 50%。纪律写在开始之前，涨跌时只执行不讨论。",
    key_points: [
      "止盈规则买入前锁定：年化 15% 分批卖 1/3",
      "回撤 20% 以上恢复定投，金额上调 50%",
      "纪律优先于判断，规则写进备忘录",
    ],
    ocr: ["图1：2015–2025 目标收益法回测净值曲线"],
    comments: [
      { text: "止盈后转债基这步很关键，不然钱又手痒进去了", likes: 1355, author: "小熊" },
    ],
    remark: "", attachments: [],
  },
  {
    id: "n11", type: "video", title: "半马破 2 课表复盘：16 周从 2:18 到 1:58",
    author: "跑步教练大白", url: "https://www.xiaohongshu.com/explore/n11",
    published_at: "2026-08-05", collected_at: "2026-08-06", liked: 21003,
    category: "运动", subcategory: "跑步训练", tags: ["半马", "跑步课表", "破二"], h: 1.3,
    summary: "16 周分四阶段：基础期周跑量 35k 堆有氧 → 强化期加 800m×6 间歇 → 专项期马配长距离 → 减量比赛。核心是 80/20 强度分配与每周两次力量课防伤。（视频未转写，内容基于简介与评论）",
    key_points: [
      "80/20：八成轻松跑压心率 150 以下，两成高质量课",
      "长距离每三周加 2k，赛前四周做到 16k 马配连续跑",
      "每周两次下肢力量，伤病率比单纯堆跑量低一半",
    ],
    ocr: [],
    comments: [
      { text: "80/20 亲测有效，配速不降反升", likes: 2870, author: "runner_j" },
      { text: "力量课视频在主页第 3 个，练保加利亚蹲", likes: 1104, author: "跟练的猫" },
    ],
    remark: "", attachments: [],
  },
  {
    id: "s1", type: "synthesis", title: "合成 · 减脂备餐与训练安排",
    sources: ["n1", "n11"], tags: ["减脂", "训练", "合成"], h: 1.18,
    collected_at: "2026-09-04", liked: 0,
    overview: "两篇笔记分别从饮食与训练侧给出减脂期框架：饮食靠热量缺口与高蛋白备餐控制摄入，训练靠 80/20 强度分配保住运动表现。合并后形成吃练一体的周计划骨架。",
    common: [
      "热量缺口控制在 300–500kcal，不靠极端节食（来源 1,2）",
      "蛋白质优先：每餐 30g 起，训练日尤其重要（来源 1,2）",
      "平台期先加运动量再谈砍热量（来源 1）",
    ],
    diff: [
      "来源 1 主张缺口封顶 500kcal；来源 2 训练量提升会自然扩大消耗，叠加时需重算 TDEE",
      "备餐安排在周日集中处理，训练课表周末有长距离课——建议备餐移到周六避免冲突",
    ],
    todo: [
      "按备餐结构写下周清单，蛋白质备双份应对训练日",
      "把 80/20 跑量表贴冰箱，轻松跑日正好安排为备餐日",
      "每两周称重加拍体型照，平台期先加一次力量课",
    ],
  }
);

const INBOX = [
  {
    id: "i1", captured_at: "今天 10:42", status: "pending",
    raw: {
      type: "normal", title: "鸡胸肉的 8 种做法：从腌制到火候全拆解",
      desc: "柴是鸡胸最大的问题。这篇用盐水浸泡（brine）解决：5% 盐水泡 30 分钟保水……煎用中大火每面 2 分钟，静置 5 分钟再切。附 8 种腌制配方与热量对照表。",
      author: "低卡厨房日记", liked_count: 8932, tags: ["鸡胸肉", "备餐", "高蛋白"],
      comments: [{ text: "盐水泡完真的嫩很多", likes: 1200, author: "momo" }, { text: "求热量表原图", likes: 300, author: "cc" }],
      source_url: "https://www.xiaohongshu.com/explore/ix1", cover: "美食",
    },
  },
  {
    id: "i2", captured_at: "今天 09:15", status: "pending",
    raw: {
      type: "video", title: "城市骑行装备清单（新手向）：这 5 件先买",
      desc: "头盔、手套、前后灯、骑行裤、补胎工具，逐个讲为什么以及多少钱能入门。视频对比了三款百元级头盔的佩戴与散热……",
      author: "城市骑行指南", liked_count: 4521, tags: ["骑行", "装备", "新手"],
      comments: [{ text: "前后灯建议直接买 200 档的，亮很多", likes: 800, author: "夜骑人" }],
      source_url: "https://www.xiaohongshu.com/explore/ix2", cover: "运动",
    },
  },
  {
    id: "i3", captured_at: "昨天 22:07", status: "pending",
    raw: {
      type: "normal", title: "读完《纳瓦尔宝典》后我在做的 10 件事",
      desc: "把「特定知识」「杠杆」「长期主义」落到日常：每天一小时深度学习区、把重复工作模板化、用写作积累声誉杠杆……附模板截图。",
      author: "阅读拆解员", liked_count: 15870, tags: ["读书笔记", "认知", "杠杆"],
      comments: [{ text: "特定知识那段解释得比原书清楚", likes: 2400, author: "读者小鹿" }],
      source_url: "https://www.xiaohongshu.com/explore/ix3", cover: "学习",
    },
  },
];

/* ── 工具 ── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtK = (n) => n >= 10000 ? (n / 10000).toFixed(1) + "w" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
const covOf = (n) => (COV[n.category] || [,])[0] || "linear-gradient(135deg,#E8E8EE,#D5D5E2)";
const emojiOf = (n) => n.emoji || (COV[n.category] || [,])[1] || "📝";
/* 楼中楼：高赞回复随父评论一并展示，op = 笔记作者回复 */
const replyHtml = (c) => (c.replies || []).length ? `<div class="c-replies">${c.replies.map((r) => `
          <div class="c-reply"><span class="c-text">${esc(r.text)}</span><span class="c-meta">${r.op ? '<i class="op-tag">作者</i>' : ""}<span class="likes">♥ ${fmtK(r.likes)}</span><span>@${esc(r.author || "匿名")}</span></span></div>`).join("")}</div>` : "";
const STAGES = ["下载图片", "AI 整理", "关联评分", "写入 vault"];
const COST = 0.03;
let SEQ = 100;
const uid = (p) => p + (++SEQ).toString(36) + Date.now().toString(36).slice(-4);
/* ── 全局状态 ── */
const App = {
  view: "library",
  filter: { category: "", subcategory: "", tag: "", q: "", type: "", sort: "collected" },
  selectMode: false,
  selected: new Set(),
  queue: [], // 管线队列 {id,title,stage(0-3),done,failed}
  sessionCost: 0,
};

/* relate 评分（§5.7）：标签 3 分 + 子类 2 + 大类 1 */
function relateOf(note) {
  const others = NOTES.filter((n) => n.id !== note.id && n.type !== undefined);
  const scored = others.map((n) => {
    let s = 0;
    if (note.tags && n.tags) s += 3 * note.tags.filter((t) => n.tags.includes(t)).length;
    if (note.subcategory && n.subcategory === note.subcategory) s += 2;
    if (note.category && n.category === n.category) s += 1;
    return { n, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
  return scored;
}

/* ── Toast ── */
function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  const ico = kind === "ok" ? "✓" : kind === "err" ? "!" : "◆";
  el.innerHTML = `<span class="t-ico">${ico}</span><span>${esc(msg)}</span>`;
  $("#toastRegion").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 260); }, 2600);
}

/* ── 侧栏 ── */
function renderSidebar() {
  const tree = {};
  NOTES.forEach((n) => {
    if (n.type === "synthesis") return;
    (tree[n.category] = tree[n.category] || {})[n.subcategory] = (tree[n.category][n.subcategory] || 0) + 1;
  });
  const f = App.filter;
  $("#catTree").innerHTML = Object.keys(tree).sort().map((cat) => {
    const subs = Object.entries(tree[cat]).map(([sub, c]) =>
      `<li><button data-cat="${esc(cat)}" data-sub="${esc(sub)}" class="${f.category === cat && f.subcategory === sub ? "active" : ""}">${esc(sub)}<span class="cat-count">${c}</span></button></li>`
    ).join("");
    const total = Object.values(tree[cat]).reduce((a, b) => a + b, 0);
    const open = f.category === cat ? " open" : "";
    const active = f.category === cat && !f.subcategory ? " active" : "";
    return `<li class="cat-item${open}">
      <button class="cat-link${active}" data-cat="${esc(cat)}" data-sub="">
        <svg class="cat-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
        ${esc(cat)}<span class="cat-count">${total}</span>
      </button>
      <ul class="cat-sub">${subs}</ul>
    </li>`;
  }).join("");

  const tagCount = {};
  NOTES.forEach((n) => (n.tags || []).forEach((t) => (tagCount[t] = (tagCount[t] || 0) + 1)));
  $("#tagCloud").innerHTML = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([t, c]) => `<button class="tag-pill${f.tag === t ? " active" : ""}" data-tag="${esc(t)}">${esc(t)} ${c}</button>`).join("");

  $("#synCount").textContent = NOTES.filter((n) => n.type === "synthesis").length;
  $("#statInbox").textContent = INBOX.length;
  $("#statNotes").textContent = NOTES.length;
  const badge = $("#inboxBadge");
  badge.hidden = !INBOX.length;
  badge.textContent = INBOX.length;
}

/* ── 卡片 ── */
function noteCard(n, i) {
  const isSyn = n.type === "synthesis";
  const badge = isSyn ? `<span class="cover-badge syn">◆ 合成</span>`
    : n.type === "video" ? `<span class="cover-badge video">视频</span>` : "";
  const h = Math.round(150 * (n.h || 1.2));
  return `<article class="card${isSyn ? " card--syn" : ""}${App.selected.has(n.id) ? " selected" : ""}" data-id="${n.id}" style="animation-delay:${Math.min(i * 40, 360)}ms" tabindex="0" role="button" aria-label="${esc(n.title)}">
    <div class="cover" style="--cov:${covOf(n)};height:${h}px">
      ${badge}<span class="cover-emoji">${isSyn ? "◆" : emojiOf(n)}</span>
      ${n.liked ? `<span class="cover-likes">${fmtK(n.liked)}</span>` : ""}
      <span class="cover-check" aria-hidden="true">✓</span>
    </div>
    <div class="card-body">
      <div class="card-title">${esc(n.title)}</div>
      <div class="card-meta">${esc(isSyn ? "AI 合成" : n.author)}<span class="dot"></span>${esc((n.published_at || n.collected_at || "").slice(5))}</div>
      <div class="card-tags">${(n.tags || []).slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
    </div>
  </article>`;
}

function filteredNotes() {
  const f = App.filter;
  let list = NOTES.slice();
  if (f.category) list = list.filter((n) => n.category === f.category || (n.type === "synthesis" && false));
  if (f.category && f.subcategory) list = list.filter((n) => n.subcategory === f.subcategory);
  if (f.tag) list = list.filter((n) => (n.tags || []).includes(f.tag));
  if (f.type) list = list.filter((n) => n.type === f.type);
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((n) => (n.title + (n.summary || "") + (n.tags || []).join() + (n.author || "")).toLowerCase().includes(q));
  }
  const sorters = {
    collected: (a, b) => (b.collected_at || "").localeCompare(a.collected_at || ""),
    published: (a, b) => (b.published_at || "").localeCompare(a.published_at || ""),
    liked: (a, b) => (b.liked || 0) - (a.liked || 0),
  };
  return list.sort(sorters[f.sort] || sorters.collected);
}

function filterChips() {
  const f = App.filter;
  const chips = [];
  const add = (label, key) => chips.push(`<button class="filter-chip" data-clear="${key}"><b>${esc(label)}</b><span class="x">×</span></button>`);
  if (f.category) add(f.subcategory ? `${f.category} / ${f.subcategory}` : f.category, "cat");
  if (f.tag) add(`# ${f.tag}`, "tag");
  if (f.q) add(`搜索「${f.q}」`, "q");
  if (f.type === "synthesis") add("仅合成笔记", "type");
  return chips.length ? `<div class="filter-row">${chips.join("")}</div>` : "";
}

/* ── 笔记库视图 ── */
function renderLibrary() {
  const list = filteredNotes();
  const sel = App.selectMode && App.selected.size;
  $("#content").innerHTML = `
    <div class="view-head">
      <div><div class="view-title">笔记库</div></div>
      <span class="view-sub">${list.length} 篇 · 全部本地存储</span>
      <div class="view-head-actions">
        <button class="btn ${App.selectMode ? "btn-red" : "btn-ghost"}" id="btnSelectMode">${App.selectMode ? "退出多选" : "多选"}</button>
        <select class="sort-select" id="sortSel" aria-label="排序">
          <option value="collected"${App.filter.sort === "collected" ? " selected" : ""}>按收藏时间</option>
          <option value="published"${App.filter.sort === "published" ? " selected" : ""}>按发帖时间</option>
          <option value="liked"${App.filter.sort === "liked" ? " selected" : ""}>按点赞</option>
        </select>
      </div>
    </div>
    ${filterChips()}
    ${list.length ? `<div class="masonry">${list.map((n, i) => noteCard(n, i)).join("")}</div>`
      : `<div class="empty"><div class="empty-art">🗂</div><h3>没有匹配的笔记</h3><p>换个关键词，或清除左侧筛选条件再试。</p></div>`}
  `;
  $("#sortSel").onchange = (e) => { App.filter.sort = e.target.value; renderLibrary(); };
  $("#content").classList.toggle("selecting", App.selectMode);
  $("#btnSelectMode").onclick = () => {
    App.selectMode = !App.selectMode;
    if (!App.selectMode) App.selected.clear();
    renderLibrary(); updateSelectBar();
  };
  $$(".card", $("#content")).forEach((el) => {
    el.onclick = () => {
      const id = el.dataset.id;
      if (App.selectMode) {
        /* 局部更新，避免整列表重绘导致的抖动 */
        if (App.selected.has(id)) { App.selected.delete(id); el.classList.remove("selected"); }
        else { App.selected.add(id); el.classList.add("selected"); }
        updateSelectBar();
      } else openDetail(id);
    };
    el.onkeydown = (e) => { if (e.key === "Enter") el.click(); };
  });
  $$("[data-clear]").forEach((b) => b.onclick = () => {
    const k = b.dataset.clear;
    if (k === "cat") { App.filter.category = ""; App.filter.subcategory = ""; }
    if (k === "tag") App.filter.tag = "";
    if (k === "q") { App.filter.q = ""; $("#searchInput").value = ""; }
    if (k === "type") App.filter.type = "";
    renderSidebar(); renderLibrary();
  });
}

/* ── 收件箱视图 ── */
function renderInbox() {
  const pend = INBOX.filter((x) => x.status === "pending");
  const cost = (pend.length * COST).toFixed(2);
  $("#content").innerHTML = INBOX.length ? `
    <div class="view-head">
      <div><div class="view-title">收件箱</div></div>
      <span class="view-sub">油猴脚本捕获的原始内容，确认后才消耗 AI 额度</span>
    </div>
    <div class="inbox-stats">
      <div class="inbox-stats-item"><b>${pend.length}</b><span>待处理</span></div>
      <div class="inbox-stats-sep"></div>
      <div class="inbox-stats-item"><b>0</b><span>失败</span></div>
      <span class="inbox-stats-cost">◆ 预估 AI 成本 ¥${cost}</span>
      <div style="display:flex;gap:8px;margin-left:10px">
        <button class="btn btn-ai" id="btnConfirmAll" ${pend.length ? "" : "disabled"}>确认处理 ${pend.length} 条</button>
        <button class="btn btn-ghost" id="btnClearInbox" ${pend.length ? "" : "disabled"}>清空待处理</button>
      </div>
    </div>
    <div class="inbox-list">${INBOX.map((it, i) => inboxCard(it, i)).join("")}</div>
  ` : emptyInbox();

  if (pend.length) {
    $("#btnConfirmAll").onclick = () => confirmItems(INBOX.filter((x) => x.status === "pending").map((x) => x.id));
    $("#btnClearInbox").onclick = () => {
      INBOX.length = 0;
      renderInbox(); renderSidebar();
      toast("已清空待处理条目", "info");
    };
  }
  $$(".inbox-card").forEach((el) => {
    el.onclick = (e) => { if (e.target.closest(".mini-btn")) return; openPreview(el.dataset.id); };
    el.onkeydown = (e) => { if (e.key === "Enter") openPreview(el.dataset.id); };
  });
  $$(".mini-btn[data-act]").forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const id = b.closest(".inbox-card").dataset.id;
    if (b.dataset.act === "confirm") confirmItems([id]);
    if (b.dataset.act === "del") {
      const idx = INBOX.findIndex((x) => x.id === id);
      INBOX.splice(idx, 1);
      renderInbox(); renderSidebar();
      toast("已从收件箱删除");
    }
  });
}

function inboxCard(it, i) {
  const r = it.raw;
  const stMap = { pending: ["待处理", ""], processing: ["处理中", "proc"], done: ["已入库", "ok"], failed: ["失败", "fail"] };
  const [stTxt, stCls] = stMap[it.status] || stMap.pending;
  const cov = COV[r.cover] || COV["学习"];
  return `<div class="inbox-card" data-id="${it.id}" style="animation-delay:${i * 60}ms" tabindex="0" role="button">
    <div class="inbox-card-top">
      <div class="cover inbox-thumb" style="--cov:${cov[0]}"><span class="cover-emoji" style="font-size:24px">${cov[1]}</span></div>
      <div style="min-width:0;flex:1">
        <h4>${r.type === "video" ? `<span class="cover-badge video" style="position:static;margin-right:6px">视频</span>` : ""}${esc(r.title)}</h4>
        <div class="inbox-card-meta">@${esc(r.author)}<span class="dot"></span>♥ ${fmtK(r.liked_count)}<span class="dot"></span>${it.captured_at} 捕获</div>
      </div>
    </div>
    <div class="inbox-card-desc">${esc(r.desc.slice(0, 90))}${r.desc.length > 90 ? "…" : ""}</div>
    <div class="inbox-card-foot">
      <span class="inbox-state ${stCls}"><span class="st-dot"></span>${stTxt}</span>
      <span style="color:var(--ink3);font-size:11px">${(r.comments || []).length} 条评论</span>
      <div class="mini-actions">
        ${it.status === "pending" ? `<button class="mini-btn ai" data-act="confirm">确认</button>` : ""}
        <button class="mini-btn danger" data-act="del">删除</button>
      </div>
    </div>
  </div>`;
}

function emptyInbox() {
  return `<div class="view-head"><div><div class="view-title">收件箱</div></div><span class="view-sub">待处理内容会出现在这里</span></div>
  <div class="empty">
    <div class="empty-art">📥</div>
    <h3>收件箱是空的</h3>
    <p>在小红书浏览时，油猴脚本会自动捕获帖子到收件箱——你确认后才会调用 AI 整理，不浪费一分钱额度。</p>
    <div class="empty-steps">
      <div class="empty-step"><span class="n">1</span><h5>安装 Tampermonkey</h5><p>浏览器扩展商店搜索安装，Edge 与 Chrome 均可。</p></div>
      <div class="empty-step"><span class="n">2</span><h5>安装薯藏捕获脚本</h5><p>设置页「脚本安装指引」里复制，新建用户脚本粘贴。</p></div>
      <div class="empty-step"><span class="n">3</span><h5>正常刷小红书</h5><p>右下角面板显示捕获进度，服务地址 <code>127.0.0.1:3789</code>。</p></div>
    </div>
  </div>`;
}
/* ── 详情抽屉 ── */
function openDetail(id) {
  const n = NOTES.find((x) => x.id === id);
  if (!n) return;
  const isSyn = n.type === "synthesis";
  const rel = isSyn ? [] : relateOf(n);
  const srcs = isSyn ? (n.sources || []).map((sid) => NOTES.find((x) => x.id === sid)).filter(Boolean) : [];

  $("#drawerDetail").innerHTML = `
    <div class="drawer-topbar">
      <span class="crumb">${isSyn ? "AI 合成笔记" : n.category + " / " + n.subcategory}</span>
      <span class="spacer"></span>
      <button class="mini-btn" id="btnReprocess" title="重跑 AI 打标与排版">↺ 重新打标</button>
      <button class="mini-btn danger" id="btnDelNote">删除</button>
      <button class="close-x" data-close title="关闭 (Esc)">×</button>
    </div>
    <div class="drawer-scroll">
      <div class="detail-hero cover" style="--cov:${isSyn ? "#17171B" : covOf(n)}">
        <span class="cover-emoji"${isSyn ? ' style="color:#fff"' : ""}>${isSyn ? "◆" : emojiOf(n)}</span>
        ${isSyn ? `<span class="cover-badge syn">◆ AI 合成</span>` : n.type === "video" ? `<span class="cover-badge video">视频笔记</span>` : ""}
      </div>
      <div class="detail-head">
        <h2>${esc(n.title)}</h2>
        <div class="detail-meta">
          ${isSyn ? `<span>AI 生成于 ${esc(n.collected_at)}</span>` : `
            <span>@${esc(n.author)}</span><span class="dot"></span>
            <span>发布 ${esc(n.published_at)}</span><span class="dot"></span>
            <span>♥ ${fmtK(n.liked)}</span>
            <a class="src-btn" href="${esc(n.url)}" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              溯源原帖</a>`}
        </div>
        <div class="detail-chips">
          ${isSyn ? `<span class="chip-cat cat">◆ AI 合成</span>` : `
            <span class="chip-cat cat editable" title="点击修改分类">${esc(n.category)} / ${esc(n.subcategory)}</span>
            ${(n.tags || []).map((t) => `<span class="chip-cat editable" title="点击修改标签">${esc(t)}</span>`).join("")}`}
        </div>
      </div>
      <div class="detail-body">
        ${isSyn ? synSections(n, srcs) : normalSections(n)}
        ${rel.length ? `<div class="sec"><div class="sec-head"><h4>🔗 相关笔记</h4><span style="font-size:11px;color:var(--ink3)">relate 评分 Top ${rel.length}</span></div>
          <div class="rel-row">${rel.map((r) => relCard(r.n)).join("")}</div></div>` : ""}
        ${!isSyn ? attachSection(n) : ""}
        <div class="sec sec--note"><div class="sec-head"><h4>✏️ 我的备注</h4><span style="font-size:11px;color:var(--ink3)">仅写入本地 vault · 自动保存</span></div>
          <textarea id="remarkArea" placeholder="写点想法…（保存进 Markdown 的「我的备注」区块）">${esc(n.remark || "")}</textarea>
        </div>
      </div>
    </div>`;

  const ov = $("#overlayDetail");
  ov.hidden = false;
  document.body.style.overflow = "hidden";

  let t;
  $("#remarkArea").oninput = (e) => {
    n.remark = e.target.value;
    clearTimeout(t);
    t = setTimeout(() => toast("备注已保存到 vault"), 700);
  };
  $("#btnReprocess").onclick = () => {
    toast("已重新提交 AI 打标（演示）", "info");
  };
  $("#btnDelNote").onclick = () => {
    NOTES.splice(NOTES.findIndex((x) => x.id === id), 1);
    closeDetail(); renderSidebar();
    App.view === "library" && renderLibrary();
    toast("笔记已删除，孤立附件已清理");
  };
  $$(".rel-card", $("#drawerDetail")).forEach((c) => c.onclick = () => openDetail(c.dataset.id));
  $$(".src-item", $("#drawerDetail")).forEach((c) => c.onclick = () => { closeDetail(); setTimeout(() => openDetail(c.dataset.id), 120); });
  $$("[data-merge]", $("#drawerDetail")).forEach((b) => b.onclick = () => {
    const a = n.attachments[+b.dataset.merge];
    a.merged = true;
    toast("附件要点已合并进「补充材料」区块");
    openDetail(id);
  });
  $$("[data-rmatt]", $("#drawerDetail")).forEach((b) => b.onclick = () => {
    n.attachments.splice(+b.dataset.rmatt, 1);
    toast("附件及其区块已移除", "info");
    openDetail(id);
  });
  $$(".chip-cat.editable", $("#drawerDetail")).forEach((c) => c.onclick = () => toast("行内编辑（演示）：保存后仅替换该区块", "info"));
  $("#attDrop") && ($("#attDrop").onclick = () => {
    (n.attachments = n.attachments || []).push({ name: "截图 2026-09-07.png", size: "268KB", merged: false });
    toast("已上传 1 个附件");
    openDetail(id);
  });
}

function li(items) { return items.map((x) => `<li>${esc(x)}</li>`).join(""); }

function normalSections(n) {
  return `
    <div class="sec sec--ai"><div class="sec-head"><h4>🧠 AI 摘要</h4></div>
      <p class="sec-quote">${esc(n.summary)}</p></div>
    <div class="sec sec--ai"><div class="sec-head"><h4>🔑 关键要点</h4></div><ul>${li(n.key_points)}</ul></div>
    <div class="sec sec--gray"><div class="sec-head"><h4>📄 原帖正文</h4><span style="font-size:11px;color:var(--ink3)">原文保留 · 不改写</span></div>
      <p>${esc(n.bodyText || n.summary.slice(0, 60) + "……")}</p>
      <p style="margin-top:8px;color:var(--ink3);font-size:12px">完整正文与 ${Math.max(2, (n.ocr || []).length + 2)} 张图片已存入 attachments/，图片位置以 ![图N]() 内联于 Markdown 原文。</p></div>
    ${(n.ocr || []).length ? `<div class="sec"><div class="sec-head"><h4>🖼 图片文字识别</h4><span style="font-size:11px;color:var(--ink3)">视觉模型 OCR</span></div>
      <ul>${li(n.ocr)}</ul></div>` : ""}
    ${(n.comments || []).length ? `<div class="sec"><div class="sec-head"><h4>💬 评论精选</h4></div>
      <div style="display:flex;flex-direction:column;gap:8px">${n.comments.map((c) => `
        <div class="comment-item"><span class="c-text">「${esc(c.text)}」</span>
        <span class="c-meta"><span class="likes">♥ ${fmtK(c.likes)}</span><span>@${esc(c.author || "匿名")}</span></span>${replyHtml(c)}</div>`).join("")}</div></div>` : ""}`;
}

function synSections(n, srcs) {
  return `
    <div class="sec sec--ai"><div class="sec-head"><h4>🧭 主题概述</h4></div><p class="sec-quote">${esc(n.overview)}</p></div>
    <div class="sec sec--ai"><div class="sec-head"><h4>🟢 共同要点</h4></div><ul>${li(n.common)}</ul></div>
    <div class="sec"><div class="sec-head"><h4>🟡 分歧与互补观点</h4></div><ul>${li(n.diff)}</ul></div>
    <div class="sec"><div class="sec-head"><h4>✅ 可执行清单</h4></div><ul>${li(n.todo)}</ul></div>
    <div class="sec"><div class="sec-head"><h4>📚 来源</h4><span style="font-size:11px;color:var(--ink3)">点击跳转原笔记</span></div>
      <div class="src-list">${srcs.map((s, i) => `
        <div class="src-item" data-id="${s.id}" role="button" tabindex="0"><span class="n">${i + 1}</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title)}</span>
          <span class="s-arrow">→</span></div>`).join("")}</div></div>`;
}

function relCard(n) {
  return `<div class="rel-card" data-id="${n.id}" role="button" tabindex="0">
    <div class="cover" style="--cov:${covOf(n)}"><span class="cover-emoji">${n.type === "synthesis" ? "◆" : emojiOf(n)}</span></div>
    <div class="rc-title">${esc(n.title)}</div></div>`;
}

function attachSection(n) {
  const atts = n.attachments || [];
  return `<div class="sec"><div class="sec-head"><h4>📎 补充材料</h4><span style="font-size:11px;color:var(--ink3)">PDF / 图片 / 文本 → AI 合并要点</span></div>
    <div class="att-drop" id="attDrop" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      拖拽文件到此处，或点击上传（md / pdf / jpg ≤ 20MB）
    </div>
    ${atts.length ? `<div class="att-list">${atts.map((a, i) => `
      <div class="att-item"><span class="att-ico">📄</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span>
        <span class="att-meta">${esc(a.size)}</span>
        ${a.merged ? `<span style="font-size:10.5px;color:var(--ok)">已合并</span>` : `<button class="mini-btn ai" data-merge="${i}">◆ AI 合并</button>`}
        <div class="mini-actions"><button class="mini-btn danger" data-rmatt="${i}">移除</button></div>
      </div>`).join("")}</div>` : ""}</div>`;
}

function closeDetail() {
  $("#overlayDetail").hidden = true;
  document.body.style.overflow = "";
}

/* ── 收件箱预览 ── */
function openPreview(id) {
  const it = INBOX.find((x) => x.id === id);
  const r = it.raw;
  const cov = COV[r.cover] || COV["学习"];
  $("#modalBox").innerHTML = `
    <div class="modal-head"><h3>捕获预览</h3><span style="font-size:11px;color:var(--ink3)">POST /api/capture · ${it.captured_at}</span><button class="close-x" data-close>×</button></div>
    <div class="modal-body">
      <div style="display:flex;gap:14px;margin-bottom:14px">
        <div class="cover" style="--cov:${cov[0]};width:96px;height:96px;border-radius:12px;flex-shrink:0"><span class="cover-emoji" style="font-size:34px">${cov[1]}</span></div>
        <div><h4 style="font-size:15px;font-weight:600;line-height:1.45">${r.type === "video" ? `<span class="cover-badge video" style="position:static;margin-right:6px">视频</span>` : ""}${esc(r.title)}</h4>
        <div class="inbox-card-meta" style="margin-top:6px">@${esc(r.author)}<span class="dot"></span>♥ ${fmtK(r.liked_count)}<span class="dot"></span>${(r.tags || []).map((t) => "#" + esc(t)).join(" ")}</div></div>
      </div>
      <div class="sec sec--gray" style="margin-bottom:12px"><div class="sec-head"><h4>正文全文</h4></div><p>${esc(r.desc)}</p>
        <p style="margin-top:8px;font-size:12px;color:var(--ink3)">共 3 张图片将下载原图并压缩至 attachments/。</p></div>
      <div class="sec"><div class="sec-head"><h4>评论 ${(r.comments || []).length} 条</h4></div>
        <div style="display:flex;flex-direction:column;gap:8px">${(r.comments || []).map((c) => `
          <div class="comment-item"><span class="c-text">「${esc(c.text)}」</span><span class="c-meta"><span class="likes">♥ ${fmtK(c.likes)}</span></span>${replyHtml(c)}</div>`).join("") || "<p>未抓取到评论</p></div></div>"}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="pvDel">删除</button>
      <button class="btn btn-ai" id="pvConfirm">◆ 确认并 AI 整理 · ≈¥${COST.toFixed(2)}</button>
    </div>`;
  $("#overlayModal").hidden = false;
  $("#pvConfirm").onclick = () => { closeModal(); confirmItems([id]); };
  $("#pvDel").onclick = () => {
    INBOX.splice(INBOX.findIndex((x) => x.id === id), 1);
    closeModal(); renderInbox(); renderSidebar(); toast("已删除");
  };
}
function closeModal() { $("#overlayModal").hidden = true; $("#modalBox").innerHTML = ""; }
/* ── AI 处理管线（模拟 §5.5 状态机） ── */
function confirmItems(ids) {
  const items = INBOX.filter((x) => ids.includes(x.id) && x.status === "pending");
  items.forEach((it) => {
    it.status = "processing";
    App.queue.push({ id: it.id, raw: it.raw, stage: 0, failed: false });
  });
  items.forEach((it) => INBOX.splice(INBOX.indexOf(it), 1));
  if (items.length) {
    toast(`已提交 ${items.length} 条进入 AI 管线`, "info");
    if (App.view === "inbox") renderInbox();
    renderSidebar();
    if (!PIPE.timer) runPipeline();
  }
}

const PIPE = { timer: null };

function runPipeline() {
  PIPE.timer = setInterval(() => {
    const cur = App.queue.find((q) => !q.failed && q.stage < STAGES.length);
    if (!cur) {
      const allDone = App.queue.every((q) => q.stage >= STAGES.length);
      if (allDone) {
        clearInterval(PIPE.timer); PIPE.timer = null;
        $("#pipelineLabel").textContent = "处理完成";
        $("#pipelineCount").textContent = `${App.queue.length}/${App.queue.length}`;
        setTimeout(() => { App.queue = []; hidePipeline(); }, 1600);
      }
      return;
    }
    cur.stage++;
    App.sessionCost += COST;
    if (cur.stage >= STAGES.length) finishNote(cur);
    renderPipeline();
  }, 1400);
}

function finishNote(q) {
  const r = q.raw;
  const SUBMAP = { "美食": "家常菜谱", "运动": "装备入门", "学习": "读书笔记" };
  const note = {
    id: uid("n"), type: r.type, title: r.title, author: r.author, url: r.source_url,
    published_at: "2026-09-07", collected_at: "2026-09-07", liked: r.liked_count || 0,
    category: r.cover || "其他", subcategory: SUBMAP[r.cover] || "收藏整理", tags: r.tags || [], h: 1.1 + Math.random() * 0.4,
    summary: "AI 已完成摘要与两级打标（演示数据）：本条由收件箱确认后自动生成，视觉模型完成了 OCR 与要点提取，原文与图片已落盘 vault。",
    key_points: [
      "AI 整理完成：摘要、两级分类、标签、评论洞察已写入 frontmatter",
      "原文不可变：AI 内容与原帖正文严格分区",
    ],
    ocr: [], comments: r.comments || [], remark: "", attachments: [],
  };
  NOTES.unshift(note);
  renderSidebar();
  if (App.view === "library") renderLibrary();
  toast(`《${r.title.slice(0, 14)}…》已入库`);
}

function renderPipeline() {
  const bar = $("#pipelineBar");
  const active = App.queue.length > 0;
  bar.hidden = !active;
  if (!active) return;
  const total = App.queue.length;
  const done = App.queue.filter((q) => q.stage >= STAGES.length).length;
  $("#pipelineLabel").textContent = done >= total && total ? "处理完成" : "AI 处理中";
  $("#pipelineCount").textContent = `${done}/${total}`;
  $("#pipelinePanel").innerHTML = App.queue.map((q) => {
    const st = Math.min(q.stage, STAGES.length);
    return `<div class="pl-item">
      <span class="pl-title">${esc(q.raw.title)}</span>
      <span class="pl-stage">${STAGES.map((s, i) => `<i class="${i < st ? (q.stage >= STAGES.length ? "ok" : "on") : ""}" title="${s}"></i>`).join("")}</span>
      <span style="font-size:11px;color:${q.stage >= STAGES.length ? "var(--ok)" : "var(--red)"};min-width:52px;text-align:right">${q.stage >= STAGES.length ? "完成 ✓" : STAGES[st]}</span>
    </div>`;
  }).join("");
}
function hidePipeline() { if (!App.queue.length) { $("#pipelineBar").hidden = true; $("#pipelineBar").classList.remove("open"); $("#pipelinePanel").hidden = true; } }

/* ── 多选浮栏 & 合成 ── */
function updateSelectBar() {
  const bar = $("#selectBar");
  bar.hidden = !(App.selectMode && App.selected.size > 0);
  $("#selectCount").textContent = App.selected.size;
  $("#selectCost").textContent = `≈ ¥${(App.selected.size * 0.015 + 0.02).toFixed(2)}`;
}

function openSynthesize() {
  const sel = [...App.selected].map((id) => NOTES.find((n) => n.id === id)).filter(Boolean);
  if (sel.length < 2) { toast("请至少选择 2 篇笔记", "err"); return; }
  $("#modalBox").innerHTML = `
    <div class="modal-head"><h3><span class="ai-grad-text">◆ AI 主题合成</span></h3><button class="close-x" data-close>×</button></div>
    <div class="modal-body">
      <div class="field" style="font-size:12px;color:var(--ink2)">从 ${sel.length} 篇笔记提炼共同要点、分歧观点与可执行清单，生成一篇可继续编辑的合成笔记。</div>
      <div class="syn-list">${sel.map((n, i) => `
        <div class="syn-item" data-id="${n.id}"><span class="n" style="width:18px;height:18px;border-radius:4px;background:var(--ink-strong);color:#fff;display:grid;place-items:center;font-size:10.5px;font-weight:700;flex-shrink:0">${i + 1}</span>
          <span class="t">${esc(n.title)}</span><span class="cat">${esc(n.category || "AI 合成")}</span>
          <button class="mini-btn danger" data-rm="${n.id}">×</button></div>`).join("")}</div>
      <div class="field"><label>主题（可选，留空由 AI 提炼）</label>
        <input type="text" id="synTheme" placeholder="例如：减脂期的一周安排"></div>
      <div class="cost-line"><span>◆</span>上下文约 ${(sel.length * 1.2).toFixed(1)}k 字 · 预估成本 <b>¥${(sel.length * 0.015 + 0.02).toFixed(2)}</b> · 本会话累计 ¥${App.sessionCost.toFixed(2)}</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>取消</button>
      <button class="btn btn-ai" id="synGo">◆ 开始生成</button>
    </div>`;
  $("#overlayModal").hidden = false;

  $$("[data-rm]").forEach((b) => b.onclick = () => {
    App.selected.delete(b.dataset.rm);
    closeModal(); updateSelectBar();
    if (App.selected.size >= 2) openSynthesize();
    else toast("至少保留 2 篇", "err");
  });
  $("#synGo").onclick = () => runSynthesize(sel);
}

function runSynthesize(sel) {
  const theme = ($("#synTheme").value || "").trim();
  const steps = ["组装上下文（frontmatter + 摘要 + 要点）", "AI 生成合成正文（P4）", "写入 vault 并更新互链"];
  $("#modalBox").querySelector(".modal-body").innerHTML = `
    <div class="gen-progress">
      <div style="font-size:13px;font-weight:600;margin-bottom:2px">${esc(theme || "AI 正在合成主题笔记…")}</div>
      <div style="font-size:11.5px;color:var(--ink3);margin-bottom:12px">${sel.length} 篇来源 · ${esc(sel.map((s) => (s.category || "合成")).join(" / "))}</div>
      <div class="gen-bar"><i id="genBar"></i></div>
      <div class="gen-steps" style="margin-top:14px">${steps.map((s, i) => `
        <div class="gen-step" data-step="${i}"><span class="g-dot">✓</span>${esc(s)}</div>`).join("")}</div>
    </div>`;
  $("#modalBox").querySelector(".modal-foot").innerHTML = `<button class="btn btn-ghost" disabled>生成中…</button>`;
  const stepEls = $$("[data-step]");
  let i = 0;
  const tick = () => {
    if (i > 0) { stepEls[i - 1].classList.remove("doing"); stepEls[i - 1].classList.add("done"); }
    if (i < steps.length) {
      stepEls[i].classList.add("doing");
      $("#genBar").style.width = ((i + 1) / steps.length * 100) + "%";
      i++; setTimeout(tick, 1000);
    } else {
      const syn = buildSynNote(sel, theme);
      NOTES.unshift(syn);
      App.sessionCost += 0.02 + sel.length * 0.015;
      closeModal();
      exitSelectMode();
      renderSidebar();
      if (App.view === "library") renderLibrary();
      toast("合成笔记已生成并入库");
      setTimeout(() => openDetail(syn.id), 250);
    }
  };
  tick();
}

function buildSynNote(sel, theme) {
  const titles = sel.map((s) => s.title);
  const srcIdx = (i) => `（来源 ${i + 1}）`;
  return {
    id: uid("syn"), type: "synthesis",
    title: "合成 · " + (theme || sel[0].category && `「${sel[0].category}」主题整理` || "跨主题整理"),
    sources: sel.map((s) => s.id), tags: ["AI合成", ...(theme ? [theme.slice(0, 6)] : [])], h: 1.2,
    collected_at: "2026-09-07", liked: 0,
    overview: `本篇由 ${sel.length} 篇笔记合成：${titles.map((t, i) => `来源 ${i + 1}《${t.slice(0, 12)}…》`).join("、")}。AI 提炼了共同的实践框架、互补的分工建议与可直接执行的行动清单。`,
    common: sel.map((s, i) => (s.key_points ? s.key_points[0] : s.title) + srcIdx(i)).slice(0, 4),
    diff: [
      `来源笔记的方法各有侧重：${titles[0] ? "第 1 篇" : ""}强调结构化执行${srcIdx(0)}，其余篇目补充了不同场景的变式做法`,
      "合成结论：先按第一篇框架执行两周，再按其余篇目按需微调",
    ],
    todo: [
      "把共同要点抄进周计划，标注来源笔记",
      "分歧点单独开一张卡片，实践后回填结论",
      "一个月后把实践结果作为新笔记，再次参与合成",
    ],
  };
}

function exitSelectMode() {
  App.selectMode = false;
  App.selected.clear();
  updateSelectBar();
  if (App.view === "library") renderLibrary();
}

/* ── 设置 ── */
function openSettings() {
  $("#modalBox").innerHTML = `
    <div class="modal-head"><h3>设置</h3><button class="close-x" data-close>×</button></div>
    <div class="modal-body">
      <div class="slot-card"><div class="slot-head"><span class="tag">文本模型</span><span class="tag ok-tag" data-ok="text" hidden>连通 0ms</span>
        <button class="test-btn" data-test="text">测试连接</button></div>
        <div class="slot-grid">
          <div class="field w2"><label>Base URL</label><input type="text" value="https://api.example.com/v1"></div>
          <div class="field"><label>API Key</label><input type="text" value="sk-***abc"></div>
          <div class="field"><label>模型</label><input type="text" value="gpt-4o-mini"></div>
        </div></div>
      <div class="slot-card"><div class="slot-head"><span class="tag">视觉模型（兼任 OCR）</span><span class="tag ok-tag" data-ok="vision" hidden>连通 0ms</span>
        <button class="test-btn" data-test="vision">测试连接</button></div>
        <div class="slot-grid">
          <div class="field w2"><label>Base URL</label><input type="text" value="https://open.bigmodel.cn/api/paas/v4"></div>
          <div class="field"><label>API Key</label><input type="text" value="sk-***f2d"></div>
          <div class="field"><label>模型</label><input type="text" value="glm-4v-plus"></div>
        </div></div>
      <div class="kv-row"><span class="k">评论抓取条数</span><span class="v"><span class="seg" id="segComment"><button data-v="10">10</button><button data-v="20" class="on">20</button><button data-v="50">50</button></span></span></div>
      <div class="kv-row"><span class="k">上报令牌</span><span class="v"><code>X-Capture-Token: rv_9f3k…e21</code><button class="link-btn" id="btnToken">重置</button></span></div>
      <div class="kv-row"><span class="k">vault 路径</span><span class="v"><code>~/RedVault/vault</code><span style="font-size:11px;color:var(--ok)">✓ 存在 · 132 个文件</span></span></div>
      <div class="kv-row"><span class="k">脚本安装</span><span class="v"><button class="link-btn" id="btnGuide">查看油猴脚本安装指引 →</button></span></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>取消</button><button class="btn btn-red" id="btnSaveSettings">保存设置</button></div>`;
  $("#overlayModal").hidden = false;
  $$("#segComment button").forEach((b) => b.onclick = () => { $$("#segComment button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); });
  $$("[data-test]").forEach((b) => b.onclick = () => {
    b.disabled = true; b.textContent = "测试中…";
    setTimeout(() => {
      const ms = 380 + Math.floor(Math.random() * 500);
      b.disabled = false; b.textContent = "测试连接";
      const ok = $(`[data-ok="${b.dataset.test}"]`);
      ok.hidden = false; ok.textContent = `连通 ${ms}ms`;
    }, 900);
  });
  $("#btnToken").onclick = () => toast("令牌已重置，请更新油猴脚本", "info");
  $("#btnGuide").onclick = () => toast("安装指引：复制脚本 → Tampermonkey 新建 → 粘贴保存", "info");
  $("#btnSaveSettings").onclick = () => { closeModal(); toast("设置已保存到 data/config.json"); };
}

/* ── 路由 & 事件 ── */
function route() {
  const h = location.hash || "#/library";
  const [path, qs] = h.slice(2).split("?");
  App.view = path === "inbox" ? "inbox" : "library";
  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === App.view));
  if (App.view === "library") {
    if (qs) {
      const p = new URLSearchParams(qs);
      App.filter.category = p.get("category") || "";
      App.filter.subcategory = p.get("subcategory") || "";
      App.filter.tag = p.get("tag") || "";
      App.filter.type = p.get("type") || "";
    }
    renderLibrary();
  } else renderInbox();
  renderSidebar();
}

function init() {
  window.addEventListener("hashchange", route);

  $("#btnSettings").onclick = openSettings;
  /* ── 导出：当前库全部笔记 → 单文件 Markdown 合集（真实下载，每篇独立区块，互不覆盖） ── */
  const mdComment = (c) => "- 「" + c.text + "」—— 赞 " + c.likes + " @" + (c.author || "匿名") +
    (c.replies || []).map((r) => "\n  - ↳ " + (r.op ? "**[作者]** " : "") + r.text + " —— 赞 " + r.likes + " @" + (r.author || "匿名")).join("");
  const noteToMd = (n) => n.type === "synthesis"
    ? `---\ntitle: ${n.title}\nnote_id: ${n.id}\ntype: synthesis\ntags: [${(n.tags || []).join(", ")}]\nsources: [${(n.sources || []).join(", ")}]\ncollected_at: ${n.collected_at || ""}\n---\n\n## 🧭 主题概述\n${n.overview || ""}\n\n## 🟢 共同要点\n${(n.common || []).map((k) => "- " + k).join("\n")}\n\n## 🟡 分歧与互补\n${(n.diff || []).map((k) => "- " + k).join("\n")}\n\n## ✅ 可执行清单\n${(n.todo || []).map((k) => "- " + k).join("\n")}\n`
    : `---\ntitle: ${n.title}\nurl: ${n.url || ""}\nnote_id: ${n.id}\nauthor: ${n.author || ""}\ntype: ${n.type}\ncategory: ${n.category || ""}\nsubcategory: ${n.subcategory || ""}\ntags: [${(n.tags || []).join(", ")}]\nliked_count: ${n.liked || 0}\npublished_at: ${n.published_at || ""}\ncollected_at: ${n.collected_at || ""}\n---\n\n## 🧠 AI 摘要\n${n.summary || ""}\n\n## 🔑 关键要点\n${(n.key_points || []).map((k) => "- " + k).join("\n")}\n\n## 📄 原帖正文\n${n.bodyText || "（正文全文以原帖为准；vault 版本中图片以 ![图N](attachments/…) 内联）"}\n\n## 🖼 图片文字识别\n${(n.ocr || []).map((o) => "- " + o).join("\n") || "（无）"}\n\n## 💬 评论精选\n${(n.comments || []).map(mdComment).join("\n") || "（无）"}\n\n## ✏️ 我的备注\n${(n.remark || "").trim() || "（空）"}\n`;
  /* ── Obsidian 库导出：逐篇 .md 打包 zip（STORE 不压缩，纯手写无依赖） ──
     同名笔记重复导出 → 文件名相同 → 解压覆盖该篇 = 只更新这一篇；其余文件一律不动。 */
  const CRC_TABLE = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  const crc32 = (s) => { const u = new TextEncoder().encode(s); let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_TABLE[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const safeName = (t) => t.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const vaultName = (n) => (n.collected_at ? n.collected_at + " " : "") + safeName(n.title) + ".md";
  const dosTime = () => { const d = new Date(); return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; };
  const buildZip = (entries) => {
    const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0; const { t: dt, d: dd } = dosTime();
    for (const e of entries) {
      const nameB = enc.encode(e.name); const dataB = enc.encode(e.text); const crc = crc32(e.text);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, dataB.length, true); lh.setUint32(22, dataB.length, true);
      lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameB, dataB);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, dataB.length, true); ch.setUint32(24, dataB.length, true);
      ch.setUint16(28, nameB.length, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + dataB.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, entries.length, true); eo.setUint16(10, entries.length, true);
    eo.setUint32(12, cdSize, true); eo.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(eo.buffer)], { type: "application/zip" });
  };
  const buildIndexMd = () => {
    const rows = NOTES.map((n) => {
      const link = vaultName(n).replace(/\.md$/, "");
      const tags = (n.tags || []).map((t) => "#" + safeName(t).replace(/\s/g, "")).join(" ");
      return `- [[${link}|${n.title}]]${tags ? " · " + tags : ""}`;
    }).join("\n");
    return `# 薯藏 RedVault · 库目录\n\n> 共 ${NOTES.length} 篇 · 导出于 ${new Date().toLocaleDateString("zh-CN")}\n> 用法：把 redvault 文件夹放入 Obsidian 库（或把 Obsidian 库直接指向它）。重复导出解压时选"覆盖"，只会更新同名笔记，其余文件不动。\n\n## 全部笔记\n${rows}\n`;
  };
  $("#btnExport").onclick = () => {
    const entries = [{ name: "redvault/INDEX.md", text: buildIndexMd() }, ...NOTES.map((n) => ({ name: "redvault/" + vaultName(n), text: noteToMd(n) }))];
    const blob = buildZip(entries);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "redvault-obsidian-" + new Date().toISOString().slice(0, 10) + ".zip";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("已导出 Obsidian 库 zip · " + NOTES.length + " 篇笔记 + INDEX");
  };
  $("#btnCancelSelect").onclick = exitSelectMode;
  $("#btnOpenSynthesize").onclick = openSynthesize;
  $("#sideSynthesis").onclick = () => {
    App.filter = { ...App.filter, type: "synthesis" };
    location.hash = "#/library";
    route();
  };

  const si = $("#searchInput");
  si.oninput = () => {
    App.filter.q = si.value.trim();
    if (App.view !== "library") location.hash = "#/library";
    else renderLibrary();
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== si) { e.preventDefault(); si.focus(); }
    if (e.key === "Escape") { if (!$("#overlayModal").hidden) closeModal(); else if (!$("#overlayDetail").hidden) closeDetail(); }
  });

  $$("[data-close]").forEach((el) => el.onclick = () => {
    if ($("#overlayModal").contains(el)) closeModal();
    else closeDetail();
  });

  /* 弹窗内容动态注入，改用事件委托关闭 */
  $("#overlayModal").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  $("#overlayDetail").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeDetail(); });

  $("#pipelineHead").onclick = () => {
    const p = $("#pipelinePanel");
    p.hidden = !p.hidden;
    $("#pipelineBar").classList.toggle("open", !p.hidden);
  };

  document.addEventListener("click", (e) => {
    const cat = e.target.closest("[data-cat]");
    if (cat) {
      App.filter.category = cat.dataset.cat;
      App.filter.subcategory = cat.dataset.sub || "";
      App.filter.type = "";
      if (cat.dataset.sub === "" && cat.closest(".cat-link")) {
        const item = cat.closest(".cat-item");
        const isOpen = item.classList.contains("open");
        $$(".cat-item").forEach((x) => x.classList.remove("open"));
        if (!isOpen) item.classList.add("open");
        if (isOpen) { App.filter.category = cat.dataset.cat; }
      }
      location.hash = "#/library";
      route();
      return;
    }
    const tag = e.target.closest("[data-tag]");
    if (tag) {
      App.filter.tag = App.filter.tag === tag.dataset.tag ? "" : tag.dataset.tag;
      renderSidebar(); renderLibrary();
    }
  });

  route();
}
document.addEventListener("DOMContentLoaded", init);

