# Submission

## What did you investigate first, and why?

I started with `README.md`, `SUBMISSION.md`, and the source files. I wanted to understand the intended behavior before changing anything.

I then followed the main path through Git change detection, validation commands, report generation, the CLI adapter, and the MCP adapter.

The baseline checks were:

- `npm run typecheck` passed.
- `npm test -- --reporter=verbose` passed: 1 test file and 1 test.
- `npm run build` passed, but produced `dist/src/cli.js` while the package entry points to `dist/cli.js`.
- `npm audit --omit=dev --package-lock-only --audit-level=moderate` found no known production dependency advisories.
- The MCP server started, and `initialize` and `tools/list` worked.
- A real MCP call using the documented `repo_path` field returned `Review Report: undefined`, so the requested path was ignored.
- Running the CLI with `--validate false` stopped with `Fatal error` instead of putting the failed check in the report.

This gave me a clear baseline and separated startup problems from behavior problems.

## What did you choose to implement or fix?

I chose MCP-first for this timebox. In other words, I am treating the MCP server as the main interface to make reliable first.

The first fixes I selected are:

1. Fix the `repo_path`/`repoPath` mismatch and remove the untyped `any` input.
2. Reject a missing or invalid repository path instead of silently checking the server's current directory.
3. Return failed validation commands as results and continue with the other commands.
4. Make MCP errors understandable and add tests that call the real MCP interface.
5. Document what callers are allowed to run and add limits for long-running or very large commands.

At this point I have only prepared the investigation and task list. The application code has not been changed yet.

## What did you intentionally not do?

I did not try to fix every issue at once. I left the CLI parser, Git rename/untracked-file handling, report formatting, npm packaging, and CI as follow-up work.

The CLI is still present, but I am not claiming that it has the same reliability as the MCP path until it is tested and brought into line.

## Interface decision

- Decision: MCP-first for this timebox. The MCP server is the interface I am making reliable first.
- Primary user and execution environment: A local AI coding tool talking to a local stdio MCP server and a local Git checkout.
- Trust boundary and allowed capabilities: The caller supplies a repository path and can currently supply shell commands to run. That is a powerful capability, so the current assumption is a trusted local caller. If untrusted callers must be supported, commands need an allowlist or explicit opt-in with isolation.
- Reliability, discoverability, latency/context, and output tradeoffs: MCP is easy for an AI client to discover and call, but command output can make a report too large. A failed check should be returned clearly instead of aborting the whole review. Low-level stack traces should not be sent straight back to the caller.
- How supported interfaces remain consistent: MCP and the shared core should use one request/result contract. Until the CLI is brought up to the same standard, the docs should not imply that CLI and MCP are equally reliable.
- Evidence that would change this decision: If the main users turn out to be terminal-based developers, or if the tool must ship as a standalone command, I would reconsider CLI-first or a hybrid approach.

## How did you use an AI coding agent?

I used an AI coding agent to read the repository, trace the data flow, run the checks, exercise the MCP protocol, compare the existing research with the code, and organize the findings into `research.md` and `tasks.md`. I used it for investigation and verification in this stage; it has not changed the application code.

## Where did you check, correct, or reject an AI suggestion? (required)

The first explanation of the MCP path bug said that the call would always fail. I tested it through JSON-RPC and found the more dangerous behavior: the server can use its own current directory and return a report headed `Review Report: undefined`. I corrected the finding to describe the silent wrong-directory behavior.

I also checked Node's `exec` behavior. It has a default output buffer, but this project still has no explicit timeout, cancellation, truncation, or clear policy for command execution.

## Commands used to verify the result, with outcomes

- `npm install` — dependencies installed.
- `npm run typecheck` — passed.
- `npm test -- --reporter=verbose` — passed; 1 test file, 1 test.
- `npm run build` — passed; exposed the build-output/bin mismatch.
- `npm ls --depth=0` — passed.
- `npm audit --omit=dev --package-lock-only --audit-level=moderate` — passed with no known production advisories.
- `npm run mcp-server` — server started over stdio.
- MCP `initialize` / `tools/list` — passed.
- MCP `review_repository` with `repo_path` — reproduced the ignored-path bug.
- `npm run inspector -- review --repo . --base-ref main --validate false` — reproduced validation failure aborting with exit code 1.

## A blocker you hit and how you approached it

When the repository was nested inside the unrelated `study-map` project, Vitest picked up the parent project's Vite/Wrangler configuration and failed before running the test. I ran the repository from its own project root, reran the checks successfully, and recorded the parent-configuration problem as a follow-up item.

## Known limitations and the next three things you would do

The current limitations are:

- The MCP path bug is documented but not fixed in the source.
- Validation commands still run through a shell without project-level timeouts or a safety policy.
- The tests do not yet cover MCP calls, Git edge cases, failed checks, or large output.

The next three things I would do are:

1. Fix the MCP input and error behavior, then add an isolated JSON-RPC test.
2. Make failed checks structured, bounded, and visible, and document the trust boundary.
3. Rerun typecheck, tests, build, and the MCP integration tests, then update this document with the final diff and exact times.

## Approximate focused-work time

- Start: 2026-07-31 (investigation checkpoint; exact time to be confirmed before the final submission)
- Finish: Pending implementation and final verification
