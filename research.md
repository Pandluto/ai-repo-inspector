# ai-repo-inspector 调研记录

## 研究范围

- 研究对象：ai-repo-inspector-assessment-v2
- 当前实际 Git 根目录：/Users/sailstellar/Documents/ai-repo-inspector
- 研究日期：2026-07-31
- 研究方式：本地静态阅读、命令验证，以及 3 个 subagent 的独立只读分析。
- 本次变更：只新增本调研文档，没有修改业务代码、依赖或配置。

## 结论摘要

这是一个“共享核心逻辑 + CLI/MCP 适配层”的小型 Git 仓库检查工具。基础链路已经存在：

1. 读取 baseRef...HEAD 的 Git 文件变化；
2. 可选执行验证命令；
3. 生成 Markdown 审查报告；
4. 通过 CLI 或 MCP 暴露能力。

服务本身可以启动。npm run mcp-server 会启动一个 stdio MCP 服务并等待客户端输入，不监听 HTTP 端口。当前主要问题不是“启动失败”，而是调用契约、失败处理、安全边界和生产工程化存在缺口。

最严重的问题是：

1. MCP schema 声明 repo_path，处理函数却读取 repoPath，正常 MCP 调用会拿不到仓库路径。
2. --validate 和 MCP 的验证命令通过 Shell 执行任意外部输入，没有安全限制。
3. 验证命令失败会直接中断整个审查，无法返回完整的失败报告。

当前更适合作为本地开发者工具原型，不适合在未限制能力的情况下暴露给不受信任的远程或 AI 调用方。

## 系统结构与数据流

当前主要入口和数据流如下：

    CLI / MCP
        ↓
    reviewRepository()
        ├─ changedFiles()
        │    └─ git diff --name-status base...HEAD
        ├─ runValidations()
        │    └─ child_process.exec(command)
        └─ markdownReport()
             └─ Markdown 字符串

模块职责：

- src/core.ts：编排 Git 变更读取、验证命令和报告生成。
- src/git.ts：使用 execFileSync 调用 Git 并解析变更文件。
- src/validation.ts：串行执行验证命令。
- src/report.ts：生成 Markdown 报告。
- src/cli.ts：解析命令行参数并写入报告。
- src/mcp-server.ts：注册 review_repository MCP 工具。
- src/types.ts：定义变更文件、验证结果和请求类型。

## 已验证结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| git status --short --branch | 通过 | 调研开始时为 main...origin/main 且工作区干净；写入本报告后 research.md 为唯一未跟踪文件 |
| npm run typecheck | 通过 | TypeScript 严格检查通过 |
| npm test -- --reporter=verbose | 通过 | 1 个测试文件、1 个测试通过 |
| npm run mcp-server | 可启动 | stdio 服务启动后等待 MCP 输入，手动停止 |
| npm ls --depth=0 | 通过 | 根依赖均可解析 |
| npm audit --omit=dev --package-lock-only --audit-level=moderate | 通过 | 当前生产依赖未发现 npm advisory 漏洞 |
| TypeScript 构建探针 | 暴露问题 | 输出为 dist/src/cli.js，但 package.json 的 bin 指向 dist/cli.js |

### 环境观察

分析过程中，用户给出的嵌套路径 /Users/sailstellar/Documents/study-map/ai-repo-inspector 后续不再存在；同一 Git 项目当前位于 /Users/sailstellar/Documents/ai-repo-inspector。本次没有执行搬移或覆盖操作，后续以当前 Git 根目录为准。

在嵌套路径下首次运行测试时，Vitest 自动拾取了上级 study-map 的 Vite/Wrangler 配置，并因为缺少 worker/index.ts 启动失败；在当前项目根目录重新运行后测试通过。这说明项目缺少独立的 Vitest 配置隔离，但不是当前测试断言本身失败。

## Git 分支、路径与 GitHub 追踪状态

这是本次调研需要特别记录的版本控制上下文：

