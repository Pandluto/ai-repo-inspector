# ai-repo-inspector 修复任务清单

> 本文根据 `research.md` 生成。本文只整理事实、优先级、对策和验收标准，**不包含本轮代码修复**。
>
> 调研日期：2026-07-31  
> 当前项目：`/Users/sailstellar/Documents/ai-repo-inspector`  
> 建议当前执行范围：MCP-first；CLI、Git、报告和发布工程化列为后续任务。

## 1. 调研结论

`research.md` 对系统结构和主要风险的判断总体成立。当前项目是一个“共享 core + CLI/MCP 适配器”的原型，能够启动，但还没有形成可靠、明确的生产契约。

需要修正或加限定的地方：

1. **R-01 的影响不是必然“调用失败”。** `input.repoPath` 为 `undefined` 时，Node 可能把 `cwd: undefined` 解释为 MCP 进程当前目录。因此调用有可能成功返回，但检查的是错误的目录；只有当前目录不是 Git 仓库等情况下才会直接失败。这是“静默检查错误目标”，风险比普通报错更大。
2. **R-04 的资源限制结论应更精确。** `exec` 没有设置项目自己的 `timeout`、输出上限和取消策略，但 Node 本身存在默认 `maxBuffer` 行为。任务应补充显式、可观测且可测试的限制，而不是简单认为完全没有上限。
3. **R-02、R-13 的严重度取决于部署边界。** 在仅供本人使用的受信任本机 CLI 中，任意验证命令是高权限能力但不一定是远程漏洞；在 MCP 被 AI 客户端或其他不受信任调用方触达时，应按高风险处理。
4. **R-15 是环境隔离问题，不是当前根目录测试必然失败。** 项目根目录运行测试可以通过；把项目嵌套在另一个 Vite/Wrangler 工作区时，父级配置可能被自动拾取并导致失败。

## 1.1 逐项真伪判断

| 调查项 | 判断 | 核验后的表述 |
| --- | --- | --- |
| R-01 MCP 参数错位 | 部分属实 | 字段错位确定存在；后果可能是静默使用 MCP 进程当前目录，而不一定立即抛错。 |
| R-02 任意 Shell 执行 | 属实（有条件） | `exec` 确实执行调用方提供的 shell；严重度取决于是否允许不受信任的 MCP 调用方。 |
| R-03 验证失败中断 | 属实 | 非零退出直接 reject，`failed` 类型目前没有实际产出路径。 |
| R-04 缺少资源限制 | 基本属实 | 没有项目级 timeout、取消和可观测输出策略；Node 自带默认 maxBuffer，不能表述为完全没有上限。 |
| R-05 format 未实现 | 属实 | CLI 接受 `json` 类型但 core 始终生成 Markdown，MCP 也未公开该字段。 |
| R-06 CLI 截断空格路径 | 属实 | `--repo` 值被再次按空格拆分。 |
| R-07 CLI 参数校验不足 | 属实 | 缺值、未知参数和非法 format 缺少即时、明确的运行时错误。 |
| R-08 Git base/ref 边界 | 基本属实 | 默认值固定为 `main`，错误处理不足；Git 使用参数数组避免了 Shell 拼接注入。 |
| R-09 Git 状态解析不完整 | 属实 | rename/copy/untracked 和特殊路径处理不完整。 |
| R-10 Markdown 未转义/输出过大 | 属实（有条件） | 动态内容确实未转义/限长；实际渲染危害取决于下游 Markdown 渲染器。 |
| R-11 stderr 丢失/敏感信息 | 属实 | `stdout || stderr` 会丢弃另一条流，输出也可能原样包含敏感内容。 |
| R-12 输出文件固定覆盖 | 属实 | CLI 固定写入当前目录的 `review-report.md`，没有 output 选项或覆盖策略。 |
| R-13 产品定位/信任边界 | 属实 | README 要求做出选择，但代码和文档尚未落地统一决策。 |
| R-14 测试覆盖不足 | 属实 | 当前只有一个 Markdown happy-path 测试。 |
| R-15 父级配置干扰 | 属实（环境条件性） | 嵌套在上级 Vite/Wrangler 项目时可复现；独立根目录运行不受该问题影响。 |
| R-16 构建产物/bin 不一致 | 属实 | 构建生成 `dist/src/cli.js`，`bin` 声明为 `dist/cli.js`。 |
| R-17 质量门禁/发布缺口 | 属实（产品条件性） | 当前缺少 lint/CI/入口 smoke test；是否需要 npm 发布要由产品定位决定。 |
| R-18 依赖范围漂移 | 属实（当前被 lockfile 缓解） | 多个依赖使用 `^`，lockfile 可复现当前安装但不能替代升级策略。 |

## 2. 已核验的证据

