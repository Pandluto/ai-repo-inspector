# ai-repo-inspector 修复任务清单

> 本文根据 `research.md` 生成，最初用于整理事实、优先级、对策和验收标准。下面的状态已按修复分支截至 2026-07-31 的最新提交更新。
>
> 调研日期：2026-07-31  
> 当前项目：`/Users/sailstellar/Documents/ai-repo-inspector`  
> 初始建议执行范围：MCP-first。当前状态见下方“最新状态”；CLI 的完整 parity 和不受信任环境下的 Shell 隔离仍是后续任务。

## 最新状态（截至 2026-07-31）

- 已完成：T-01、T-02、T-04、T-05、T-06。
- 已部分完成：T-03。当前有显式 Shell opt-in、命令数量/长度限制、超时和输出上限，但仍是受信任本地能力，不是沙箱。
- 后续提交已完成：T-08 的默认分支、无共同祖先、rename/copy/untracked Git 处理；T-10 的 npm bin 和构建后 CLI 入口 smoke test；T-11 的独立测试配置和 CI quality gate。
- 仍待处理：T-07（CLI 参数与 JSON）、T-09（CLI 输出文件/接口策略）；T-11 还剩 lint/format 选择和是否公开发布 npm 包的产品决策。

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
| R-08 Git base/ref 边界 | 初始问题属实，主要问题已修复 | `8523159` 增加了仓库校验、默认分支探测、无共同祖先回退和清晰的 ref 错误；浅克隆等更复杂 Git 情况仍需继续验证。 |
| R-09 Git 状态解析不完整 | 初始问题属实，主要问题已修复 | `8523159` 使用 NUL 分隔解析 rename/copy，并纳入非忽略 untracked 文件；特殊 Git 状态仍应继续补测试。 |
| R-10 Markdown 未转义/输出过大 | 属实（有条件） | 动态内容确实未转义/限长；实际渲染危害取决于下游 Markdown 渲染器。 |
| R-11 stderr 丢失/敏感信息 | 属实 | `stdout || stderr` 会丢弃另一条流，输出也可能原样包含敏感内容。 |
| R-12 输出文件固定覆盖 | 属实 | CLI 固定写入当前目录的 `review-report.md`，没有 output 选项或覆盖策略。 |
| R-13 产品定位/信任边界 | 属实 | README 要求做出选择，但代码和文档尚未落地统一决策。 |
| R-14 测试覆盖不足 | 起点属实，当前已改善 | 起点只有一个 Markdown happy-path 测试；当前有 4 个 Vitest 测试文件、15 个测试，并另有 CLI 入口 smoke test。 |
| R-15 父级配置干扰 | 属实（环境条件性） | 嵌套在上级 Vite/Wrangler 项目时可复现；独立根目录运行不受该问题影响。 |
| R-16 构建产物/bin 不一致 | 初始问题属实，已修复 | `2b37292` 将 `bin` 指向实际的 `dist/src/cli.js`，并增加构建后入口 smoke test。 |
| R-17 质量门禁/发布缺口 | 初始问题已部分修复 | `0f810db` 增加 `npm run check`、push/PR/manual CI 和构建入口 smoke test；lint/format、是否公开 npm 发布仍由产品定位决定。 |
| R-18 依赖范围漂移 | 属实（当前被 lockfile 缓解） | 多个依赖使用 `^`，lockfile 可复现当前安装但不能替代升级策略。 |

## 2. 已核验的证据

| 检查 | 结果 | 结论 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 当前 TypeScript 类型检查通过，MCP handler 已使用 Zod 推导的输入类型。 |
| `npm test -- --reporter=verbose` | 通过 | 4 个 Vitest 测试文件、15 个测试；覆盖 MCP 契约、验证限制、报告安全和 Git 边界。 |
| `npm run build` | 通过 | 产物生成在 `dist/src/*.js` 和 `dist/test/*.js`。 |
| 构建入口 | 通过 | `package.json` 的 `bin` 已指向 `dist/src/cli.js`，`npm run test:entry` 通过。 |
| `npm run check` | 通过 | 统一运行 typecheck、Vitest、构建后入口 smoke test 和 `npm pack --dry-run`；CI 已调用该门禁。 |
| `npm ls --depth=0` | 通过 | 依赖可解析。 |
| `npm audit --omit=dev --package-lock-only --audit-level=moderate` | 通过 | 当前生产依赖未发现 advisory；不代表应用行为安全。 |
| MCP `initialize` | 通过 | stdio MCP 服务能够完成协议握手。 |
| MCP `review_repository` 调用（初始基线） | 契约错误，已修复 | 初始按公开 schema 传入 `repo_path` 时返回 `Review Report: undefined`；当前真实 MCP 回归测试确认会检查传入仓库。 |
| CLI `--validate false`（初始基线） | 失败并中止 | CLI 的原始行为仍是后续工作；MCP 路径已把失败命令转换为 `status: failed`，并继续执行后续命令。 |

