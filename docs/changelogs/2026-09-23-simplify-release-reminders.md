# 精简发布提醒

按用户反馈，替代此前常驻文档中的详细检查清单，仅保留发布路径：
Toolkit → SDK submodule / Dispatch；main → STG；包 release tag → PRD；
依赖先于消费者发布。删除额外的契约测试、哈希记录与读回检查要求。

两个仓库同步精简 README 和 AGENTS.md；背景见
[sdk-monorepo #191](https://github.com/alva-ai/sdk-monorepo/issues/191)。
仅文档，不改既有发布流程或运行时。验证：完整 diff 审阅及
`git diff --check`；无需运行 E2E。后续仅待文档 PR 合并。
