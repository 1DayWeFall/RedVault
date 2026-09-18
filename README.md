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

> **MVP 已交付（M0–M6 六里程碑全部完成）**：从零到可用，采集 → AI 整理 → vault 落盘 → 前端 → 利用层 → 安全打磨，全链路可跑。

| 模块 | 状态 |
|------|------|
| 设计文档 v1.0 | ✅ 定稿（`docs/DESIGN.md`，已评审，指导实现） |
| 前端交互 demo | ✅ 可用（已平移为 `public/` 真实前端） |
| 工程骨架 + 数据层 + vault 引擎 | ✅ M0/M1（13 项单测全绿） |
| 油猴采集脚本 + 收件箱 + 无 AI 最小管线 | ✅ M2/M3（采集→确认→落盘→前端 全链路打通，浏览器回归通过） |
| AI 双槽位管线 + 图片压缩 + 设置页 | ✅ M4（vision/text 双槽位、sharp 缩略图、relate 互链、设置页测试连接） |
| 主题合成 / 附件 AI 合并 / 服务端导出 | ✅ M5（P4 合成、multer+pdf-parse 附件、archiver 流式 zip） |
| 安全打磨 + 验收 | ✅ M6（XSS 转义、脱敏复查、冒烟回归、Obsidian 导出实测） |
| 二期 M7 地基与技术债 | ✅（同源校验 + 限流、启动 index↔vault 一致性、侧车读缓存、HttpError 统一、死代码清理、token 掩码、文档校准；88 项单测全绿） |

## 仓库结构

```
RedVault/
├── server/                 # Node 服务（Express · 127.0.0.1:3789 · 仅回环监听）
│   ├── index.js            # 入口：安全中间件（同源校验/限流）/ 启动自检 / 统一错误处理
│   ├── routes/             # API 路由（capture / inbox / notes / settings / attachments / synthesize / export）
│   ├── services/           # 数据层 / vault 引擎 / AI 管线 / 关联评分 / 主题合成
│   └── lib/                # capture 规范化、溯源 token、http-error / origin-guard / ratelimit
├── public/                 # 前端（无构建链：原生 HTML/CSS/JS，无 CDN 依赖）
├── userscript/             # 油猴采集脚本 xhs_capture.user.js
├── tests/                  # node:test 单测
├── docs/DESIGN.md          # 设计文档（唯一事实源）
├── data/                   # 运行时侧车数据（.gitignore，绝不入库）
├── F:\work\vault\          # 知识库（vaultPath 可配置，当前实例指向此处）
├── start.cmd               # 一键启动：清理旧进程 → 启动服务 → 探测健康 → 打开入口
├── sync.ps1                # 一键同步：git add → commit → push
└── README.md               # 本文件
```

## 本地运行

**唯一入口 `http://127.0.0.1:3789`**（端口固定）。推荐一键启动：

```powershell
.\start.cmd      # 自动清理残留进程并启动服务，提示唯一入口地址
```

等价方式（手动）：

```powershell
npm install
npm start        # → http://127.0.0.1:3789
```

> ⚠️ `8923` 是历史 demo 预览端口，**已废弃**，请勿再使用。启动请一律走 `start.ps1` 或 `npm start`，端口固定 3789。

数据来自真实采集，当前为**空库起步**（抓取一条进收件箱 → 确认 → 落盘一条）：

- **采集**：装油猴脚本（`userscript/xhs_capture.user.js`，v0.5.0+）→ 刷小红书收藏页，脚本在浏览器登录态内抓详情后上报收件箱
- **收件箱**：预览 / 勾选 / 批量确认（AI 管线后台串行整理后落盘；未配 AI 时降级直落盘，分类「未整理」）
- **笔记库**：瀑布流、两级分类树、标签云、搜索、排序、多选
- **详情**：AI 摘要与原帖正文分区渲染、楼中楼评论、备注行内编辑（实时回写 vault）
- **导出**：Obsidian 格式 zip（逐篇 `.md` + frontmatter + `[[wikilink]]` 索引；重复导出解压覆盖 = 仅更新同名单篇）

