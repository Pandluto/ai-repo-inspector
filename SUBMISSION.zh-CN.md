# 提交说明

## 我先调查了什么，为什么？

我先读了 `README.md`、`SUBMISSION.md` 和源码，先搞清楚这个工具承诺做什么，再决定改哪里。

接着我顺着主流程看了一遍：Git 改动检测、验证命令、报告生成、CLI 入口和 MCP 入口。最初的基线里有两个关键问题：

- MCP schema 对外暴露的是 `repo_path`，handler 却读取 `repoPath`。真实调用可能因此检查服务自己的当前目录，并返回 `Review Report: undefined`。
- 验证命令失败会直接中止审查，而不是把失败写进报告。

原始题库只有一个报告生成的 happy-path 测试。修复后，这个分支有 4 个 Vitest 测试文件、15 个通过的测试，另外还有一个针对构建后 CLI 入口的 smoke test。

## 选择做什么实现或修复？

这次我选择 MCP-first，也就是先把 MCP 服务这条路跑稳，同时把 CLI 作为后续接口。

实际完成的修复包括：

1. 校验 MCP 输入，正确使用公开的 `repo_path` 字段。
2. 仓库或 base ref 无效时返回清楚的错误，不再悄悄检查服务自己的当前目录。
3. 保留验证失败结果，并继续执行后面的检查。
4. 增加 Shell 验证的显式 opt-in、命令数量/长度限制、超时、输出限制，以及分开的 stdout/stderr。
5. 对报告中的 Markdown 做转义，对常见 secret 做脱敏，并截断过大的输出。
6. 处理 Git rename、copy、未跟踪文件、非 `main` 默认分支和没有共同祖先的历史。
7. 修复构建后的 CLI bin 路径，并增加入口 smoke test。

主要实现提交是 `43ebfcc`、`eba498f`、`7380b95`、`8523159` 和 `2b37292`。质量门禁和受保护的发布流程在 `0f810db`。对应测试在 `test/mcp-server.test.ts`、`test/validation.test.ts`、`test/report.test.ts`、`test/git.test.ts` 和 `test/cli-entry-smoke.mjs` 中。

## 有意没有做什么？

我没有试图在这段时间里重做所有接口。CLI 还留有后续问题：手写参数解析对部分错误输入和带空格路径处理不够好，`json` 类型也还没有真正由 core 实现。MCP 的 Shell 能力已经要求显式 opt-in，但它仍是受信任的本地能力，不是给不受信任远程调用方用的沙箱。

我没有发布 npm 包。包仍然保持 `private`；`0f810db` 增加了 push、pull request 和手动触发的 CI 检查，也增加了按 tag 触发、且在包为 private 时拒绝发布的保护流程。

## 接口决策

- 决定（Decision）：这次先做 MCP-first，也就是先把 MCP 服务这条路跑稳。
- 主要用户和运行环境（Primary user and execution environment）：本地 AI 编程工具，通过 stdio 连接本地 MCP 服务，检查本地 Git 仓库。
- 信任边界和允许的能力（Trust boundary and allowed capabilities）：调用方传入仓库路径；只有显式 opt-in 才能请求 Shell 验证。这仍然是高权限的本地能力。如果未来面向远程或不受信任调用方，需要命令白名单或更强的进程隔离。
- 可靠性、发现性、延迟/上下文和输出取舍（Reliability, discoverability, latency/context, and output tradeoffs）：MCP 容易被 AI 客户端发现和调用。现在报告会保留 stdout/stderr、状态、退出码、超时状态，并限制输出大小，既方便诊断，也避免命令输出无限撑大上下文。
- 继续支持的接口如何保持一致（How supported interfaces remain consistent）：MCP 和共享 core 使用同一套仓库、验证和报告模型。CLI 仍然存在，但它的参数解析和 JSON 输出还要后续处理；文档不会声称 CLI 和 MCP 已经完全等价。
- 什么证据会改变这个决定（Evidence that would change this decision）：如果主要用户变成直接在终端里工作的开发者，或者必须发布成独立命令行工具，我会重新考虑 CLI-first 或 hybrid。

## 如何使用 AI 编程代理？

我用 AI 编程代理检查仓库、追踪数据流、编写和审查测试、实际调用 MCP、对照源码核查方案，并更新调查、任务清单和提交说明。我根据真实测试结果逐项检查改动，把范围控制在 MCP-first 决策内，没有把所有清理工作都塞进来。

## 在哪里检查、修正或拒绝了 AI 建议？（必填）

最初有人把 MCP 路径问题解释成“调用一定会失败”。我用 JSON-RPC 实际调用后发现，更危险的情况是服务可能检查自己的当前目录，最后返回标题为 `Review Report: undefined` 的报告。因此我把结论改成了“静默检查错误目录”。

手测还发现：如果不传 `baseRef`，只有 `master` 分支的仓库会失败。这个发现后来促成了 `8523159` 中的默认分支处理和回归测试，而不是把它留成没有说明的限制。

## 用过哪些命令验证，结果是什么？

- `npm run typecheck` — 通过。
- `npm test -- --reporter=verbose` — 通过；4 个测试文件、15 个测试用例。
- `npm run build` — 通过。
- `npm run test:entry` — 通过；构建 `dist/src/cli.js` 并运行 CLI 入口 smoke test。
- `npm run check` — 通过；它会跑类型检查、完整测试、构建后入口 smoke test 和 `npm pack --dry-run`。
- `npm ls --depth=0` — 通过。
- `npm audit --omit=dev --package-lock-only --audit-level=moderate` — 通过，没有已知生产依赖漏洞。
- 使用 `Client` + `StdioClientTransport` 的真实 MCP 客户端 — 工具发现、正常/错误仓库调用、错误 base ref、Shell opt-in、失败检查继续执行、命令限制均通过。
- `npm run inspector -- review --repo . --base-ref main --validate false` — 重现了原始 CLI 失败行为；MCP 现在会返回结构化 failed 结果并继续执行。

## 遇到什么阻塞，怎么处理？

仓库之前临时放在无关的 `study-map` 项目里面，Vitest 自动读到了上级项目的 Vite/Wrangler 配置，还没开始跑测试就失败了。我把仓库作为独立项目根目录运行，增加独立 Vitest 配置，重新检查后通过，并把这个环境问题单独记录下来。

## 已知限制和接下来的三个动作

目前的限制是：

- CLI 参数校验和 CLI/MCP 输出一致性还没完成；`json` 目前只是声明了类型，还没有真正的 serializer。
- Shell 验证已经 opt-in 且有限制，但还不是沙箱。如果信任模型扩大到远程或不受信任调用方，需要更强的策略。
- CI 现在已经运行质量门禁，但 npm 包仍然有意保持 private，还没有发布。

接下来我会做三件事：

1. 把 CLI 参数解析做严格，并实现 JSON 输出，或者删掉未实现的 format 选项。
2. 决定是否实现已经声明的 JSON 输出、是否把包改成公开包；只有做出这个决定后才启用真正的 npm 发布。
3. 如果未来要支持非本地受信任客户端，用命令白名单/profile 和隔离机制替代任意 Shell。

## 大致集中工作时间

- 开始（Start）：2026-07-31
- 结束（Finish）：2026-07-31
