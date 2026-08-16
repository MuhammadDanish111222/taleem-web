import "server-only";

/**
 * Lifecycle is authoritatively evaluated by the AI service against PostgreSQL.
 * This compatibility function only preserves emergency transport kill
 * switches; neither can enable the feature or become a second lifecycle
 * source of truth.
 */
export function isMultipleAskRun1Enabled(): boolean {
  return process.env.MULTIPLE_ASK_TRANSPORT_DISABLED !== "true"
    && process.env.MULTIPLE_ASK_RUN1_ENABLED !== "false";
}
