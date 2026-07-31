import { describe, expect, it } from "vitest";
import { markdownReport } from "../src/report.js";

describe("markdownReport", () => {
  it("lists changed files and validation output", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [{ path: "src/index.ts", status: "modified" }],
      validationResults: [
        {
          command: "npm test",
          status: "passed",
          output: "ok",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        },
      ],
    });

    expect(report).toContain("src/index.ts (modified)");
    expect(report).toContain("npm test");
    expect(report).toContain("ok");
  });

  it("bounds and redacts validation output without breaking code blocks", () => {
    const fence = String.fromCharCode(96).repeat(3);
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [],
      validationResults: [
        {
          command: "npm test",
          status: "failed",
          output: fence + " token=secret " + "x".repeat(20_000),
          stderr: "password=hunter2",
          exitCode: 1,
          timedOut: false,
        },
      ],
    });

    expect(report).toContain("[REDACTED]");
    expect(report).toContain("[output truncated]");
    expect(report).not.toContain("token=secret");
    expect(report).not.toContain("password=hunter2");
  });
});
