# Task 1 — MCP 手动测试记录

## 测试目的

确认 MCP 修复后，服务能否按公开契约工作，并主动寻找调查中没有覆盖的边界问题。

本次测试针对修复分支 `codex/ai-repo-inspector-fixes` 进行。手测时的 MCP 加固基线是 `7380b95`；手测发现的 Git 默认分支问题后来由 `8523159` 修复，构建后的 CLI 入口由 `2b37292` 修复。

## 测试方式

使用真实的 MCP 客户端连接 stdio 服务：

- `Client`
- `StdioClientTransport`
- 服务入口：`npm run mcp-server`

没有通过猜测内部函数结果，而是走了 MCP 的初始化、工具发现和 `tools/call` 流程。

## 测试结果

| 场景 | 结果 | 观察 |
| --- | --- | --- |
| `initialize` | 通过 | 返回协议版本、服务名称和工具能力。 |
| `tools/list` | 通过 | 发现 `review_repository`，公开字段包含 `repo_path`、`baseRef`、`validationCommands`、`allow_shell_validation`。 |
| 正常仓库调用 | 通过 | 报告使用传入的仓库路径，并列出目标仓库的改动。 |
| 缺少 `repo_path` | 正确报错 | 返回 MCP 参数校验错误，没有静默使用服务当前目录。 |
| 不存在的仓库路径 | 正确报错 | 返回清晰的 repository path 错误，不返回 stack trace。 |
| 不存在的 `baseRef` | 正确报错 | 返回 `Base ref ... was not found in the repository.`。 |
| 有验证命令但没有 opt-in | 正确拒绝 | 必须传 `allow_shell_validation: true`。 |
| 有 opt-in 的成功验证命令 | 通过 | 报告包含 passed、退出码、stdout 和 stderr。 |
| 第一个验证失败、第二个成功 | 通过 | 第一个结果为 failed，后续验证仍然执行并返回 passed。 |
| 超过 10 个验证命令 | 正确拒绝 | MCP schema 返回数组长度错误。 |
| 单条命令超过 1000 字符 | 正确拒绝 | MCP schema 返回命令长度错误。 |

## 本轮发现的问题及后续修复

创建了一个只有 `master` 分支的临时 Git 仓库，不传 `baseRef` 调用 MCP，结果为：

```text
Base ref "main" was not found in the repository.
```

原因是当时的 `src/git.ts` 把默认 base ref 固定为 `main`。这个手测结果没有被当作“服务本来就这样”而跳过：后续提交 `8523159` 增加了默认分支探测，并在 `test/git.test.ts` 中覆盖只有非 `main` 分支的仓库；同一提交还补了无共同祖先、rename/copy 和 untracked 文件的 Git 回归测试。当前分支的自动测试已经通过。

## 测试环境说明

最初用 PTY 手动发送超长 JSON 时，终端行缓冲被撑满，后续输入只返回 `BEL`。这属于测试终端的限制，不是 MCP 业务错误。改用普通 stdio 管道和真实 MCP 客户端后，边界测试正常完成。

所有临时仓库都在测试结束后清理，没有删除或修改项目中的业务文件。

## 结论

MCP 的主要修复链路已经可用：能发现工具、检查正确仓库、拒绝无效输入、控制 Shell 验证权限，并保留验证失败结果。手测发现的 `master` 默认分支问题已经在后续提交中修复；`0f810db` 又把入口 smoke test 纳入了 CI。当前更明确的后续是 CLI 参数/JSON 契约，以及不受信任环境下的 Shell 隔离。
