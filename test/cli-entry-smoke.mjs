import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const declaredEntry = packageJson.bin.inspector;
const entryPath = resolve(projectRoot, declaredEntry);
const fixturePath = mkdtempSync(join(tmpdir(), "ai-repo-inspector-cli-"));

function git(args) {
  execFileSync("git", args, { cwd: fixturePath, stdio: "ignore" });
}

try {
  assert.equal(declaredEntry, "./dist/src/cli.js");

  git(["init", "-b", "main"]);
  git(["config", "user.email", "cli-smoke@example.com"]);
  git(["config", "user.name", "CLI Smoke Test"]);
  writeFileSync(join(fixturePath, "base.txt"), "base\n");
  git(["add", "base.txt"]);
  git(["commit", "-m", "base"]);
  git(["switch", "-c", "feature"]);
  writeFileSync(join(fixturePath, "feature.txt"), "feature\n");
  git(["add", "feature.txt"]);
  git(["commit", "-m", "feature"]);

  const output = execFileSync(
    process.execPath,
    [entryPath, "review", "--repo", fixturePath, "--base-ref", "main"],
    { cwd: fixturePath, encoding: "utf8" },
  );
  const report = readFileSync(join(fixturePath, "review-report.md"), "utf8");

  assert.match(output, /Review report written to review-report\.md/);
  assert.match(report, /feature\.txt/);
} finally {
  rmSync(fixturePath, { recursive: true, force: true });
}
