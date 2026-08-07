import "server-only";

/** Module 5 Run 1 stays dark until a complete student workflow is released. */
export function isMultipleAskRun1Enabled(): boolean {
  return process.env.MULTIPLE_ASK_RUN1_ENABLED === "true";
}
