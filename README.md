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
| 前端交互 demo | ✅ 可用（`demo/`，纯静态零依赖） |
| 油猴采集脚本 / Node 服务 / AI 管线 | 🚧 未实现（按设计文档推进） |

## 仓库结构

```
RedVault/
├── docs/
│   └── DESIGN.md   # 设计文档（唯一事实源：架构 / 数据模型 / 风险边界）
├── demo/           # 前端交互 demo（index.html + app.js + styles.css）
├── sync.ps1        # 一键同步：git add → commit → push
└── README.md       # 本文件
```

## Demo 快速开始

```powershell
cd demo
python -m http.server 8923        # 或 npx serve -l 8923
# 浏览器打开 http://localhost:8923
```

内置 12 篇示例笔记（11 篇模拟抓取 + 1 篇 AI 合成），覆盖完整交互：

- **收件箱**：抓取结果确认制（预估成本 → 批量入库）
- **笔记库**：瀑布流、两级分类树、标签云、搜索、排序、多选
- **详情**：AI 摘要与原帖正文分区渲染、楼中楼评论、备注行内编辑
- **AI 合成**：多篇笔记 → 主题综述（共同要点 / 分歧 / 可执行清单）
- **导出**：Obsidian 格式 zip（逐篇 `.md` + frontmatter + `[[wikilink]]` 索引；重复导出解压覆盖 = 仅更新同名单篇，其余文件不动）

## 开发进程

| 日期 | 进展 |
|------|------|
| 2026-09-07 | 设计文档 v1.0 定稿：油猴采集（`__INITIAL_STATE__` 零风控）、vault 锚点区块增量更新、AI 双模型槽位、导出管线 |
| 2026-09-07 | 前端 demo 全流程完成：库 / 详情 / 合成 / 收件箱 / 搜索 / 选择模式 |
| 2026-09-07 | 导出升级 Obsidian zip：逐篇 `.md`、文件名清洗、CRC32 手写打包、Windows 解压 + Obsidian 兼容验证通过 |
| 2026-09-07 | 账号风控与合规边界写入设计文档 §16；仓库定名 **RedVault** |

## 同步本仓库

```powershell
.\sync.ps1    # 自动 add → commit（带时间戳）→ push；代理已写入本仓库 git local config
```
