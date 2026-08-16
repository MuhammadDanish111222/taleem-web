import "server-only";

/**
 * Lifecycle is authoritatively evaluated by the AI service against PostgreSQL.
 * This compatibility function only preserves emergency transport kill
 * switches; neither can enable the feature or become a second lifecycle
 * source of truth.
 */
export function isMultipleAskRun1Enabled(): boolean {
  return process.env.MULTIPLE_ASK_TRANSPORT_DISABLED !== "true"
    // This is only a local transport exposure switch. It defaults closed and
    // cannot make a database-disabled lifecycle state available: the service
    // independently reads feature.multiple_ask before handling a request.
    && process.env.MULTIPLE_ASK_RUN1_ENABLED === "true";
}