- 当前工作目录和 Git 根目录：/Users/sailstellar/Documents/ai-repo-inspector。
- 当前分支：main。
- 当前 HEAD：f529dff，提交信息为 Initial commit。
- 当前分支跟踪：origin/main。
- 调研开始时，main 与 origin/main 的同步状态为 0 ahead / 0 behind。
- origin fetch/push 地址：git@github.com:Pandluto/ai-repo-inspector.git。
- upstream fetch/push 地址：git@github.com:xsolla/ai-repo-inspector.git。
- original-template-history 分支保留了从原始 xsolla 仓库克隆时的本地模板历史；reflog 显示旧的本地 main 曾被改名为该分支，之后从 origin/main 创建了新的 main。
- 本次没有执行 commit、push、branch switch 或 remote 写操作。
- research.md 是当前唯一新增的未跟踪文件，因此它目前还没有进入 GitHub 的任何提交或分支。

后续工作应以当前 fork 的 main 分支为工作分支，以 origin 作为推送目标；upstream 只作为原始模板的对照来源，不能误推到 upstream。

## 已发现问题清单

### R-01：MCP 参数名不一致，正常调用不可用

- 严重度：P0
- 证据：src/mcp-server.ts:13 的 schema 声明参数为 repo_path。
- 证据：src/mcp-server.ts:17-21 的处理函数读取 input.repoPath。
- 影响：MCP 客户端按公开 schema 传入 repo_path 后，reviewRepository 收到的仓库路径是 undefined，后续 Git 操作会因为无效 cwd 失败。
- 相关问题：处理函数使用 input: any，TypeScript 无法在编译期阻止字段名错误。
- 建议：统一字段命名；使用 z.infer 或 MCP SDK 推导的输入类型；增加 MCP 初始化、正常调用和参数错误的端到端测试。

### R-02：验证命令允许任意 Shell 执行

- 严重度：P0（当 MCP 或服务面向不受信任调用方时）；P1（仅限受信任本地开发者时）。
- 证据：src/validation.ts:6 使用 exec(command, { cwd })。
- 证据：src/cli.ts:23-25 和 src/mcp-server.ts:15 接受调用方传入的命令。
- 影响：调用者可以执行删除文件、读取环境变量和密钥、联网、启动后台进程等任意 Shell 操作。MCP 由 AI 客户端调用时，信任边界尤其不清晰。
- 建议：先明确产品定位和信任边界。安全默认模式使用预定义验证器或命令白名单；如确实需要任意命令，必须显式 opt-in，并配合隔离工作目录、受限环境变量和审计记录。结构化命令应优先使用 execFile，避免把参数重新拼接成 Shell 字符串。

### R-03：验证失败会中断整次审查

- 严重度：P1
- 证据：src/validation.ts:7-10 在命令退出异常时直接 reject。
- 证据：src/validation.ts:16-21 串行执行且没有捕获单项失败。
- 影响：测试、lint 等最重要的失败结果不会进入报告，而是触发 CLI 的 Fatal error；后续验证命令也不会执行。
- 相关问题：src/types.ts:6-10 虽然声明了 status: failed，当前实现却永远不会返回该状态。
- 建议：将非零退出转换为结构化失败结果并继续执行其余命令；仅把进程无法启动、工作目录不存在等基础设施错误作为异常。

### R-04：验证执行没有资源限制和可观测信息

- 严重度：P1
- 证据：src/validation.ts:6 没有设置 timeout、maxBuffer 或取消机制。
- 影响：命令可以无限挂起、产生超大输出或长期占用资源；多个命令串行执行时，总延迟不可控。
- 缺少的信息：退出码、stderr、执行时长、超时状态、被截断状态。
- 建议：增加单命令超时、最大输出、命令数量/长度限制、退出码和持续时间；超时后终止进程并返回结构化结果。是否并发执行应由受控并发上限决定，而不是直接 Promise.all。

### R-05：format 接口声明存在但没有实现

- 严重度：P1
- 证据：src/types.ts:12-16 声明支持 markdown | json。
- 证据：src/cli.ts:21-22 解析 --format。
- 证据：src/core.ts:12-16 始终调用 markdownReport。
- 证据：src/cli.ts:44 始终写入 review-report.md。
- 影响：传入 --format json 仍然得到 Markdown，自动化调用方无法可靠解析；MCP schema 甚至没有暴露 format 字段。
- 建议：让核心返回结构化 ReviewResult，分别实现 Markdown/JSON serializer；或暂时删除 JSON 选项并拒绝未知格式。CLI 与 MCP 必须共享同一行为契约。