> 无数据时想看效果：手动 POST 一条到 `/api/capture`（带 `X-Capture-Token`，token 见 `data/config.json`），或等 M2 联调时用油猴脚本真实抓取。

### 溯源链接状态与重扫续期

「溯源原帖」链接由小红书授权令牌（`xsec_token`）签名，**约数天过期属正常现象**；正文与图片已全量本地化，过期不影响阅读。详情页溯源按钮旁的徽标会实时探测链接死活（`链接有效 / 链接已过期 / 原帖可能已删除`，结果服务端缓存，重扫换令牌自动重探）。

链接过期后**三步批量刷新全部链接**（唯一新令牌来源是你的浏览器会话，服务端无法自行复活）：

1. Tampermonkey 中覆盖安装 `userscript/xhs_capture.user.js`（**v0.5.0+**：2026-09-18 平台对未登录详情请求上登录墙后，详情改由浏览器登录态内抓取，见 `docs/ADR.md` ADR-006）
2. 打开小红书网页版「我的收藏」
3. RedVault 面板点「开始批量抓取」→ 已入库笔记只刷 frontmatter 的 `url` 一行（不重抓正文、不动备注），面板出现「链接刷新 N」即完成

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
| 2026-09-07 | **M5** 主题合成 + 附件 AI 合并 + 服务端 zip 导出：P4 合成、multer/pdf-parse 附件、archiver 流式导出；导出/附件增删/无 AI 降级 9 项全过 |
| 2026-09-07 | **M6** 安全打磨 + 验收：XSS 转义补漏、导出加 INDEX wikilink、脱敏复查；playwright 冒烟 5 项全过 + console 零错误 + zip 解压验证 Obsidian 兼容。**MVP 交付完成** |
| 2026-09-07 | 迭代：**视频字幕采集**（借鉴 xhs-vault，取平台 SRT 字幕纳入 AI 整理，不再「视频未转写」）+ 修复**复制脚本**（弹窗展示/复制/下载）+ 修复 **vault 路径自定义**（热切换+迁移）；21 单测 + API 9 项 + 浏览器回归 8 项全过 |
| 2026-09-10 | **二期 M7 地基与技术债**：回环同源校验（`lib/origin-guard`）+ 按端点限流（`lib/ratelimit`，capture/list·settings/test·reprocess·link-status）、启动 index↔vault 一致性自检（`vault.reconcileIndex`）、侧车 JSON 与溯源 token 读缓存（mtime 感知）、`lib/http-error` 统一 HttpError 并把 fs 错误从 500 改判 400、管线失败项进 `/pipeline/status`、静默 catch 改告警、清理死代码（前端手写 zip 打包/失效的评论条数设置/STAGES/stripHtml 别名）、capture token 掩码 + `reveal/rotate` 端点、版本统一 0.3.0、README 与 DESIGN 校准；新增 3 组单测（安全/缓存/一致性），**88 项单测全绿** |

## 后续路线

| 里程碑 | 方向 | 说明 |
|------|------|------|
| M7 | 地基与技术债 | ✅ 已完成：同源校验 + 按端点限流、启动 index↔vault 一致性重建、侧车 JSON 与溯源 token 读缓存、HttpError 统一与 fs 错误分类、死代码清理、capture token 掩码、README/DESIGN 校准 |
| M8 | RAG 问答 | 可插拔嵌入 provider（本地 Ollama → text 槽位 `/embeddings` → 关键词降级）+ 增量向量索引 + `#/ask` 问答视图（引用白名单，杜绝幻觉引用） |
| M9 | 回顾 / 回看视图 | ISO 周聚合 + 随机回顾（避开近期已看）+ AI 要点复盘，可落盘为 vault 内的「回顾」笔记 |
| M10 | 看板 / 画布视图 | 领域→分类→子簇→笔记 树状俯瞰，可导出 Obsidian `.canvas` |

> 每个里程碑跑通 `npm test` + API 冒烟 + 浏览器回归后再进入下一个；详见 `docs/DESIGN.md` §15。

## 同步本仓库

```powershell
.\sync.ps1    # 自动 add → commit（带时间戳）→ push；代理已写入本仓库 git local config
```
