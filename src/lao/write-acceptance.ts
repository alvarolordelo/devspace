import type { LaoTask } from "./contracts.js";
import type { LaoStoredWriteEvidence } from "./task-store.js";
import type { LaoStaticValidation } from "./write-validation.js";
import type { LaoSandboxTestEvidence } from "./write-test-sandbox.js";
import { normalizeLaoPatchPath } from "./worktree-patch.js";

export type LaoCriterionStatus = "passed" | "failed" | "unverified";
export interface LaoCriterionResult {
  criterion: string;
  check: "static_integrity" | "node_test" | "unsupported";
  status: LaoCriterionStatus;
  reason: string;
}
export interface LaoAcceptanceAssessment {
  taskId: string;
  runId: string;
  contentFingerprint: string;
  staticChecksPassed: boolean;
  criteria: LaoCriterionResult[];
  allCriteriaVerified: boolean;
  /** A machine check never substitutes for explicit approval or safe promotion. */
  humanReviewRequired: true;
  approvalAllowed: false;
  promotionAllowed: false;
}
const supportedTest = /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.test\.(?:js|mjs)$/;

/**
 * Deliberately narrow: only two declarative criterion forms have machine
 * semantics. Natural-language acceptance goals remain unverified.
 * A suite passing proves that suite exited zero, not semantic equivalence
 * between the test and an arbitrary goal.
 */
export function assessLaoWriteAcceptance(
  task: LaoTask,
  stored: Pick<LaoStoredWriteEvidence, "taskId" | "runId" | "evidence">,
  staticValidation: LaoStaticValidation,
  tests: readonly LaoSandboxTestEvidence[],
): LaoAcceptanceAssessment {
  if (task.id !== stored.taskId || task.workspaceId !== stored.evidence.workspaceId ||
      task.status !== "awaiting_review" || task.permissions.write !== "isolated_worktree" ||
      staticValidation.taskId !== task.id || staticValidation.workspaceId !== task.workspaceId ||
      staticValidation.runId !== stored.runId) {
    throw new Error("Assessment requires matching pending write and current static check");
  }
  const integrity = staticValidation.staticChecksPassed &&
    staticValidation.fingerprintMatches && staticValidation.headMatches &&
    staticValidation.pathsInScope && staticValidation.whitespaceClean;
  const criteria = task.acceptanceCriteria.map(criterion => {
    if (criterion === "static: integrity") {
      return {
        criterion, check: "static_integrity" as const,
        status: integrity ? "passed" as const : "failed" as const,
        reason: integrity ? "Worktree matches persisted patch and syntax checks" : "Static integrity gate failed",
      };
    }
    if (criterion.startsWith("node:test ")) {
      const file = criterion.slice("node:test ".length);
      let normalized: string;
      try {
        normalized = normalizeLaoPatchPath(file);
      } catch {
        return { criterion, check: "node_test" as const, status: "unverified" as const,
          reason: "Invalid declared baseline test path" };
      }
      if (normalized !== file || !supportedTest.test(file)) {
        return { criterion, check: "node_test" as const, status: "unverified" as const,
          reason: "Unsupported baseline test path" };
      }
      // Database row order is append-only; the latest attempted test controls.
      const latest = [...tests].reverse().find(entry =>
        entry.taskId === task.id && entry.runId === stored.runId &&
        entry.testFiles.includes(file));
      if (!latest) {
        return { criterion, check: "node_test" as const, status: "unverified" as const,
          reason: "No recorded run of this declared test" };
      }
      const valid = integrity &&
        latest.contentFingerprint === stored.evidence.contentFingerprint &&
        latest.integrityMaintained && latest.executed && latest.passed &&
        latest.exitCode === 0 && latest.failureCode === "none" &&
        latest.criteriaVerified === false && latest.approvalAllowed === false &&
        typeof latest.stdoutSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(latest.stdoutSha256) &&
        /^[a-z0-9][a-z0-9._/:+-]*@sha256:[a-f0-9]{64}$/.test(latest.image);
      return {
        criterion, check: "node_test" as const,
        status: valid ? "passed" as const : "failed" as const,
        reason: valid ? "Latest isolated suite passed against matching patch fingerprint" :
          "Latest suite failed, was unavailable or refers to a different patch",
      };
    }
    return {
      criterion, check: "unsupported" as const, status: "unverified" as const,
      reason: "Natural language requires explicit human verification; no automatic inference",
    };
  });
  return {
    taskId: task.id, runId: stored.runId,
    contentFingerprint: stored.evidence.contentFingerprint,
    staticChecksPassed: integrity,
    criteria, allCriteriaVerified: integrity && criteria.length > 0 &&
      criteria.every(item => item.status === "passed"),
    humanReviewRequired: true, approvalAllowed: false, promotionAllowed: false,
  };
}
