# feat: read activity from people you follow

本地记录。主记录：alva-backend docs/changelogs/2026-11-12-connect-your-ai-agent.md。

- 新命令 `alva people follows activity [--since <ISO>]`，走 GraphQL `viewer.followingActivity`；默认最近 1 天，最多回看 7 天、200 条；输出 `{ items, hasMore, until }`，`until` 供下次作为 `--since`。
- 供 Alva skill 每天的只读提醒使用；其余命令与 key 行为不变。
- 验证：`test/resources/follows.test.ts`、`test/cli/follows.test.ts`。
- 评审后：`follows activity` 容忍单条的发起人、Thesis 或股票解析出错（这些字段可为空），整页缺失（如未登录）仍报错；1455 个测试通过。
- 奥卡姆复核后（11-16）：动态类型改为发布、更新、收藏 Thesis，点赞 Signal，加自选；去掉 `THESIS_EDITED`、`THESIS_LIKED`。`SIGNAL_LIKED` 带 `signal: { id, stance, explanation, excerpt?, source: { title, url? } }`，`thesis` 是它所属的 Thesis。README 同步。验证：`npx vitest run` 62 文件 1456 通过，`tsc --noEmit`、`npm run lint` 无报错。
- 整体复核（11-17）：rebase 到 main（命令数 137）。`people follows activity` 不再因为不认识的动态类型整页失败：用户装的 CLI 会落后于服务端，以后加类型时旧 CLI 把新类型原样透传给 agent；缺 `kind` 或时间的条目仍报错。帮助文字补上 Signal。验证：`npx vitest run` 62 文件 1469 通过，`tsc --noEmit`、`npm run lint` 无报错。
