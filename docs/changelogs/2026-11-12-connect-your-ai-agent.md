# feat(auth): name the signed-in key after this computer

本地记录。连接用户自己的 AI agent 的主记录在 frontend-monorepo `docs/changelogs/2026-11-12-connect-your-ai-agent.md`。

- `alva auth login` 换 key 时把本机名作为 key 名发给网关（CLI 登录没有让用户起名的步骤）。macOS 取「共享」里的电脑名称（`scutil --get ComputerName`，1 秒超时），其余系统取 hostname 并去掉 `.local`；取不到就不发，网关保持「cli」。浏览器回调和粘贴两条路径都带上。名字只出现在用户自己的 key 列表里（Web /apikey、App 状态弹窗）。本机实测取到「MacBook Pro (2)」。
- 11-20 收窄：原先还有 `alva people follows activity`，删掉。agent 读关注的人的 Thesis 改用现有的 `alva people follows list` 加 `alva thesis list --user/--person`。
- 验证（11-20）：`npx vitest run` 1465 通过，`tsc --noEmit`、`npm run lint` 无报错。
