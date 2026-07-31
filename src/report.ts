import type { ChangedFile, ValidationResult } from "./types.js";

const MAX_OUTPUT_LENGTH = 16_000;
const FENCE_CHARACTER = String.fromCharCode(96);

type ReportInput = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

function escapeInline(value: string): string {
  return value
    .replace(/[\\*{}\[\]()#+!|>]/g, "\\$&")
    .replace(/\r?\n/g, " ");
}

function redactAndTruncate(value: string): string {
  const redacted = value.replace(
    /((?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*)[^\s]+/gi,
    "$1[REDACTED]",
  );

  if (redacted.length <= MAX_OUTPUT_LENGTH) {
    return redacted;
  }

  return redacted.slice(0, MAX_OUTPUT_LENGTH) + "\n...[output truncated]...";
}

function codeBlock(value: string): string[] {
  const safeValue = redactAndTruncate(value);
  const fenceRuns = new RegExp(FENCE_CHARACTER + "+", "g");
  const longestFence = (safeValue.match(fenceRuns) || []).reduce(
    (longest, current) => Math.max(longest, current.length),
    0,
  );
  const fence = FENCE_CHARACTER.repeat(Math.max(3, longestFence + 1));
  return [fence, safeValue, fence];
}

export function markdownReport(input: ReportInput): string {
  const lines = ["# Review Report: " + escapeInline(input.repositoryPath), "", "## Changed files"];

  for (const file of input.changedFiles) {
    const origin = file.oldPath ? "; previous path: " + escapeInline(file.oldPath) : "";
    lines.push("- " + escapeInline(file.path) + " (" + file.status + origin + ")");
  }

  lines.push("", "## Validation output");
  for (const result of input.validationResults) {
    lines.push(
      "### " + escapeInline(result.command),
      "- Status: " + result.status,
      "- Exit code: " + (result.exitCode === null ? "unknown" : String(result.exitCode)),
      "- Timed out: " + String(result.timedOut),
      "stdout:",
      ...codeBlock(result.output),
      "stderr:",
      ...codeBlock(result.stderr),
    );
  }

  return lines.join("\n");
}