### R-06：CLI 会截断包含空格的仓库路径

- 严重度：P1
- 证据：src/cli.ts:17-18 对 --repo 的 argv token 调用 split(" ")[0]。
- 影响：/tmp/my repo 会被错误解析为 /tmp/my；合法的 Unicode、空格路径无法使用。
- 建议：直接使用完整的 argv token。Shell 引号已经由调用方处理，不应在应用层再次按空格拆分。增加空格路径、相对路径和不存在路径测试。

### R-07：CLI 参数校验不足，错误输入会静默或延迟失败

- 严重度：P2
- 证据：src/cli.ts:13-27 未校验选项值是否存在。
- 问题包括：
  - --repo、--base-ref、--format、--validate 缺少值时没有立即报错；
  - 未知参数会被静默忽略；
  - format 使用类型断言绕过运行时枚举校验；
  - usage 文案没有反映 format 和 output 等实际契约。
- 影响：用户输入错误只能在后续 Git 或命令执行阶段暴露，诊断困难。
- 建议：使用可靠的参数解析器或实现严格的手写 parser；拒绝未知参数、缺失值和非法枚举，并返回明确退出码。

### R-08：Git 默认基准固定为 main，错误处理和输入边界不足

- 严重度：P1
- 证据：src/git.ts:11-13 没有 baseRef 时固定比较 main...HEAD。
- 影响：
  - 默认分支为 master、其他名称或本地没有 main 时审查失败；
  - 浅克隆、无共同祖先或 ref 不存在时错误信息不友好；
  - 目录不存在或不是 Git 仓库时直接抛出底层异常；
  - 用户输入的 ref 被拼入 Git 参数，未做格式和语义校验，可能触发 Git 选项解析歧义。
- 需要保留的正面点：Git 调用使用 execFileSync 的参数数组，没有把 Git 参数放进 Shell 字符串，避免了常见的 Shell 注入。
- 建议：先确认路径存在且是 Git 仓库；探测远程默认分支或要求显式 baseRef；对 ref 和 Git 错误做领域化、可读的错误转换，并考虑在参数前使用 Git 的选项终止符。

### R-09：Git 变更状态解析不完整

- 严重度：P1
- 证据：src/git.ts:13-21 只执行 git diff --name-status，只将 A 识别为 added、D 识别为 deleted，其余全部归为 modified。
- 影响：
  - rename 和 copy 会被错误归类为 modified；
  - rename 的旧路径和新路径可能被拼成一个包含制表符的 path；
  - ChangedFile 类型声明了 untracked，但实现不会返回未跟踪文件；
  - 特殊路径和制表符路径的解析不稳定。
- 建议：使用稳定的机器可读格式（例如 -z）并显式建模 rename/copy 的旧、新路径；明确审查是否包含 untracked 文件。

### R-10：报告 Markdown 未转义，动态代码围栏可破坏结构

- 严重度：P2
- 证据：src/report.ts:10-16 直接插入仓库路径、文件路径、命令和输出。
- 影响：
  - 文件路径中的 Markdown 特殊字符可能改变结构；
  - 命令输出中的代码围栏可能提前关闭代码块；
  - 在支持渲染的环境中，恶意内容可能影响报告展示；
  - 输出过大时会造成报告膨胀和 AI 上下文膨胀。
- 建议：对标题、路径和普通文本做转义；根据内容动态选择代码围栏或使用安全的代码块策略；设置默认输出上限，并标记截断。

### R-11：验证输出可能丢失 stderr 并泄露敏感信息

- 严重度：P2
- 证据：src/validation.ts:11 使用 stdout || stderr。
- 影响：
  - stdout 非空时 stderr 会被完全丢弃；
  - token、环境变量、私钥片段或用户数据可能被原样写入 review-report.md；
  - 失败命令的 stderr 因直接 reject 也不会稳定进入报告。
- 建议：分别保存 stdout/stderr、退出码和状态；默认截断并做常见敏感模式脱敏；提供显式 verbose 选项，不要继承不必要的环境变量。

### R-12：报告输出位置固定且会无提示覆盖

