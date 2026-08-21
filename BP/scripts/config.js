/**
 * Jay's Bedrock Mod — config
 *
 * SERVER REPORTING:
 * Bedrock cannot secretly scan the internet for servers using your pack.
 * A server only shows up if THIS pack runs there and reporting is enabled.
 *
 * 1) Create a Discord webhook (Server Settings → Integrations → Webhooks)
 * 2) Paste the URL below
 * 3) Only use on worlds/servers you own or that agreed to analytics
 *
 * Leave empty ("") to disable all outbound reports.
 */
export const WEBHOOK_URL = ""; // e.g. "https://discord.com/api/webhooks/..."

/** Report once per world session when the first player joins */
export const REPORT_ON_FIRST_JOIN = true;

/** Include online player names in the report (privacy-sensitive — keep false) */
export const REPORT_PLAYER_NAMES = false;
