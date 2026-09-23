# Embedded CLI 交付规则

## 1. 现状

npm CLI 发布与 Agent 的 ALPKG Dispatch 发布独立，旧 README 混淆了交付路径。

## 2. 目标

避免 Toolkit main 上的功能被误认为已在 Agent 可用。

## 3. 决策

跨仓库主记录：[SDK changelog](https://github.com/alva-ai/sdk-monorepo/blob/codex/docs-skill-dispatch-release-contract/docs/changelogs/2026-09-23-skill-cli-release-contract.md)。
协调与运行时修复：[sdk-monorepo #191](https://github.com/alva-ai/sdk-monorepo/issues/191)。

## 4. 实现

README 更正交付路径并新增检查表；AGENTS.md 要求核对嵌入式契约、SDK gitlink、
独立 Dispatch 发布、Skill 最低版本及逐环境消费者验证。

## 5. 验证

检查完整 diff、链接目标、git diff --check。纯文档变更，不运行本地 E2E，
不发送真实消息，不发布 artifact。

## 6. 授权与边界

用户授权文档与协调 issue；不修改产品代码、版本或部署配置。

## 7. 结果

持久交付规则已补充；没有宣称运行时缺陷已修复。

## 8. 后续

文档 PR 待合并；实际契约修复和发布验收由协调 issue 跟踪。
