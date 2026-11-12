# feat: read activity from people you follow

本地记录。主记录：alva-backend docs/changelogs/2026-11-12-connect-your-ai-agent.md。

- 新命令 `alva people follows activity [--since <ISO>]`，走 GraphQL `viewer.followingActivity`；默认最近 1 天，最多回看 7 天、200 条；输出 `{ items, hasMore, until }`，`until` 供下次作为 `--since`。
- 供 Alva skill 每天的只读提醒使用；其余命令与 key 行为不变。
- 验证：`test/resources/follows.test.ts`、`test/cli/follows.test.ts`。
