# 薯藏 RedVault

> 小红书收藏 → AI 整理 → Obsidian 本地知识库 · 个人内容存档与知识管理工具
> 主仓库：https://github.com/1DayWeFall/RedVault

## 这是什么

收藏夹里的好笔记只在吃灰？RedVault 把你收藏的小红书笔记抓取下来（油猴脚本读取页面数据，零额外请求、自用低频），经 AI 摘要、两级分类、打标签后**逐篇落为 Markdown**，直接被 Obsidian / Cursor 等任何工具消费——**数据永远在你本地**。

核心原则（详见 [docs/DESIGN.md](docs/DESIGN.md)）：

- **零 token 采集**：抓取只存原始 JSON 进收件箱，用户确认后才触发 AI
- **vault 为唯一真实源**：笔记/图片全部落 Markdown 文件夹，随时可被外部工具接管
- **原帖不可变**：AI 生成内容与原帖正文严格分区，只追加区块
- **本地优先**：apiKey、数据全部留在本机，服务只绑定回环地址

## 当前状态

| 模块 | 状态 |
|------|------|
| 设计文档 v1.0 | ✅ 定稿（`docs/DESIGN.md`，已评审，指导实现） |
| 前端交互 demo | ✅ 可用（已平移为 `public/` 真实前端） |
| 工程骨架 + 数据层 + vault 引擎 | ✅ M0/M1（13 项单测全绿） |
| 油猴采集脚本 + 收件箱 + 无 AI 最小管线 | ✅ M2/M3（采集→确认→落盘→前端 全链路打通，浏览器回归通过） |
| AI 双槽位管线 + 图片压缩 + 设置页 | ✅ M4（vision/text 双槽位、sharp 缩略图、relate 互链、设置页测试连接） |
| 主题合成 / 附件合并 / 服务端导出 | 🚧 M5（按计划推进） |

## 仓库结构

```
RedVault/
├── server/                 # Node 服务（Express · 127.0.0.1:3789 · 仅回环监听）
│   ├── index.js            # 入口：静态托管 / 统一错误处理 / 启动自检
│   ├── routes/             # API 路由（capture / inbox / notes / …随里程碑挂载）
│   ├── services/           # 数据层 / vault 引擎 / AI 管线 / …
│   └── lib/                # capture 数据规范化等纯函数
├── public/                 # 前端（由 demo 平移，无构建链）
├── userscript/             # 油猴采集脚本 xhs_capture.user.js
├── tests/                  # node:test 单测
├── docs/DESIGN.md          # 设计文档（唯一事实源）
├── vault/  data/           # 运行时数据（.gitignore，绝不入库）
├── sync.ps1                # 一键同步：git add → commit → push
└── README.md               # 本文件
```

## 本地运行

```powershell
npm install
npm start        # → http://127.0.0.1:3789
```

数据来自真实采集，当前为**空库起步**（抓取一条进收件箱 → 确认 → 落盘一条）：

- **采集**：装油猴脚本（`userscript/xhs_capture.user.js`）→ 刷小红书详情页自动上报收件箱
- **收件箱**：预览 / 勾选 / 批量确认（当前无 AI，确认后直接落盘，分类「未整理」）
- **笔记库**：瀑布流、两级分类树、标签云、搜索、排序、多选
- **详情**：AI 摘要与原帖正文分区渲染、楼中楼评论、备注行内编辑（实时回写 vault）
- **导出**：Obsidian 格式 zip（逐篇 `.md` + frontmatter + `[[wikilink]]` 索引；重复导出解压覆盖 = 仅更新同名单篇）

> 无数据时想看效果：手动 POST 一条到 `/api/capture`（带 `X-Capture-Token`，token 见 `data/config.json`），或等 M2 联调时用油猴脚本真实抓取。

## 开发进程

| 日期 | 进展 |
|------|------|
| 2026-09-07 | 设计文档 v1.0 定稿：油猴采集（`__INITIAL_STATE__` 零风控）、vault 锚点区块增量更新、AI 双模型槽位、导出管线 |
| 2026-09-07 | 前端 demo 全流程完成：库 / 详情 / 合成 / 收件箱 / 搜索 / 选择模式 |
| 2026-09-07 | 导出升级 Obsidian zip：逐篇 `.md`、文件名清洗、CRC32 手写打包、Windows 解压 + Obsidian 兼容验证通过 |
| 2026-09-07 | 账号风控与合规边界写入设计文档 §16；仓库定名 **RedVault** |
| 2026-09-07 | **M0** 工程骨架：Express 服务 + demo 平移 `public/`，`npm start` 于 3789 可访问 |
| 2026-09-07 | **M1** 数据层 + vault 引擎：三侧车 JSON 原子写、锚点区块定位替换、文件名去重，13 项单测全绿 |
| 2026-09-07 | **M2** 采集链路：`/api/capture`（token 鉴权 + 判重）+ 油猴脚本 `xhs_capture.user.js` |
| 2026-09-07 | **M3** 前端接真实数据 + 无 AI 最小管线：采集→收件箱→确认→落盘→前端 全链路打通，API e2e + playwright 回归 7 项通过、console 零错误 |
| 2026-09-07 | **M4** AI 双槽位 + 完整管线：vision/text 双模型、图片下载压缩（sharp）、relate 互链、设置页测试连接；19 单测 + 脱敏/掩码/无 AI 回归 6 项全过 |

## 同步本仓库

```powershell
.\sync.ps1    # 自动 add → commit（带时间戳）→ push；代理已写入本仓库 git local config
```
