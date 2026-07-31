import { exec } from "node:child_process";
import type { ValidationResult } from "./types.js";

export const VALIDATION_TIMEOUT_MS = 30_000;
export const VALIDATION_MAX_BUFFER = 64 * 1024;
export const MAX_VALIDATION_COMMANDS = 10;
export const MAX_VALIDATION_COMMAND_LENGTH = 1_000;

export class ValidationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationInputError";
  }
}

export type ValidationRunOptions = {
  timeoutMs?: number;
  maxBuffer?: number;
};

function validateCommand(command: string): void {
  if (!command.trim()) {
    throw new ValidationInputError("Validation command must not be empty.");
  }

  if (command.length > MAX_VALIDATION_COMMAND_LENGTH) {
    throw new ValidationInputError(
      "Validation command exceeds the maximum length of " +
        MAX_VALIDATION_COMMAND_LENGTH +
        " characters.",
    );
  }
}

export function runValidation(
  command: string,
  cwd: string,
  options: ValidationRunOptions = {},
): Promise<ValidationResult> {
  validateCommand(command);

  return new Promise((resolve) => {
    try {
      exec(
        command,
        {
          cwd,
          timeout: options.timeoutMs ?? VALIDATION_TIMEOUT_MS,
          maxBuffer: options.maxBuffer ?? VALIDATION_MAX_BUFFER,
        },
        (error, stdout, stderr) => {
          const errorCode = error && typeof error.code === "number" ? error.code : null;
          const timedOut = Boolean(error && error.killed);

          resolve({
            command,
            status: error ? "failed" : "passed",
            output: stdout || "",
            stderr: stderr || "",
            exitCode: error ? errorCode : 0,
            timedOut,
          });
        },
      );
    } catch (error) {
      resolve({
        command,
        status: "failed",
        output: "",
        stderr: error instanceof Error ? error.message : "Validation command could not start.",
        exitCode: null,
        timedOut: false,
      });
    }
  });
}

export async function runValidations(
  commands: string[],
  cwd: string,
): Promise<ValidationResult[]> {
  if (commands.length > MAX_VALIDATION_COMMANDS) {
    throw new ValidationInputError(
      "Too many validation commands; the maximum is " + MAX_VALIDATION_COMMANDS + ".",
    );
  }

  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd));
  }
  return results;
}
