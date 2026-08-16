import "server-only";

/**
 * Lifecycle is authoritatively evaluated by the AI service against PostgreSQL.
 * This compatibility function now only preserves an emergency transport kill
 * switch; it is not a second feature-state source of truth.
 */
export function isMultipleAskRun1Enabled(): boolean {
  return process.env.MULTIPLE_ASK_TRANSPORT_DISABLED !== "true";
}
