---
description: 检查工作区改动并同步到 GitHub（add + commit + push）
---

请执行以下同步流程：

1. 运行 `git status --porcelain` 检查工作区 c:/Users/NEVERFIRE/CodeBuddy/20260907154022 是否有未提交改动（若 git 不在 PATH，使用完整路径 "C:\Program Files\Git\cmd\git.exe"）。
2. 如果没有任何改动：告知仓库已是最新状态，流程结束，不做多余操作。
3. 如果有改动：先运行 `git diff --stat` 了解改动概况，然后 `git add .`，再用中文简要描述本次改动内容作为提交信息（格式如 "sync: 更新了设计文档"）执行 `git commit`，最后 `git push` 推送到远程仓库。

约束：不要修改用户的 git 配置，绝不使用 --force 强推；推送失败时报告原因和解决建议。
完成后用一句话报告提交号和推送结果。
