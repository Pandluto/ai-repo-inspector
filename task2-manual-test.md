# Task 2 — Git 变更解析手动测试记录

## 测试目的

确认 Task 2 的 Git 变更解析修复已经通过真实 MCP 调用，并验证报告不会遗漏
rename、copy、untracked 等变更类型。

本次测试针对修复分支 `codex/ai-repo-inspector-fixes` 进行。核心修复提交为
`8523159`；当前分支还包含 npm 入口和 CI/CD 配置提交，但本次不测试 CI/CD
workflow，也不执行真实 npm 发布。

## 测试方式

使用真实 MCP 客户端连接 stdio 服务：

- `Client`
- `StdioClientTransport`
- 服务入口：`src/mcp-server.ts`
- 通过 `tsx` 启动服务

测试脚本为一次性 Node 手动验收脚本，创建隔离的临时 Git 仓库，执行 MCP
`initialize`、`tools/list` 和 `tools/call`，测试结束后清理所有临时仓库。

## 测试结果

| 场景 | 结果 | 观察 |
| --- | --- | --- |
| `initialize` | 通过 | 返回服务名称 `repository-inspector` 和版本 `2.0.0`。 |
| `tools/list` | 通过 | 发现 `review_repository`，公开字段包含 `repo_path`、`baseRef`、`validationCommands` 和 `allow_shell_validation`。 |
| 使用指定仓库路径调用 | 通过 | 报告检查传入的临时仓库，没有错误检查 MCP 服务当前目录。 |
| 缺少 `repo_path` | 正确报错 | 没有静默使用服务当前目录。 |
| 不存在的仓库路径 | 正确报错 | 返回明确的 repository path 错误，没有 stack trace。 |
| 不存在的 `baseRef` | 正确报错 | 返回明确的 base ref 错误，没有 stack trace。 |
| Shell 命令没有 opt-in | 正确拒绝 | 必须传 `allow_shell_validation: true`。 |
| 成功验证命令 | 通过 | 报告同时保留 `passed`、退出码、stdout 和 stderr。 |
| 第一个验证失败、第二个成功 | 通过 | 第一个结果为 `failed`，后续验证继续执行。 |
| 超过 10 个验证命令 | 正确拒绝 | MCP schema 返回数量限制错误。 |
| 单条命令超过 1000 字符 | 正确拒绝 | MCP schema 返回长度限制错误。 |
| added/modified/deleted | 通过 | 三类普通变更均出现在报告中。 |
| rename/copy/untracked | 通过 | rename 和 copy 保留旧路径；非忽略 untracked 文件出现在报告中。 |
| ignored 文件 | 通过 | ignored 文件没有被列为 untracked。 |
| `master` 默认分支 | 通过 | 不传 `baseRef` 时可以找到 `master` 并检查 feature 分支。 |
| 无共同祖先的历史 | 通过 | 能继续比较两个无共同祖先的 ref，并列出两侧文件变化。 |

共执行 14 组独立验收检查，全部通过；表格将其中一组 Git 边界检查展开列出，
因此表格场景数多于 14。

## Task 2 修复确认

本次手测确认以下问题已经修复：

1. 原先 `git diff --name-status` 的行解析会把 rename/copy 粗略归为
   modified；现在使用 NUL 分隔的机器可读格式，并保留旧路径。
2. 原先 `ChangedFile` 虽声明了 `untracked`，实现却不会返回未跟踪文件；现在
   会加入非忽略 untracked 文件。
3. 原先默认 base ref 固定为 `main`；现在会探测 `origin/HEAD`，并回退检查
   `main`、`master`、`trunk` 和 `develop`。
4. 原先无共同祖先时三点 diff 会失败；现在回退到双提交 diff。
5. 非法 base ref 仍然返回可读错误，不会把 Git 底层 stack trace 直接交给 MCP
   客户端。

## 测试环境说明

- 测试分支：`codex/ai-repo-inspector-fixes`
- 手测时提交：`e504426`
- Git 仓库和文件名均为临时 fixture，不依赖当前项目的 Git 状态。
- 所有临时仓库在测试结束后清理。
- 没有运行 GitHub Actions，也没有执行 npm publish；CI/CD 配置只做静态 YAML
  检查，符合本次手测范围。

## 结论

Task 2 的 Git 变更解析链路已经通过真实 MCP 手动验收。added、modified、
deleted、rename、copy、untracked、ignored、非 `main` 默认分支和无共同祖先
历史均有实际验证结果。

当前仍明确保留的边界是：浅克隆如果本地没有可用的 base ref，不会自动联网
fetch，而是返回错误并要求调用方补齐 ref 或显式传入可用 ref。
