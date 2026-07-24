/** Feature gate for the local-only operator surface. This is server/proxy-only. */
export function isAdminPanelEnabled(): boolean {
  return process.env.ADMIN_PANEL_ENABLED === "true";
}