- 严重度：P2
- 证据：src/cli.ts:44 固定写入当前进程目录的 review-report.md。
- 影响：
  - 从其他目录调用时，报告不会写入被审查仓库，也不会明确告知输出绝对路径；
  - 重复执行会覆盖已有报告；
  - 可能覆盖用户手工创建的同名文件。
- 建议：增加 --output；明确默认写入位置或输出到 stdout；使用原子写入，必要时避免无提示覆盖。

### R-13：CLI/MCP 的产品定位和信任边界没有落地

- 严重度：P1
- 证据：README 要求在 CLI-first、MCP-first、hybrid 之间做决定，但当前代码和文档没有完整表达该决定。
- 影响：
  - 两个接口对 format、错误和验证能力的支持不一致；
  - 使用者无法知道仓库路径、Shell 命令和环境变量的信任边界；
  - MCP 的发现性和自动化价值与任意命令执行风险之间没有明确取舍。
- 建议：采用 hybrid 架构但明确“本地受信任调用”假设：CLI 面向开发者，MCP 面向本机 AI 客户端；MCP 默认启用受控验证器，任意 Shell 仅显式 opt-in。两层适配器都调用同一个结构化 core，并共用契约测试。

### R-14：自动化测试覆盖极少

- 严重度：P1
- 证据：test/report.test.ts:4-15 只有一个 Markdown happy-path 测试。
- 未覆盖的关键路径：
  - MCP schema、参数映射和端到端调用；
  - CLI 参数缺失、未知参数和含空格路径；
  - Git 默认/自定义 base ref、空 diff、非法 ref；
  - added/deleted/modified/rename/copy/untracked；
  - 验证命令成功、失败、超时、命令不存在和 stderr；
  - 多个验证命令在第一个失败后的行为；
  - JSON 格式；
  - Markdown 特殊字符、代码围栏、超长输出和敏感信息脱敏；
  - 输出文件覆盖和 --output 行为。
- 影响：当前最关键的 P0/P1 问题都没有自动回归保护。
- 建议：先为 R-01、R-03、R-05、R-06 写测试，再补 Git/validation 的隔离测试和 CLI/MCP 集成测试。

### R-15：缺少独立 Vitest 配置，容易受到父级工作区干扰

- 严重度：P2
- 证据：项目中没有独立的 vitest.config.*，测试运行时会自动向父目录寻找 Vite 配置。
- 实际表现：在嵌套路径下，Vitest 加载 /Users/sailstellar/Documents/study-map/vite.config.ts，并因不存在的 worker/index.ts 启动失败；在当前项目根目录运行则通过。
- 影响：测试结果依赖项目所在目录，CI、本地嵌套工作区和其他开发环境的行为不一致。
- 建议：增加最小的独立 Vitest 配置，明确 root、include 和环境；在 CI 中从项目根目录运行。

### R-16：构建产物路径与 npm bin 不匹配

- 严重度：P1
- 证据：tsconfig.json:6-7 设置 rootDir: "."、outDir: "dist"；构建探针实际生成 dist/src/cli.js。
- 证据：package.json:7-9 的 bin 却指向 ./dist/cli.js。
- 影响：执行 build 后，npm 的 inspector bin 仍可能找不到入口文件；开发脚本 npm run inspector 使用 tsx 能工作，但发布/直接安装场景会失败。
- 建议：统一目录策略：将 rootDir 改为 src 并单独排除测试输出，或把 bin 指向实际构建产物；增加构建后 bin smoke test。

### R-17：构建、发布和质量门禁不完整

- 严重度：P2
- 证据：package.json:10-15 只有 build、inspector、mcp-server、test、typecheck。
- 缺口包括：
  - 没有 lint、format 或统一 check 脚本；
  - 没有发布前构建/入口验证；
  - 没有 files、prepack 等明确发布配置；
  - private: true 使其不能直接作为 npm 包发布；
  - CI 质量门禁和构建产物检查需要进一步确认。
- 影响：生产发布依赖人工步骤，容易出现“源码可运行但包入口不可用”的问题。
- 建议：增加 check、lint、format、build smoke test 和 CI；如果只作为源码工具，明确不发布 npm；如果要发布，补齐 package files/prepack 和版本验证。

