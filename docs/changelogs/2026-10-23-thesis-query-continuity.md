# Thesis 查询与引用追问衔接

## 1. 背景

卡片引用带 Thesis/version ID，但人物作者的 slug 在 Gateway 和 Toolkit 丢失。Full 已有读取契约，Slim 缺少同等入口。

## 2. 批准行为

B1：按用户实际问题选择作者、标的、相关观点或 Signals。B2：使用返回的真实身份，不猜 ID，不把当前正文替换旧引用。B3：读操作不进入发布、更新或资产抽取流程。

## 3. 设计

ThesisAuthor 增加可选 slug，GET 保留服务端字段；旧响应兼容。

新增字段为可选，兼容未返回 slug 的旧服务。Person 使用 slug，PublicUser 使用 username；名称歧义沿用现有 CLI 候选澄清。跨仓库同名 changelog：skills、toolkit-ts、alva-gateway、sdk-monorepo。

## 4. 实现范围

只修改 Thesis 读取契约、必要路由指针、GET 字段透传及嵌入依赖。Toolkit 先本地提交，再更新 Dispatch gitlink，以真实构建产物验证字段不丢失。

## 5. 验证

Gateway：`go test ./pkg/handler -run TestThesis -count=1`、`make lint-fix`。Toolkit：Thesis resource/CLI 测试和 typecheck。SDK：Dispatch 构建、产物测试、typecheck；Slim 中英文文档检查。Full：doc、mutation、durable 检查。各仓库 git diff --check，比较发布/更新段落未变。

E2E Required: no。稳定边界为只读 GET→SDK/Dispatch→现有 list 的元数据契约；用 handler 与真实打包产物测试覆盖。真实 Full/Slim 对话需要非空 fixture，由后续定向 Eval 验证，不以文档断言代替行为效果。Gateway 之外无 make lint-fix 目标时不另造 lint 命令。

## 6. 用户决定与顺序

2026-10-23 用户批准三项最小改动，Full/Slim 中英文同步，不碰发布和更新。

- [x] 透传并验证作者 slug。
- [x] 配套 Skill 已补读取规则及中英文路由。
- [x] 构建直接消费者，完成整体 review 和 Eval 交接。

## 7. 结果

Toolkit 0.33.1：`npm test -- test/resources/theses.test.ts test/cli/theses.test.ts test/resources/thesisReads.test.ts` 130/130；`npm run typecheck`、`git diff --check` 通过。新字段可选，Person slug 保留、旧响应无 slug 兼容、错误类型拒绝；只读 parser 修改，create/update payload 和 CLI 流程不变。依赖版本无变更。

B1/B3 由配套 Skill 负责；B2 的 Toolkit 边界已验证，Dispatch 产物验证见 sdk-monorepo 同名记录。当前库没有 make lint-fix 目标。

## 8. 后续

Gateway、Toolkit、Dispatch 需依次合入/发布后再验收新字段。使用真实非空作者/标的/相关推荐/Signals 数据；没有数据不能证明查询准确性。当前不发布、不改变线上配置。

PR preparation: synchronized current main; release patch is 0.33.2 because main already publishes 0.33.1. Fresh CLI/resource tests passed 439/439, typecheck and focused ESLint passed. AI Digest help cleanup is included in the Dispatch pin as well. No release or production change performed.

PR #197 review: a present author slug must be nonempty, matching the downstream Person selector. Reuse responseNonemptyText; malformed types, empty strings and whitespace are rejected, while omitted slugs stay compatible.

Review fix verification: CLI/resource tests 441/441, typecheck, focused ESLint and diff check passed.