| 检查 | 结果 | 结论 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 当前 TypeScript 类型检查通过，但 `src/mcp-server.ts` 使用 `input: any`，编译器无法发现字段错位。 |
| `npm test -- --reporter=verbose` | 通过 | 1 个测试文件、1 个测试用例；覆盖范围很窄。 |
| `npm run build` | 通过 | 产物生成在 `dist/src/*.js` 和 `dist/test/*.js`。 |
| 构建入口 | 不一致 | `package.json` 的 `bin` 指向 `dist/cli.js`，实际产物为 `dist/src/cli.js`。 |
| `npm ls --depth=0` | 通过 | 依赖可解析。 |
| `npm audit --omit=dev --package-lock-only --audit-level=moderate` | 通过 | 当前生产依赖未发现 advisory；不代表应用行为安全。 |
| MCP `initialize` | 通过 | stdio MCP 服务能够完成协议握手。 |
| MCP `review_repository` 调用 | 契约错误 | 按公开 schema 传 `repo_path` 后，报告标题为 `Review Report: undefined`，请求路径被忽略。 |
| CLI `--validate false` | 失败并中止 | 返回 `Fatal error`，没有把失败命令转换成 `status: failed` 的报告结果。 |

## 3. MCP 优先执行任务

以下任务是当前最小且完整的 MCP 修复范围。若时间有限，先完成 T-01、T-02、T-04，再决定是否纳入 T-03 的安全策略实现。

### T-01 [P0] 修复 MCP 输入契约和路径错位

- 关联调查：R-01、R-13、R-14
- 问题：schema 暴露 `repo_path`，handler 却读取 `input.repoPath`；handler 使用 `any`，无法在编译期保护契约。
- 对策：
  - 使用 `input.repo_path` 映射到 core 的 `repositoryPath`；
  - 用 Zod 推导的输入类型替换 `any`；
  - 明确 `baseRef`、验证命令和输出格式是否属于 MCP 的公开契约；未实现的字段不要继续宣传。
- 验收标准：
  - MCP 客户端按公开 schema 传入一个与服务当前目录不同的 Git 仓库路径，返回结果确实来自该仓库；
  - 不存在、非 Git 或无权限路径收到明确的 MCP 错误，不会静默改查服务当前目录；
  - `npm run typecheck` 通过。

### T-02 [P1] 将验证失败变成结构化 MCP 结果

- 关联调查：R-03、R-11、R-14
- 问题：验证命令非零退出会 reject，导致整个 MCP 调用失败，后续验证也不再执行；`ValidationResult` 虽声明 `failed`，实际永远返回不了该状态。
- 对策：
  - 将非零退出映射为 `status: "failed"`；
  - 继续执行后续验证命令；
  - 区分“命令失败”和“审查基础设施失败”（路径不存在、无法启动进程等）；
  - MCP 返回包含失败状态的完整报告，基础设施错误才使用 MCP error。
- 验收标准：
  - 一个命令失败、一个命令成功时，响应同时包含两项结果；
  - 响应中包含可诊断的 stderr/退出信息；
  - 不因普通测试失败而返回未处理的 Node stack trace。

### T-03 [P0/P1] 明确并落实验证命令的信任边界

- 关联调查：R-02、R-04、R-11、R-13
- 问题：`exec(command, { cwd })` 允许调用方执行任意 shell；MCP 被 AI 客户端调用时，调用者可读取环境、访问网络、删除文件或启动后台进程。
- 先做决策：
  - **安全默认方案（推荐）**：MCP 只接受预定义验证 profile/命令白名单；任意 shell 需要显式 opt-in；或
  - **受信任本机方案**：保留任意命令，但在 README、MCP 描述和 `SUBMISSION.md` 中明确这是本机受信任调用能力，不提供远程安全边界。
- 无论选择哪一方案，都应补充：单命令 timeout、输出上限、命令数量/长度限制、取消/终止行为、退出码、耗时和截断状态。
- 若保留 shell：记录这是有意保留的高权限能力，并优先考虑 `execFile`/结构化命令参数，避免额外的 shell 拼接。
- 验收标准：
  - 默认行为和信任边界在文档中可见；
  - 超时、超大输出和进程终止都能返回结构化结果；
  - 不会无限挂起 MCP 调用；
  - 测试证明安全模式拒绝未授权的任意命令（如果选择安全默认方案）。

### T-04 [P1] 稳定 MCP 响应和错误契约

- 关联调查：R-05、R-08、R-10、R-13
- 问题：MCP 当前只返回一段 Markdown；core 的 `format` 类型却没有真正实现；Git 底层异常会直接向上冒泡，动态输出也没有截断/转义策略。
- 对策：
  - 明确 MCP 当前响应是 Markdown，或实现结构化 JSON/Markdown 两种 serializer；
  - 为路径、Git ref、报告内容和命令输出定义校验与长度上限；
  - 将无效仓库、无效 base ref、验证失败、超时分别映射为可理解的结果/错误；
  - 避免把敏感的底层 stack trace 直接返回给 MCP 客户端。
- 验收标准：
  - 客户端可以根据稳定契约判断成功、验证失败和基础设施错误；
  - 非法路径/ref 不会返回“成功但内容为空”的歧义结果；
  - Markdown 代码围栏不会被命令输出提前关闭，超长输出会被标记为截断。

