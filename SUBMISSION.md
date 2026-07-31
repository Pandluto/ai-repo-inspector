# Submission

## What did you investigate first, and why?

I started with `README.md`, `SUBMISSION.md`, and the source files. I wanted to understand what the tool promised before deciding what to change.

I followed the main path through Git change detection, validation commands, report generation, the CLI adapter, and the MCP adapter. The initial baseline showed two important failures:

- The MCP schema exposed `repo_path`, but the handler read `repoPath`. A real call could therefore inspect the server's current directory and return `Review Report: undefined`.
- A failed validation command aborted the review instead of appearing as a failed result in the report.

The original starter had one report happy-path test. After the fixes, the branch has four Vitest test files with 15 passing tests, plus a separate smoke test for the built CLI entry point.

## What did you choose to implement or fix?

I chose MCP-first for this timebox. I treated the MCP server as the interface that needed to become reliable first, while keeping the CLI as a follow-up interface.

The implemented fixes are:

1. Validate MCP input and use the public `repo_path` field correctly.
2. Return clear errors for invalid repositories and base refs instead of silently using the server's working directory.
3. Preserve failed validation results and continue with later checks.
4. Add explicit Shell-validation opt-in, command-count/length limits, timeouts, output limits, and separate stdout/stderr reporting.
5. Make reports safer by escaping Markdown, redacting common secret patterns, and truncating large output.
6. Handle Git renames, copies, untracked files, non-`main` default branches, and histories without a common ancestor.
7. Fix the built CLI bin path and add a smoke test for the built entry point.

The main implementation commits are `43ebfcc`, `eba498f`, `7380b95`, `8523159`, and `2b37292`. The quality-gate and guarded-release work is in `0f810db`. The corresponding tests are in `test/mcp-server.test.ts`, `test/validation.test.ts`, `test/report.test.ts`, `test/git.test.ts`, and `test/cli-entry-smoke.mjs`.

## What did you intentionally not do?

I did not try to redesign every interface in the timebox. The CLI still has follow-up issues: its hand-written parser mishandles some invalid inputs and paths with spaces, and the `json` format type is not implemented by the core. The MCP Shell capability is safer by requiring explicit opt-in, but it is still a trusted local capability rather than a sandbox for untrusted remote callers.

I did not publish an npm package. The package remains private, while `0f810db` adds a CI check on pushes, pull requests, and manual runs plus a tag-based release workflow that refuses to publish while the package is private.

## Interface decision

- Decision: MCP-first for this timebox. The MCP server is the interface I made reliable first.
- Primary user and execution environment: A local AI coding tool talking to a local stdio MCP server and a local Git checkout.
- Trust boundary and allowed capabilities: The caller supplies a repository path and may request Shell validation only with explicit opt-in. This remains a high-impact local capability. An untrusted or remote deployment would need a command allowlist or stronger process isolation.
- Reliability, discoverability, latency/context, and output tradeoffs: MCP is easy for an AI client to discover and call. Reports now keep stdout/stderr, status, exit code, timeout state, and bounded output, which makes failures useful without allowing command output to grow the context without limit.
- How supported interfaces remain consistent: MCP and the shared core use the same repository, validation, and report model. The CLI still exists, but its parser and JSON output are follow-up work; the docs do not claim that CLI and MCP have identical guarantees yet.
- Evidence that would change this decision: If terminal-based developers become the main users, or if the tool must ship as a standalone command, I would reconsider CLI-first or a hybrid approach.

## How did you use an AI coding agent?

I used AI coding agents to inspect the repository, trace the data flow, write and review tests, exercise the MCP protocol, compare proposed changes with the source, and update the research, task list, and submission notes. I reviewed the changes against the actual test output and kept the implementation focused on the MCP-first decision instead of accepting every possible cleanup.

## Where did you check, correct, or reject an AI suggestion? (required)

The first explanation of the MCP path bug said that the call would always fail. I tested it through JSON-RPC and found the more dangerous behavior: the server could use its own current directory and return a report headed `Review Report: undefined`. I corrected the finding to describe the silent wrong-directory behavior.

The manual test also found that an omitted `baseRef` failed for a repository whose branch was `master`. That finding led to the Git default-branch change in `8523159` and a regression test, rather than being left as an undocumented limitation.

## Commands used to verify the result, with outcomes

- `npm run typecheck` — passed.
- `npm test -- --reporter=verbose` — passed; 4 test files, 15 tests.
- `npm run build` — passed.
- `npm run test:entry` — passed; built `dist/src/cli.js` and ran the CLI smoke test.
- `npm run check` — passed; runs typecheck, the test suite, the built-entry smoke test, and `npm pack --dry-run`.
- `npm ls --depth=0` — passed.
- `npm audit --omit=dev --package-lock-only --audit-level=moderate` — passed with no known production advisories.
- Real MCP client using `Client` + `StdioClientTransport` — passed tool discovery, valid/invalid repository calls, invalid base ref handling, Shell opt-in, failed-validation continuation, and command limits.
- `npm run inspector -- review --repo . --base-ref main --validate false` — reproduced the original CLI failure behavior; the MCP path now returns a structured failed result and continues.

## A blocker you hit and how you approached it

When the repository was nested inside the unrelated `study-map` project, Vitest picked up the parent project's Vite/Wrangler configuration and failed before running the test. I ran the repository from its own project root, added an independent Vitest configuration, reran the checks successfully, and recorded the environment issue separately.

## Known limitations and the next three things you would do

The current limitations are:

- CLI argument validation and CLI/MCP output parity are not finished; `json` is still only a declared type, not a working serializer.
- Shell validation is opt-in and bounded, but it is not a sandbox. Remote or untrusted use would need a stronger policy.
- The CI workflow now runs the quality gate, but the npm package is intentionally still private and has not been published.

The next three things I would do are:

1. Make the CLI parser strict and either implement JSON output or remove the unused format option.
2. Decide whether to implement the declared JSON output and whether to make the package public; only then enable a real npm release.
3. If the trust model expands beyond a local client, replace arbitrary Shell validation with an allowlist/profile and isolation.

## Approximate focused-work time

- Start: 2026-07-31
- Finish: 2026-07-31
