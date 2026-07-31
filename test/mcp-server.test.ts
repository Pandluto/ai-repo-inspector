import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(projectRoot, "src/mcp-server.ts");
const tsxEntry = join(projectRoot, "node_modules/tsx/dist/cli.mjs");

let client: Client;
let transport: StdioClientTransport;
const fixtures: string[] = [];

function git(repositoryPath: string, args: string[]): void {
  execFileSync("git", args, { cwd: repositoryPath, stdio: "ignore" });
}

async function createFixture(): Promise<string> {
  const repositoryPath = await mkdtemp(join(tmpdir(), "ai-repo-inspector-mcp-"));
  fixtures.push(repositoryPath);

  git(repositoryPath, ["init", "-b", "main"]);
  git(repositoryPath, ["config", "user.email", "mcp-test@example.com"]);
  git(repositoryPath, ["config", "user.name", "MCP Test"]);
  await writeFile(join(repositoryPath, "README.md"), "base\n");
  git(repositoryPath, ["add", "README.md"]);
  git(repositoryPath, ["commit", "-m", "base"]);
  git(repositoryPath, ["switch", "-c", "feature"]);
  await writeFile(join(repositoryPath, "feature-marker.txt"), "feature\n");
  git(repositoryPath, ["add", "feature-marker.txt"]);
  git(repositoryPath, ["commit", "-m", "feature"]);

  return repositoryPath;
}

async function callReview(repositoryPath: string, extra: Record<string, unknown> = {}) {
  return client.callTool({
    name: "review_repository",
    arguments: { repo_path: repositoryPath, ...extra },
  });
}

function resultText(result: Awaited<ReturnType<typeof callReview>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;

  return content
    .filter((item): item is { type: "text"; text: string } =>
      item.type === "text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n");
}

describe("MCP repository inspector contract", () => {
  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [tsxEntry, serverEntry],
      cwd: projectRoot,
      stderr: "ignore",
    });
    client = new Client({ name: "mcp-contract-test", version: "1.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await Promise.all(fixtures.map((fixture) => rm(fixture, { recursive: true, force: true })));
  });

  it("initializes and discovers review_repository with the public repo_path field", async () => {
    expect(client.getServerVersion()).toMatchObject({
      name: "repository-inspector",
      version: "2.0.0",
    });

    const tools = await client.listTools();
    const reviewTool = tools.tools.find((tool) => tool.name === "review_repository");

    expect(reviewTool).toBeDefined();
    expect(reviewTool?.inputSchema.properties).toHaveProperty("repo_path");
  });

  it("reviews the requested repository instead of the MCP server cwd", async () => {
    const repositoryPath = await createFixture();
    const result = await callReview(repositoryPath, { baseRef: "main" });
    const text = resultText(result);

    expect(result.isError).not.toBe(true);
    expect(text).toContain(repositoryPath);
    expect(text).toContain("feature-marker.txt");
    expect(text).not.toContain("research.md");
  });

  it("returns a clear MCP error for an invalid repository path", async () => {
    const repositoryPath = join(tmpdir(), "ai-repo-inspector-path-that-does-not-exist");
    const result = await callReview(repositoryPath);
    const text = resultText(result);

    expect(result.isError).toBe(true);
    expect(text.toLowerCase()).toContain("repository path");
    expect(text).not.toContain("at ");
  });

  it("returns a clear MCP error for an invalid base ref", async () => {
    const repositoryPath = await createFixture();
    const result = await callReview(repositoryPath, { baseRef: "missing-base-ref" });
    const text = resultText(result);

    expect(result.isError).toBe(true);
    expect(text.toLowerCase()).toContain("base ref");
    expect(text).not.toContain("at ");
  });

  it("reports failed validation and still runs later validations", async () => {
    const repositoryPath = await createFixture();
    const markerPath = join(repositoryPath, "later-validation-ran.txt");
    const failedCommand =
      JSON.stringify(process.execPath) +
      " -e " +
      JSON.stringify("process.stderr.write('first stderr'); process.exit(7)");
    const laterCommand =
      JSON.stringify(process.execPath) +
      " -e " +
      JSON.stringify(
        "require('node:fs').writeFileSync(" + JSON.stringify(markerPath) + ", 'later ran')",
      );

    const result = await callReview(repositoryPath, {
      baseRef: "main",
      validationCommands: [failedCommand, laterCommand],
      allow_shell_validation: true,
    });
    const text = resultText(result);

    expect(result.isError).not.toBe(true);
    expect(text).toContain("failed");
    expect(text).toContain("7");
    expect(text).toContain("first stderr");
    expect(text).toContain("later-validation-ran.txt");
    await expect(readFile(markerPath, "utf8")).resolves.toBe("later ran");
  });

  it("requires explicit opt-in before running shell validation commands", async () => {
    const repositoryPath = await createFixture();
    const result = await callReview(repositoryPath, {
      baseRef: "main",
      validationCommands: ["echo should-not-run"],
    });
    const text = resultText(result);

    expect(result.isError).toBe(true);
    expect(text).toContain("allow_shell_validation=true");
  });
});