### T-05 [P1] 添加 MCP 契约测试

- 关联调查：R-01、R-03、R-04、R-14
- 对策：建立临时 Git fixture 或隔离仓库，测试 MCP server 的初始化、工具发现和 `review_repository` 调用；覆盖成功、错误路径、验证失败、超时/输出上限（如实现）和多命令场景。
- 验收标准：
  - 测试不依赖当前项目的 Git 状态或工作目录；
  - 至少有一次真实 JSON-RPC/SDK 调用，而不仅是直接调用内部函数；
  - 测试能在项目根目录和干净 CI 环境运行。

### T-06 [P1] 完成 MCP-first 说明和提交记录

- 关联调查：R-13、README、SUBMISSION.md
- 对策：在 README 与 [SUBMISSION.md](/Users/sailstellar/Documents/ai-repo-inspector/SUBMISSION.md) 中说明：
  - MCP 的主要用户和运行环境；
  - 仓库路径、验证命令和环境变量的信任边界；
  - latency、上下文长度、输出大小和发现性的取舍；
  - 哪些 CLI 行为未纳入本次 MCP-first 范围，以及什么证据会促使重新支持 CLI parity；
  - 至少一个被修正或拒绝的 AI 建议。
- 验收标准：读者不需要猜测 MCP 是否可以执行任意命令、失败是否会中止、报告格式是否稳定。

## 4. 后续任务（不阻塞本轮 MCP-first 范围）

### T-07 [P1] 修复 CLI 参数和验证行为

- 关联调查：R-03、R-05、R-06、R-07、R-12、R-14
- 任务：修复带空格路径、缺失值、未知参数、非法 format、输出位置和验证失败处理；实现 JSON，或删除/拒绝未实现的 JSON 选项。
- 验收标准：CLI 的参数和错误契约有测试，且与 core/MCP 的结果语义一致。

### T-08 [P1] 加固 Git 输入和变更解析

- 关联调查：R-08、R-09、R-14
- 任务：校验仓库目录和 ref；处理默认分支、浅克隆和无共同祖先；使用稳定的机器可读格式解析 rename/copy；明确是否包含 untracked 文件。
- 验收标准：added/deleted/modified/rename/copy/untracked 和非法 ref 都有隔离测试及可读错误。

### T-09 [P1] 改进报告安全和输出控制

- 关联调查：R-10、R-11、R-12
- 任务：分别保存 stdout/stderr；处理 Markdown 特殊字符和动态代码围栏；对敏感信息做明确策略；增加输出上限、截断标记和 `--output`/stdout 选择。
- 验收标准：恶意路径/输出不会破坏报告结构，报告大小受控，覆盖文件行为明确。

### T-10 [P1] 修复构建产物和 npm bin

- 关联调查：R-16、R-17
- 任务：统一 `rootDir`/`outDir` 与 `package.json.bin`，或把 bin 指向实际的 `dist/src/cli.js`；增加构建后入口 smoke test。
- 验收标准：`npm run build` 后直接执行声明的 `inspector` 入口成功。

### T-11 [P2] 增加独立测试配置和质量门禁

- 关联调查：R-15、R-17、R-18
- 任务：增加独立 Vitest 配置；补充 `check`、lint/format（若采用）、CI、构建检查和 lockfile 安装策略；明确是否需要 npm 发布。
- 验收标准：项目嵌套在其他工作区时仍能从自身根目录稳定测试；CI 可重复执行 typecheck、test、build 和入口检查。

## 5. 推荐执行顺序

### 最小 MCP 交付

1. T-01：修复 `repo_path` 契约并移除 `any`。
2. T-02：结构化验证失败，避免普通失败中止整次调用。
3. T-04：定义响应和错误边界。
4. T-05：增加 MCP 端到端/契约测试。
5. T-06：记录 MCP-first 决策、风险和未完成项。

### 时间足够时

6. T-03：加入显式安全模式或完整的受信任本机边界与资源限制。
7. T-07 至 T-11：作为后续 backlog，不为了追求改动数量而挤压 MCP 核心验收。

## 6. 本轮非目标

- 不在本轮直接修改 `src/`、`package.json` 或测试代码；
- 不把 CLI 的全部问题假装已经解决；
- 不把 `npm audit` 通过误写成应用已经安全；
- 不把 MCP stdio 服务误写成 HTTP 服务；
- 不在没有明确产品决策和安全边界的情况下开放远程/不受信任调用。

## 7. 完成定义

- [ ] T-01、T-02、T-04、T-05 已完成并有自动化证据；
- [ ] T-03 的信任边界和资源限制已实现或明确记录为已知限制；
- [ ] `npm run typecheck`、`npm test`、`npm run build` 均通过；
- [ ] MCP 客户端按公开 schema 传入 `repo_path` 时检查目标正确；
- [ ] 验证失败能作为结构化结果返回；
- [ ] `SUBMISSION.md` 说明了选择、取舍、未完成项、AI 使用和验证结果；
- [ ] 变更提交到个人公开仓库的正确分支，未误推送到 `upstream`。
