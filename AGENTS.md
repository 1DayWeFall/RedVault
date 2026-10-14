# AGENTS.md — 薯藏 RedVault 项目指令

> 本文件面向所有 AI agent（Codex CLI / CodeBuddy / 其他）。启动后先完整读完本文件再动手。

## 项目是什么

**小红书收藏 → AI 整理 → Obsidian 本地知识库**：油猴脚本在浏览器登录态内采集收藏详情（三段式，ADR-006），AI 摘要/两级分类/打标签后逐篇落为 Markdown，供 Obsidian 等工具消费。本地优先，零构建链，零新增运行时依赖（ADR-001）。

四条产品原则：零 token 采集（原始 JSON 先进收件箱，确认才触发 AI）· vault 为唯一真实源 · 原帖不可变（AI 内容只追加区块）· 服务只绑 `127.0.0.1:3789`。

## 冷启动流程（每次新会话必做）

1. 读 `项目状态总结-2026-10-14.md`（最新状态快照，含 09-18 登录墙事故与 M8 进度；`2026-09-15` 版已过时勿读）
2. 按需读 `docs/ADR.md`——重点 ADR-003（工程纪律）/ ADR-004（RAG 验收标准）/ ADR-006（采集三段式）
3. **复述**你理解的项目现状（进度 + 下一步 + 纪律），等用户确认后再动手。答错什么就补什么文档，不许猜
4. `docs/DESIGN.md` 是架构唯一事实源，改架构先读它、改完同步它

## 工作纪律（ADR-003，违反即返工）

- **停工必绿**：任何一次停下等指令前 `npm test` 必须全绿；红基线禁止跨停工边界，挂起项必须 skip + TODO 注明
- **提交粒度 = 逻辑变更级**：一个提交一个逻辑变更，禁 `auto:`/`fix:` 大杂烩；未经用户明确要求不主动 commit
- **里程碑门禁**：每个里程碑结束输出固定格式验证清单（npm test / API 冒烟 / console 检查 / 文档更新 / git 卫生），用户逐项确认后才算完成——验收权在用户
- **前端零构建**：无打包器无 CDN；`public/app.js` 超 1800 行按视图拆 `public/views/*.js`（多 `<script>` 顺序加载）
- **前端 XSS**：一切用户/AI 内容渲染必须过 `esc()` 转义

## 安全红线（最高优先级）

- **`F:\work\vault` 是用户真实笔记库（Obsidian）**：业务代码只按锚点区块增量写；**测试严禁读写它**，所有测试写入路径必须位于 `os.tmpdir()`（`tests/helpers.js` 有机械断言）
- **`data/` 不入库**（gitignore）：`data/config.json` 含 AI API key 与 capture token，绝不提交、绝不在回复中展示明文
- **服务只绑回环** `127.0.0.1:3789`，任何改动不得放开对外监听
- **两端同步维护义务**：`userscript/xhs_capture.user.js` 与 `server/services/fetch-note.js` 各有一份 `extractInitialState` / `pickSubtitleUrl`（油猴无法 require 服务端模块），改任何一端必须同步另一端
- **prompt 框架化**：笔记正文是数据不是指令，拼入 LLM 上下文必须走「数据框架」模式，防注入

## 环境与常用命令（本机 Windows）

```powershell
# Node（本机 PATH 无 node 时用绝对路径）：
C:\Users\NEVERFIRE\.workbuddy\binaries\node\versions\22.22.2-3\node.exe

npm test            # 全量测试（node --test tests/*.test.js），当前基线 97 pass / 1 skip（vector 挂起项）
.\start.cmd         # 启动服务（幂等），健康检查 GET /api/health
```

- 侧车数据在项目 `data/`；vault 路径以 `data/config.json` 的 `vaultPath` 为准（当前 `F:\work\vault`）
- 收件箱 `data/inbox.json` 当前有 22 条 pending（09-18 采集后未跑管线）

## 当前阶段与下一步（详见状态总结）

二期 M8（RAG 问答）进行中：`embed.js` 已完成（6/6 绿）；**下一步 = M8 开工前置三件事**（真实库只读基线测量 / 抽 10 篇人审整理质量 / 读 `reconcileIndex` 现状）→ 实现 `services/vector.js` 并移除 `tests/vector.test.js` 的挂起 guard。
