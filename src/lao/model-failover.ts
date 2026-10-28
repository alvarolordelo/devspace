import { LaoOllamaError } from "./ollama-client.js";

export type LaoModelAttemptErrorCode =
  | "UNSUPPORTED_CAPABILITY" | "EMPTY_RESPONSE" | "INVALID_MODEL_OUTPUT";

/** Failures that are safe to retry on another LOCAL model before side effects. */
export class LaoModelAttemptError extends Error {
  constructor(readonly code: LaoModelAttemptErrorCode, message: string) {
    super(message);
    this.name = "LaoModelAttemptError";
  }
}

export function laoModelCandidates(primary: string, fallback: string | null | undefined): string[] {
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

export function laoFailoverAllowed(error: unknown): boolean {
  if (error instanceof LaoModelAttemptError) return true;
  return error instanceof LaoOllamaError &&
    ["TIMEOUT", "HTTP_ERROR", "INVALID_RESPONSE"].includes(error.code);
}

export function laoModelErrorCode(error: unknown): string {
  if (error instanceof LaoModelAttemptError || error instanceof LaoOllamaError) return error.code;
  return "EXECUTION_ERROR";
}
