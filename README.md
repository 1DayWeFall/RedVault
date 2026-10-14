# 薯藏 RedVault

> 将小红书收藏转化为可检索、可复用、真正属于自己的本地知识库。

RedVault 是一个本地优先的个人知识管理工具：在浏览器登录态内采集小红书收藏，先将原始数据放入收件箱，用户确认后再进行 AI 整理，并把结果写入 Obsidian 兼容的 Markdown Vault。它同时提供列表、搜索、状态看板和交互式知识画布，让用户可以从一条收藏一路追踪到结构化笔记和原始内容。

[![Repository](https://img.shields.io/badge/GitHub-1DayWeFall%2FRedVault-181717?logo=github)](https://github.com/1DayWeFall/RedVault)
[![License](https://img.shields.io/badge/license-personal%20project-lightgrey)](#项目边界)
[![Runtime](https://img.shields.io/badge/runtime-Node.js%2018%2B-339933?logo=node.js)](#快速开始)

## 为什么做它

收藏并不等于拥有。小红书收藏通常面临三个问题：内容分散在平台内部，平台链接和推荐流不稳定；收藏数量增长后很难按主题找回；AI 整理如果直接覆盖原文，用户无法判断哪些是原帖事实、哪些是模型推断。

RedVault 的设计目标不是“再做一个收藏夹”，而是建立一条可检查的内容资产链：

```text
浏览器登录态采集
        ↓
原始 JSON 收件箱
        ↓ 用户确认
AI 整理 / 无 AI 降级
        ↓
Markdown Vault + 索引
        ↓
列表搜索 · 状态看板 · 交互画布 · 详情阅读
```

## 当前能力

### 已实现的主路径

- 油猴脚本在浏览器登录态内采集收藏详情、图片、视频字幕和评论
- 原始内容先进入 Inbox，支持预览、确认、失败重试和处理状态查看
- AI 双槽位整理：视觉模型优先，文本模型可回退；未配置 AI 时保存原文，不阻塞主流程
- 生成 Obsidian 兼容 Markdown，保留 frontmatter、原帖正文和 AI 区块
- 笔记库支持分类树、标签、关键词搜索、详情抽屉和备注编辑
- 看板展示领域 → 分类 → 子分类 → 笔记的结构关系
- 交互画布支持拖拽、平移、缩放、关键词/分类过滤和节点详情跳转
- 主题合成、附件处理和 Obsidian ZIP 导出

### 可信度与安全边界

- 原帖正文不可变，AI 内容只写入独立锚点区块
- 正文、评论、字幕、OCR 和附件在 prompt 中按来源区分，并明确作为外部数据处理
- AI 整理失败、未整理和部分来源缺失会显示不同状态，不默认伪装成高质量知识
- 服务只监听 `127.0.0.1:3789`，不对局域网开放
- API key、采集 token、Inbox 和索引数据位于本地 `data/`，不会进入 Git
- 测试只使用临时目录，严禁读写用户真实 Vault

## 产品界面

当前入口按用户任务组织为：

```text
收件箱 → 知识库 → 看板 → 画布 → 设置
```

| 视图 | 解决的问题 |
| --- | --- |
| 收件箱 | 哪些收藏刚采集、哪些等待确认、哪些失败了？ |
| 知识库 | 已入库的笔记有哪些，如何搜索和筛选？ |
| 看板 | 收藏内容按哪些领域和分类组织？ |
| 画布 | 知识节点之间的层级关系如何直观浏览？ |
| 详情 | 原帖内容、AI 整理、来源状态和个人备注是什么？ |

画布把分类层级和笔记节点放在同一张知识地图中，适合从整体结构浏览收藏，再进入单篇笔记阅读。

## 技术方案

```text
Tampermonkey userscript
        │ HTTP + capture token
        ▼
Express API（127.0.0.1:3789）
        ├── Inbox / capture / retry
        ├── AI pipeline（vision / text / fallback）
        ├── Vault engine（Markdown + anchored updates）
        ├── Board aggregation（read-only）
        └── Search / export / synthesis
        │
        ├── data/*.json          # 本地侧车状态，不入库
        └── Obsidian Vault/*.md  # 唯一真实笔记源
```

技术取舍：采用原生 HTML/CSS/JavaScript 和本地 Node 服务，保持低部署成本、可审计的文件格式和 Markdown 数据可迁移性。

## 快速开始

### Windows 用户

双击项目根目录的 `start.cmd`。它会：

1. 清理 RedVault 自己占用的 `3789` 端口；
2. 在隐藏窗口中启动 Node 服务；
3. 等待 `/api/health` 通过；
4. 自动打开 `http://127.0.0.1:3789/`。

如需结束本地服务，运行 `stop.cmd`。

### 命令行开发

```powershell
npm install
npm start
# 浏览器打开 http://127.0.0.1:3789/
```

要求 Node.js 18+。如果本机 Node 不在 PATH，`start.cmd` 会尝试使用 `.workbuddy\binaries\node\versions` 下的版本。

### 采集第一篇笔记

1. 在 Tampermonkey 安装 [`userscript/xhs_capture.user.js`](userscript/xhs_capture.user.js)。
2. 打开小红书网页版并保持登录。
3. 进入「我的收藏」，通过 RedVault 面板采集。
4. 回到 Inbox 检查原始内容，选择笔记并点击确认。
5. 等待 Markdown 写入 Vault，在知识库、看板或画布中查看。

正文和附件会保存到本地，原帖链接作为可选的溯源入口。

## 数据与文件结构

```text
server/                 Express API、业务服务和 AI 管线
public/                 原生前端，无构建链
userscript/             浏览器采集脚本
tests/                  node:test 自动测试
docs/DESIGN.md          架构唯一事实源
data/                   本地运行时数据（gitignored）
start.cmd               Windows 隐藏式启动入口
stop.cmd                Windows 停止入口
```

用户 Vault 路径由 `data/config.json` 的 `vaultPath` 配置，笔记以普通 Markdown 文件保存。

## 验证结果

当前版本已对核心主路径进行自动测试、API 检查和浏览器回归：

- `npm test`：100 项通过；向量存储测试暂未启用
- `/api/health`：服务健康检查
- `/api/board`：节点、边、统计和异常数据结构测试
- Inbox 失败项：恢复为 pending 的重试接口测试
- 浏览器回归：画布加载、节点打开详情、关键词过滤、边同步变化、console 无新增错误
- 安全回归：用户内容和 AI 内容进入 DOM 前统一经过 `esc()`

## 下一步

下一阶段围绕真实使用反馈继续完善：

- 评估关键词检索是否覆盖主要找回场景，再决定是否加入向量检索
- 增加笔记之间的关联边和主题节点
- 支持导出 Obsidian JSON Canvas
- 增加周期性回顾和复习视图

## 项目亮点

项目的核心价值在于把内容采集、整理、存储和复用连接成一个可操作的闭环：

- 从收藏痛点抽象出收件箱、状态和确认机制
- 保留原帖内容，将 AI 整理作为可追踪的补充信息
- 对 AI 失败和未整理内容提供明确的恢复与识别路径
- 用看板和画布降低知识结构的理解成本
- 通过自动测试和浏览器回归保证主流程可复现

## 参考与文档

- [架构与设计约束](docs/DESIGN.md)
- [架构决策记录](docs/ADR.md)
- [项目案例记录与求职证据模板](docs/CASE_STUDY.md)
- [项目状态总结](项目状态总结-2026-10-14.md)
- [GitHub 仓库](https://github.com/1DayWeFall/RedVault)

## 项目边界

RedVault 是个人本地知识管理工具，不是小红书官方客户端，也不提供绕过登录、风控或平台访问限制的能力。使用者应遵守目标平台的服务条款、隐私要求和适用法律。