## 3. MCP 优先执行任务

以下任务是最初定义的最小 MCP 修复范围；截至当前分支，完成情况已在各标题和“最新状态”中标注。

### T-01 [P0] 修复 MCP 输入契约和路径错位（已完成）

- 关联调查：R-01、R-13、R-14
- 问题：schema 暴露 `repo_path`，handler 却读取 `input.repoPath`；handler 使用 `any`，无法在编译期保护契约。
- 当前结果：已改用 `input.repo_path` 和 Zod 推导类型，并补充真实 MCP 调用回归测试。
- 对策：
  - 使用 `input.repo_path` 映射到 core 的 `repositoryPath`；
  - 用 Zod 推导的输入类型替换 `any`；
  - 明确 `baseRef`、验证命令和输出格式是否属于 MCP 的公开契约；未实现的字段不要继续宣传。
- 验收标准：
  - MCP 客户端按公开 schema 传入一个与服务当前目录不同的 Git 仓库路径，返回结果确实来自该仓库；
  - 不存在、非 Git 或无权限路径收到明确的 MCP 错误，不会静默改查服务当前目录；
  - `npm run typecheck` 通过。

### T-02 [P1] 将验证失败变成结构化 MCP 结果（已完成）

- 关联调查：R-03、R-11、R-14
- 问题：验证命令非零退出会 reject，导致整个 MCP 调用失败，后续验证也不再执行；`ValidationResult` 虽声明 `failed`，实际永远返回不了该状态。
- 当前结果：非零退出现在产出 `status: "failed"`，保留 stdout/stderr、退出码和超时状态，并继续执行后续命令。
- 对策：
  - 将非零退出映射为 `status: "failed"`；
  - 继续执行后续验证命令；
  - 区分“命令失败”和“审查基础设施失败”（路径不存在、无法启动进程等）；
  - MCP 返回包含失败状态的完整报告，基础设施错误才使用 MCP error。
- 验收标准：
  - 一个命令失败、一个命令成功时，响应同时包含两项结果；
  - 响应中包含可诊断的 stderr/退出信息；
  - 不因普通测试失败而返回未处理的 Node stack trace。

### T-03 [P0/P1] 明确并落实验证命令的信任边界（部分完成）

- 关联调查：R-02、R-04、R-11、R-13
- 问题：`exec(command, { cwd })` 允许调用方执行任意 shell；MCP 被 AI 客户端调用时，调用者可读取环境、访问网络、删除文件或启动后台进程。
- 当前结果：MCP 只有在 `allow_shell_validation: true` 时才接受验证命令，并有命令数量、长度、超时和输出上限；仍未提供沙箱。
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

### T-04 [P1] 稳定 MCP 响应和错误契约（已完成本轮范围）

- 关联调查：R-05、R-08、R-10、R-13
- 问题：MCP 当前只返回一段 Markdown；core 的 `format` 类型却没有真正实现；Git 底层异常会直接向上冒泡，动态输出也没有截断/转义策略。
- 当前结果：当前 MCP 契约仍是 Markdown，但仓库/ref 错误会返回可读错误，报告对动态内容做转义、脱敏和截断；JSON serializer 仍未实现。
- 对策：
  - 明确 MCP 当前响应是 Markdown，或实现结构化 JSON/Markdown 两种 serializer；
  - 为路径、Git ref、报告内容和命令输出定义校验与长度上限；
  - 将无效仓库、无效 base ref、验证失败、超时分别映射为可理解的结果/错误；
  - 避免把敏感的底层 stack trace 直接返回给 MCP 客户端。
- 验收标准：
  - 客户端可以根据稳定契约判断成功、验证失败和基础设施错误；
  - 非法路径/ref 不会返回“成功但内容为空”的歧义结果；
  - Markdown 代码围栏不会被命令输出提前关闭，超长输出会被标记为截断。

### T-05 [P1] 添加 MCP 契约测试（已完成本轮范围）

- 关联调查：R-01、R-03、R-04、R-14
- 对策：建立临时 Git fixture 或隔离仓库，测试 MCP server 的初始化、工具发现和 `review_repository` 调用；覆盖成功、错误路径、验证失败、超时/输出上限（如实现）和多命令场景。
- 当前结果：已建立临时仓库和真实 SDK/stdio 调用测试，并补充验证、报告和 Git 的隔离测试；当前 Vitest 为 4 个文件、15 个测试。
- 验收标准：
  - 测试不依赖当前项目的 Git 状态或工作目录；
  - 至少有一次真实 JSON-RPC/SDK 调用，而不仅是直接调用内部函数；
  - 测试能在项目根目录和干净 CI 环境运行。

### T-06 [P1] 完成 MCP-first 说明和提交记录（已完成本轮范围）

