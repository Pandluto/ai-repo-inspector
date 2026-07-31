import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { changedFiles } from "../src/git.js";

const fixtures: string[] = [];

function git(repositoryPath: string, args: string[]): void {
  execFileSync("git", args, { cwd: repositoryPath, stdio: "ignore" });
}

async function initRepository(baseBranch = "main"): Promise<string> {
  const repositoryPath = await mkdtemp(join(tmpdir(), "ai-repo-inspector-git-"));
  fixtures.push(repositoryPath);

  git(repositoryPath, ["init", "-b", baseBranch]);
  git(repositoryPath, ["config", "user.email", "git-test@example.com"]);
  git(repositoryPath, ["config", "user.name", "Git Test"]);

  return repositoryPath;
}

async function createChangeFixture(): Promise<string> {
  const repositoryPath = await initRepository();

  await writeFile(join(repositoryPath, "modified.txt"), "before\n");
  await writeFile(join(repositoryPath, "deleted.txt"), "delete me\n");
  await writeFile(join(repositoryPath, "rename-source.txt"), "rename me\n");
  await writeFile(join(repositoryPath, "copy-source.txt"), "copy me\n");
  await writeFile(join(repositoryPath, ".gitignore"), "ignored.txt\n");
  git(repositoryPath, ["add", "."]);
  git(repositoryPath, ["commit", "-m", "base"]);
  git(repositoryPath, ["switch", "-c", "feature"]);

  await writeFile(join(repositoryPath, "modified.txt"), "after\n");
  git(repositoryPath, ["rm", "deleted.txt"]);
  git(repositoryPath, ["mv", "rename-source.txt", "rename-target.txt"]);
  await copyFile(join(repositoryPath, "copy-source.txt"), join(repositoryPath, "copy-target.txt"));
  await writeFile(join(repositoryPath, "added.txt"), "added\n");
  git(repositoryPath, ["add", "-A"]);
  git(repositoryPath, ["commit", "-m", "feature"]);

  await writeFile(join(repositoryPath, "untracked file.txt"), "untracked\n");
  await mkdir(join(repositoryPath, "untracked-dir"));
  await writeFile(join(repositoryPath, "untracked-dir", "nested.txt"), "nested\n");
  await writeFile(join(repositoryPath, "ignored.txt"), "ignored\n");

  return repositoryPath;
}

describe("Git change inspection", () => {
  afterAll(async () => {
    await Promise.all(fixtures.map((fixture) => rm(fixture, { recursive: true, force: true })));
  });

  it("parses added, modified, deleted, renamed, copied, and untracked files", async () => {
    const repositoryPath = await createChangeFixture();
    const files = changedFiles(repositoryPath, "main");

    expect(files).toEqual(
      expect.arrayContaining([
        { path: "added.txt", status: "added" },
        { path: "modified.txt", status: "modified" },
        { path: "deleted.txt", status: "deleted" },
        { oldPath: "rename-source.txt", path: "rename-target.txt", status: "renamed" },
        { oldPath: "copy-source.txt", path: "copy-target.txt", status: "copied" },
        { path: "untracked file.txt", status: "untracked" },
        { path: "untracked-dir/nested.txt", status: "untracked" },
      ]),
    );
    expect(files).not.toEqual(expect.arrayContaining([{ path: "ignored.txt", status: "untracked" }]));
  });

  it("uses a non-main default branch when no baseRef is supplied", async () => {
    const repositoryPath = await initRepository("master");
    await writeFile(join(repositoryPath, "base.txt"), "base\n");
    git(repositoryPath, ["add", "base.txt"]);
    git(repositoryPath, ["commit", "-m", "base"]);
    git(repositoryPath, ["switch", "-c", "feature"]);
    await writeFile(join(repositoryPath, "feature.txt"), "feature\n");
    git(repositoryPath, ["add", "feature.txt"]);
    git(repositoryPath, ["commit", "-m", "feature"]);

    expect(changedFiles(repositoryPath)).toEqual([
      { path: "feature.txt", status: "added" },
    ]);
  });

  it("falls back to a two-commit diff when the refs have no common ancestor", async () => {
    const repositoryPath = await initRepository();
    await writeFile(join(repositoryPath, "base.txt"), "base\n");
    git(repositoryPath, ["add", "base.txt"]);
    git(repositoryPath, ["commit", "-m", "base"]);
    git(repositoryPath, ["switch", "--orphan", "unrelated"]);
    git(repositoryPath, ["rm", "-rf", "--ignore-unmatch", "--", "."]);
    await writeFile(join(repositoryPath, "unrelated.txt"), "unrelated\n");
    git(repositoryPath, ["add", "unrelated.txt"]);
    git(repositoryPath, ["commit", "-m", "unrelated"]);

    expect(changedFiles(repositoryPath, "main")).toEqual(
      expect.arrayContaining([
        { path: "base.txt", status: "deleted" },
        { path: "unrelated.txt", status: "added" },
      ]),
    );
  });

  it("rejects a base ref that is not present", async () => {
    const repositoryPath = await initRepository();
    await writeFile(join(repositoryPath, "base.txt"), "base\n");
    git(repositoryPath, ["add", "base.txt"]);
    git(repositoryPath, ["commit", "-m", "base"]);

    expect(() => changedFiles(repositoryPath, "missing-ref")).toThrow(
      'Base ref "missing-ref" was not found in the repository.',
    );
  });
});
