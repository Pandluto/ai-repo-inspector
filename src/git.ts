import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import type { ChangedFile } from "./types.js";

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

function git(repositoryPath: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repositoryPath,
      encoding: "utf8",
    }).trim();
  } catch {
    throw new RepositoryError("Git could not inspect the requested repository.");
  }
}

function validateBaseRefInput(baseRef: string): void {
  if (!baseRef.trim() || baseRef.startsWith("-") || /[\s\0]/.test(baseRef)) {
    throw new RepositoryError("Invalid base ref \"" + baseRef + "\".");
  }
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

  try {
    const isWorkTree = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: repositoryPath,
      encoding: "utf8",
    }).trim();

    if (isWorkTree !== "true") {
      throw new Error("not a work tree");
    }
  } catch {
    throw new RepositoryError("Path is not a Git repository: " + repositoryPath + ".");
  }
}

export function validateBaseRef(repositoryPath: string, baseRef: string): void {
  validateBaseRefInput(baseRef);

  try {
    execFileSync(
      "git",
      ["rev-parse", "--verify", "--end-of-options", baseRef + "^{commit}"],
      {
        cwd: repositoryPath,
        encoding: "utf8",
      },
    );
  } catch {
    throw new RepositoryError("Base ref \"" + baseRef + "\" was not found in the repository.");
  }
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  validateRepositoryPath(repositoryPath);
  const base = baseRef ?? "main";
  validateBaseRef(repositoryPath, base);

  let output: string;
  try {
    output = git(repositoryPath, ["diff", "--name-status", base + "...HEAD"]);
  } catch {
    throw new RepositoryError("Unable to inspect changes from base ref \"" + base + "\".");
  }

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, ...pathParts] = line.split("\t");
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      return { path: pathParts.join("\t"), status };
    });
}