- 关联调查：R-13、README、SUBMISSION.md
- 对策：在 README 与 [SUBMISSION.md](/Users/sailstellar/Documents/ai-repo-inspector/SUBMISSION.md) 中说明：
  - MCP 的主要用户和运行环境；
  - 仓库路径、验证命令和环境变量的信任边界；
  - latency、上下文长度、输出大小和发现性的取舍；
  - 哪些 CLI 行为未纳入本次 MCP-first 范围，以及什么证据会促使重新支持 CLI parity；
  - 至少一个被修正或拒绝的 AI 建议。
- 当前结果：中英文提交说明、手测记录和本任务清单均已按最新实现更新。
- 验收标准：读者不需要猜测 MCP 是否可以执行任意命令、失败是否会中止、报告格式是否稳定。

## 4. 后续任务（不阻塞本轮 MCP-first 范围）

### T-07 [P1] 修复 CLI 参数和验证行为

- 关联调查：R-03、R-05、R-06、R-07、R-12、R-14
- 任务：修复带空格路径、缺失值、未知参数、非法 format、输出位置和验证失败处理；实现 JSON，或删除/拒绝未实现的 JSON 选项。
- 验收标准：CLI 的参数和错误契约有测试，且与 core/MCP 的结果语义一致。

### T-08 [P1] 加固 Git 输入和变更解析（主要范围已完成）

- 关联调查：R-08、R-09、R-14
- 任务：校验仓库目录和 ref；处理默认分支、浅克隆和无共同祖先；使用稳定的机器可读格式解析 rename/copy；明确是否包含 untracked 文件。
- 当前结果：已覆盖仓库/ref 校验、默认分支、无共同祖先、rename/copy 和非忽略 untracked；浅克隆仍是后续边界测试。
- 验收标准：added/deleted/modified/rename/copy/untracked 和非法 ref 都有隔离测试及可读错误。

### T-09 [P1] 改进报告安全和输出控制

- 关联调查：R-10、R-11、R-12
- 任务：分别保存 stdout/stderr；处理 Markdown 特殊字符和动态代码围栏；对敏感信息做明确策略；增加输出上限、截断标记和 `--output`/stdout 选择。
- 验收标准：恶意路径/输出不会破坏报告结构，报告大小受控，覆盖文件行为明确。

### T-10 [P1] 修复构建产物和 npm bin（已完成本轮范围）

- 关联调查：R-16、R-17
- 任务：统一 `rootDir`/`outDir` 与 `package.json.bin`，或把 bin 指向实际的 `dist/src/cli.js`；增加构建后入口 smoke test。
- 当前结果：`bin` 已指向 `dist/src/cli.js`，`npm run test:entry` 已通过。
- 验收标准：`npm run build` 后直接执行声明的 `inspector` 入口成功。

### T-11 [P2] 增加独立测试配置和质量门禁（主要范围已完成）

- 关联调查：R-15、R-17、R-18
- 任务：增加独立 Vitest 配置；补充 `check`、lint/format（若采用）、CI、构建检查和 lockfile 安装策略；明确是否需要 npm 发布。
- 当前结果：独立 Vitest 配置和 CI quality gate 已加入，CI 会运行 `npm run check`；lint/format 和是否公开发布 npm 包仍待决定。
- 验收标准：项目嵌套在其他工作区时仍能从自身根目录稳定测试；CI 可重复执行 typecheck、test、build 和入口检查。

## 5. 初始推荐执行顺序

### 最小 MCP 交付

1. T-01：修复 `repo_path` 契约并移除 `any`。
2. T-02：结构化验证失败，避免普通失败中止整次调用。
3. T-04：定义响应和错误边界。
4. T-05：增加 MCP 端到端/契约测试。
5. T-06：记录 MCP-first 决策、风险和未完成项。

### 时间足够时

6. T-03：加入显式安全模式或完整的受信任本机边界与资源限制（当前已完成 opt-in 和资源限制，沙箱仍未做）。
7. T-07 至 T-11：作为后续 backlog，不为了追求改动数量而挤压 MCP 核心验收。

## 6. 本轮范围边界

- 本轮以 MCP-first 为主，Git 边界和构建入口的高风险问题随后一并补上；
- 不把 CLI 的全部问题假装已经解决；
- 不把 `npm audit` 通过误写成应用已经安全；
- 不把 MCP stdio 服务误写成 HTTP 服务；
- 不在没有明确产品决策和安全边界的情况下开放远程/不受信任调用。

## 7. 完成定义

- [x] T-01、T-02、T-04、T-05 已完成并有自动化证据；
- [x] T-03 的信任边界和资源限制已实现或明确记录为已知限制；
- [x] `npm run typecheck`、`npm test`、`npm run build` 和 `npm run test:entry` 均通过；
- [x] MCP 客户端按公开 schema 传入 `repo_path` 时检查目标正确；
- [x] 验证失败能作为结构化结果返回；
- [x] `SUBMISSION.md` 说明了选择、取舍、未完成项、AI 使用和验证结果；
- [ ] 变更已推送到个人公开仓库的正确分支，未误推送到 `upstream`（本轮只提交本地文档更新）。
