#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reviewRepository } from "./core.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

const reviewInputSchema = {
  repo_path: z.string().min(1).describe("Repository path to inspect."),
  baseRef: z.string().min(1).optional(),
  validationCommands: z.array(z.string().min(1)).optional(),
};

type ReviewInput = z.infer<z.ZodObject<typeof reviewInputSchema>>;

function publicErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Repository review failed.";
}

server.tool(
  "review_repository",
  "Inspects a Git repository and returns a review report.",
  reviewInputSchema,
  async (input: ReviewInput) => {
    try {
      const report = await reviewRepository({
        repositoryPath: input.repo_path,
        baseRef: input.baseRef,
        validationCommands: input.validationCommands,
      });

      return { content: [{ type: "text", text: report }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: publicErrorMessage(error) }],
      };
    }
  },
);

await server.connect(new StdioServerTransport());
