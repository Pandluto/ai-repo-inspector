import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import type { ChangedFile } from "./types.js";

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

type GitResult = {
  output: string;
  errorOutput: string;
  status: number | null;
};

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return Buffer.isBuffer(value) ? value.toString("utf8") : "";
}

function runGit(repositoryPath: string, args: string[]): GitResult {
  try {
    return {
      output: execFileSync("git", args, {
        cwd: repositoryPath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
      errorOutput: "",
      status: 0,
    };
  } catch (error) {
    const gitError = error as {
      status?: unknown;
      stdout?: unknown;
      stderr?: unknown;
    };

    return {
      output: asText(gitError.stdout),
      errorOutput: asText(gitError.stderr),
      status: typeof gitError.status === "number" ? gitError.status : null,
    };
  }
}

function git(repositoryPath: string, args: string[], message: string): string {
  const result = runGit(repositoryPath, args);

  if (result.status !== 0) {
    throw new RepositoryError(message);
  }

  return result.output;
}

function validateBaseRefInput(baseRef: string): void {
  if (!baseRef.trim() || baseRef.startsWith("-") || /[\s\0]/.test(baseRef)) {
    throw new RepositoryError("Invalid base ref \"" + baseRef + "\".");
  }
}

function refExists(repositoryPath: string, baseRef: string): boolean {
  const result = runGit(repositoryPath, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    baseRef + "^{commit}",
  ]);

  return result.status === 0;
}

function resolveBaseRef(repositoryPath: string, baseRef?: string): string {
  if (baseRef !== undefined) {
    validateBaseRef(repositoryPath, baseRef);
    return baseRef;
  }

  const remoteHead = runGit(repositoryPath, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "refs/remotes/origin/HEAD",
  ]).output.trim();

  const candidates = [remoteHead, "main", "master", "trunk", "develop"].filter(
    (candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index,
  );

  for (const candidate of candidates) {
    if (refExists(repositoryPath, candidate)) {
      return candidate;
    }
  }

  throw new RepositoryError(
    "No base ref was supplied and no default branch was found. Pass baseRef explicitly.",
  );
}

export function validateRepositoryPath(repositoryPath: string): void {
  if (!repositoryPath || !existsSync(repositoryPath)) {
    throw new RepositoryError(
      "Repository path does not exist: " + (repositoryPath || "<empty>") + ".",
    );
  }

  if (!statSync(repositoryPath).isDirectory()) {
    throw new RepositoryError("Repository path is not a directory: " + repositoryPath + ".");
  }

  const isWorkTree = runGit(repositoryPath, ["rev-parse", "--is-inside-work-tree"]);
  if (isWorkTree.status !== 0 || isWorkTree.output.trim() !== "true") {
    throw new RepositoryError("Path is not a Git repository: " + repositoryPath + ".");
  }
}

export function validateBaseRef(repositoryPath: string, baseRef: string): void {
  validateBaseRefInput(baseRef);

  if (!refExists(repositoryPath, baseRef)) {
    throw new RepositoryError("Base ref \"" + baseRef + "\" was not found in the repository.");
  }
}

function parseNameStatus(output: string): ChangedFile[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") {
    fields.pop();
  }

  const files: ChangedFile[] = [];
  let index = 0;

  while (index < fields.length) {
    const statusCode = fields[index++];
    const firstPath = fields[index++];

    if (!statusCode || firstPath === undefined) {
      throw new RepositoryError("Git returned an invalid change list.");
    }

    const status = statusCode[0];
    if (status === "R" || status === "C") {
      const newPath = fields[index++];
      if (newPath === undefined) {
        throw new RepositoryError("Git returned an invalid rename or copy entry.");
      }

      files.push({
        oldPath: firstPath,
        path: newPath,
        status: status === "R" ? "renamed" : "copied",
      });
      continue;
    }

    files.push({
      path: firstPath,
      status:
        status === "A"
          ? "added"
          : status === "D"
            ? "deleted"
            : "modified",
    });
  }

  return files;
}

function parseNulSeparatedPaths(output: string): string[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") {
    fields.pop();
  }

  return fields;
}

function hasCommonAncestor(repositoryPath: string, baseRef: string): boolean {
  const result = runGit(repositoryPath, ["merge-base", "--all", baseRef, "HEAD"]);

  if (result.status === 0) {
    return result.output.trim().length > 0;
  }

  if (result.status === 1) {
    return false;
  }

  throw new RepositoryError("Unable to compare base ref \"" + baseRef + "\" with HEAD.");
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  validateRepositoryPath(repositoryPath);
  const base = resolveBaseRef(repositoryPath, baseRef);
  const commonAncestor = hasCommonAncestor(repositoryPath, base);
  const range = commonAncestor ? [base + "...HEAD"] : [base, "HEAD"];

  const output = git(
    repositoryPath,
    [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      "--find-copies-harder",
      ...range,
      "--",
    ],
    "Unable to inspect changes from base ref \"" + base + "\".",
  );
  const files = parseNameStatus(output);
  const knownPaths = new Set(files.map((file) => file.path));
  const untracked = parseNulSeparatedPaths(
    git(
      repositoryPath,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      "Unable to inspect untracked files.",
    ),
  );

  for (const path of untracked) {
    if (!knownPaths.has(path)) {
      files.push({ path, status: "untracked" });
    }
  }

  return files;
}
