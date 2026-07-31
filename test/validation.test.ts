import { describe, expect, it } from "vitest";
import { runValidation, runValidations } from "../src/validation.js";

const nodeCommand = (source: string): string =>
  JSON.stringify(process.execPath) + " -e " + JSON.stringify(source);

describe("validation execution limits", () => {
  it("returns a failed result when a command times out", async () => {
    const result = await runValidation(
      nodeCommand("setTimeout(() => {}, 500)"),
      process.cwd(),
      { timeoutMs: 25 },
    );

    expect(result.status).toBe("failed");
    expect(result.timedOut).toBe(true);
  });

  it("returns a failed result when output exceeds the configured buffer", async () => {
    const result = await runValidation(
      nodeCommand("process.stdout.write('x'.repeat(4096))"),
      process.cwd(),
      { maxBuffer: 128 },
    );

    expect(result.status).toBe("failed");
    expect(result.output.length).toBeLessThan(4096);
  });

  it("rejects an excessive number of validation commands", async () => {
    await expect(
      runValidations(new Array(11).fill("echo test"), process.cwd()),
    ).rejects.toThrow("maximum is 10");
  });
});
