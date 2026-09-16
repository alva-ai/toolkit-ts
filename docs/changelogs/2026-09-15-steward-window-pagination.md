# Steward fixed-window pagination

## 1. Scope

Complete #940 tool pagination on Alan #173 (1fd0af6), using Gateway #944 operations.

## 2. Behavior

Each call returns one page, nextCursor and effective windowSinceMs/windowUntilMs. The opaque continuation cursor carries both bounds; every batch uses the original window. Reviewed-but-unsent receipts follow Alan #2520; sends keep stable UUIDs.

## 3. Dependencies

Backend and Gateway effective-window response fields must deploy before this consumer. Embedded host supplies inboxPath; caller cannot substitute a Channel.

## 4. Design

Reuse StewardPendingPage and upstream sinceMs/untilMs/after. Validate numeric bounds and response window. No new storage or unbounded automatic page aggregation.

## 5. Validation

Node 22, npm lockfile; typecheck/test/lint/format:check/build. Resource tests prove first-page/response window validation and opaque continuation; embedded CLI tests prove host target.

## 6. Checklist

- [ ] SDK response and validation
- [ ] Tests and documentation
- [ ] Embedded runtime pin and live acceptance

## 7. Implementation

In progress. Install dependencies with npm ci --ignore-scripts to preserve shared Git hooks; invoke build explicitly.

## 8. Evidence

Not published or deployed.

## 内嵌 CLI 重试修复

真实接线检查发现 embedded forward/send 未开放 request-id，终端 CLI 已支持。新增回归测试先复现“不支持参数”，再开放这两个命令的 request-id；宿主 Inbox 绑定不变。重复调用验证透传相同请求 ID。

## 最新验证

Node 22：npm run typecheck、npm test（954 tests / 50 files）、npm run lint、npm run format:check、npm run build 全部通过。构建包含实际 embedded dispatch；vendor-contract 生成文件没有差异。尚未发布或在 ALPI 运行服务上验收。

## 2026-09-16 本地提交保存点

按用户要求保存当前实现与验证记录为本地提交。尚未推送、创建 PR、合并或部署；上述未通过的跨服务验收与待更新依赖仍未完成。本次提交不表示 #936/#940 已完成。

## Main alignment (2026-09-16)

Aligned with upstream business mutations and opaque cursor pagination. Preserved retry UUID coverage and strict window validation. Node 22 typecheck, 959 tests, lint, format:check and build passed. Full live acceptance and published ALPI Toolkit pin remain pending.
