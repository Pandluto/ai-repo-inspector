# 提交说明

## 我先调查了什么，为什么？

我先读了 `README.md`、`SUBMISSION.md` 和源码，先搞清楚这个工具应该做什么，再决定改哪里。

接着我顺着主流程看了一遍：Git 改动检测、验证命令、报告生成、CLI 入口和 MCP 入口。

我先跑了现有检查：

- `npm run typecheck` 通过。
- `npm test -- --reporter=verbose` 通过：1 个测试文件、1 个测试用例。
- `npm run build` 通过，但实际生成的是 `dist/src/cli.js`，包配置指向的是 `dist/cli.js`。
- `npm audit --omit=dev --package-lock-only --audit-level=moderate` 没发现已知的生产依赖漏洞。
- MCP 服务可以启动，`initialize` 和 `tools/list` 都能正常返回。
- 按公开说明用 `repo_path` 做真实 MCP 调用时，返回了 `Review Report: undefined`，说明服务没有使用传入的路径。
- CLI 执行 `--validate false` 时直接报 `Fatal error`，没有把失败的检查写进报告。

这样我先有了一个明确的基线，也能区分“启动不了”和“启动了但行为不对”。

## 选择做什么实现或修复？

这次我选择 MCP-first。简单说，就是先把 MCP 服务这条路跑稳。

我先选了这些修复：

1. 修好 `repo_path`/`repoPath` 字段不一致的问题，并去掉没有类型保护的 `any`。
2. 仓库路径缺失或无效时直接报清楚，不要悄悄检查 MCP 服务自己的当前目录。
3. 检查命令失败时返回失败结果，并继续执行后面的检查。
4. 让 MCP 的错误信息说得明白，并用真实的 MCP 调用补测试。
5. 说清楚调用方能执行什么，并限制超时和过大的命令输出。

MCP 实现和回归测试已经在修复分支完成。实现提交包括：43ebfcc（仓库和请求校验）、eba498f（结构化验证失败）、7380b95（验证加固和输出安全）。

## 有意没有做什么？

我没有试图一次把所有问题都解决。CLI 参数解析、Git 的重命名/未跟踪文件处理、报告格式、npm 打包和 CI 都先放到后面。

CLI 仍然保留，但在它经过同样的测试和整理之前，我不会声称 CLI 和 MCP 一样可靠。

## 接口决策

- 决定（Decision）：这次先做 MCP-first，也就是先把 MCP 服务这条路跑稳。
- 主要用户和运行环境（Primary user and execution environment）：本地 AI 编程工具，通过 stdio 连接本地 MCP 服务，检查本地 Git 仓库。
- 信任边界和允许的能力（Trust boundary and allowed capabilities）：调用方会传仓库路径，目前也可以传 Shell 命令。这个能力权限很高，所以当前只假设调用方是本机受信任的客户端。如果以后要支持不受信任的调用方，就需要命令白名单，或者明确 opt-in 并做隔离。
- 可靠性、发现性、延迟/上下文和输出取舍（Reliability, discoverability, latency/context, and output tradeoffs）：MCP 对 AI 客户端来说容易发现、容易调用，但命令输出很容易把报告撑得过大。我希望检查失败能清楚地返回，而不是让整个审查直接中断；底层 stack trace 也不应该原样返回给调用方。
- 继续支持的接口如何保持一致（How supported interfaces remain consistent）：MCP 和共享 core 应该使用同一套请求/结果格式。在 CLI 还没有整理到同一水平前，文档不能暗示两者同样可靠。
- 什么证据会改变这个决定（Evidence that would change this decision）：如果主要用户其实是直接在终端里工作的开发者，或者最终必须发布成独立命令行工具，我会重新考虑 CLI-first 或 hybrid。

## 如何使用 AI 编程代理？

我用 AI 编程代理阅读代码、追踪数据流、运行检查、实际测试 MCP 协议、对照源码核查已有调查，并把结果整理成 research.md 和 tasks.md。两个委派实现尝试偏离了范围，我停止了它们、检查并清理了无关改动，随后在修复分支上直接完成 MCP 修复。

## 在哪里检查、修正或拒绝了 AI 建议？（必填）

最初有人把 MCP 路径问题解释成“调用一定会失败”。我用 JSON-RPC 实际调用后发现，更危险的情况是服务可能检查自己的当前目录，最后返回标题为 `Review Report: undefined` 的报告。因此我把结论改成了“静默检查错误目录”。

我也核对了 Node 的 exec 行为。最终实现增加了明确的超时、输出缓冲区、命令数量和命令长度限制，并要求 MCP Shell 验证显式 opt-in。

## 用过哪些命令验证，结果是什么？

- `npm install` — 依赖安装成功。
- `npm run typecheck` — 通过。
- `npm test -- --reporter=verbose` — 通过；3 个测试文件、11 个测试用例。
- `npm run build` — 通过；发现构建产物路径和 bin 配置不一致。
- `npm ls --depth=0` — 通过。
- `npm audit --omit=dev --package-lock-only --audit-level=moderate` — 通过，没有已知生产依赖漏洞。
- `npm run mcp-server` — MCP 服务成功通过 stdio 启动。
- MCP `initialize` / `tools/list` — 通过。
- 使用 `repo_path` 调用 MCP `review_repository` — 基线重现路径被忽略的问题，最终回归测试通过。
- `npm run inspector -- review --repo . --base-ref main --validate false` — 基线重现验证失败直接中止，MCP 现在会返回结构化 failed 结果并继续执行。

## 遇到什么阻塞，怎么处理？

仓库之前临时放在无关的 `study-map` 项目里面，Vitest 自动读到了上级项目的 Vite/Wrangler 配置，还没开始跑测试就失败了。我把仓库作为独立项目根目录运行，重新检查后通过，并把这个上级配置干扰单独记录成后续任务。

## 已知限制和接下来的三个动作

目前的限制是：

- CLI 参数解析和 CLI/MCP 行为一致性仍待后续处理。
- Git 重命名、复制和未跟踪文件处理仍待后续处理。
- npm bin/build 布局和 CI/发布流程仍待后续处理。
- Shell 验证仍然是高权限本地能力；MCP 已要求显式 opt-in，但未来如果远程或不受信任部署，需要命令白名单或更强隔离。

接下来我会做三件事：

1. 让 CLI 参数解析和 CLI 输出契约与 MCP 结果模型保持一致。
2. 改进 Git 边界状态解析和默认 base ref 行为。
3. 修复 npm bin/build 布局并增加 CI 质量门禁。

## 大致集中工作时间

- 开始（Start）：2026-07-31（调查和实现检查点）
- 结束（Finish）：2026-07-31（MCP 实现和最终验证完成）