### R-18：依赖版本范围会增加未来解析变化

- 严重度：P2
- 证据：package.json:17-25 中 zod、TypeScript、tsx、Vitest 等使用了 ^ 范围。
- 现状：lockfile v3 可以保证当前安装可复现，npm ls --depth=0 正常，生产依赖审计无已知漏洞。
- 影响：后续删除 lockfile 或重新解析依赖时可能升级到新版本，带来行为变化。
- 建议：生产关键依赖考虑固定版本或明确升级策略；在 CI 中使用 lockfile 安装并定期运行审计。

## 架构优点

- src/core.ts 集中编排，CLI 和 MCP 作为适配器的方向合理。
- Git、验证、报告职责拆分清晰，后续可以分别测试和替换。
- ReviewRequest、ChangedFile、ValidationResult 提供了可扩展的边界数据模型。
- MCP 使用 Zod 声明输入 schema，方向正确，只是实现没有使用推导类型。
- TypeScript 开启 strict 模式，当前 typecheck 通过。
- Git 使用 execFileSync 参数数组，而不是 Shell 拼接，Git 这一层没有明显的 Shell 注入问题。
- lockfile 和 Node 版本要求已声明，依赖当前可安装。

## 推荐修复顺序

### 阶段 1：先恢复 MCP 可用性

1. 修复 repo_path / repoPath 字段错位。
2. 移除 any，让 schema 和 handler 共用推导类型。
3. 增加 MCP 初始化和一次真实 review_repository 调用测试。
4. 统一错误返回格式，避免直接把底层异常暴露给客户端。

验收标准：MCP 服务可以启动；客户端按公开 schema 传入 repo_path 后能返回报告。

### 阶段 2：恢复核心可靠性

1. 将验证失败转换为 failed 结果，并继续执行其他命令。
2. 保存 stdout、stderr、退出码、超时和截断状态。
3. 实现 JSON 输出，或删除未实现的 JSON 选项。
4. 修复 CLI 参数 parser 和空格路径。
5. 修复 base ref 探测、Git 错误转换和 rename/copy/untracked 解析。

验收标准：失败命令不会让整次审查崩溃；Markdown/JSON 输出可被自动化稳定消费。

### 阶段 3：安全加固

1. 明确 CLI 和 MCP 的信任边界。
2. MCP 默认启用验证命令白名单或预定义验证 profile。
3. 对任意命令执行增加显式 opt-in、timeout、maxBuffer、命令数量限制和环境隔离。
4. 校验仓库路径、限制可访问范围，并对报告进行脱敏和截断。

验收标准：安全默认模式下不能通过验证参数执行任意 Shell；超时和超大输出可以被控制并形成可读结果。

### 阶段 4：测试、构建和发布

1. 增加独立 Vitest 配置。
2. 补齐 Git、validation、CLI、MCP、report 的单元和集成测试。
3. 修复 dist/src/cli.js 与 npm bin 的路径不一致。
4. 增加 lint/format/check、构建 smoke test 和 CI 门禁。
5. 明确是否需要 npm 发布，并按决定配置 private、files 和 prepack。

验收标准：从项目根目录和干净 CI 环境均可通过 typecheck、test、build；构建后 bin 和 MCP 启动方式均可验证。

## 产品接口建议

建议保留 hybrid 架构，但把运行模型写清楚：

- CLI：面向本地开发者，允许开发者显式选择验证命令。
- MCP：面向本机 AI 客户端，默认只允许受控的验证 profile。
- Core：只接收结构化请求和结构化结果，不负责决定调用方是否可信。
- Markdown：面向人阅读。
- JSON：面向自动化和 AI 客户端。
- 所有错误、验证失败和 Git 失败都应成为可区分的结构化结果。

如果未来要把 MCP 做成远程服务，当前的任意 Shell、任意仓库路径和环境继承策略都必须重新设计，不能只修参数名。

## 当前未解决的问题

1. 原始嵌套路径为何消失、项目实际目录为何变为 /Users/sailstellar/Documents/ai-repo-inspector，需要在后续工作流中确认；本次没有自行搬运。
2. README 要求的 GitHub template 仓库创建和提交动作尚未处理。
3. 本次只做调研，没有修复业务代码。
