import { type LaoTaskState } from "./contracts.js";

const transitions: Record<LaoTaskState, readonly LaoTaskState[]> = {
  created: ["queued", "cancelled"],
  queued: ["preparing", "cancelled", "failed"],
  preparing: ["running", "failed", "cancelled", "interrupted"],
  running: ["validating", "failed", "cancelled", "interrupted"],
  validating: ["awaiting_review", "failed", "cancelled", "interrupted"],
  awaiting_review: ["approved", "rejected", "needs_revision", "cancelled"],
  needs_revision: ["queued", "cancelled"],
  approved: [],
  rejected: [],
  failed: [],
  cancelled: [],
  interrupted: ["queued", "cancelled"],
};

/** State changes do not confer approval. Review decisions are separate. */
export function assertLaoTransition(
  from: LaoTaskState,
  to: LaoTaskState,
  kind: "execution" | "review" | "recovery" = "execution",
): void {
  if (!transitions[from].includes(to)) {
    throw new Error(`Invalid LAO task transition: ${from} -> ${to}`);
  }
  const isReview = to === "approved" || to === "rejected" || to === "needs_revision";
  if (isReview && kind !== "review") throw new Error("Review decision required");
  if (!isReview && kind === "review") throw new Error("Review cannot change execution state");
  if (to === "interrupted" && kind !== "recovery") throw new Error("Recovery transition required");
  if (from === "interrupted" && kind !== "execution") throw new Error("Explicit resume required");
}
