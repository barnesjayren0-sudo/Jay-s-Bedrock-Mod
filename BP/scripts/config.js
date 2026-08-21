/** NestCord config v1.8.0 */
export const BRAND = "NestCord";
export const VERSION = "1.8.0";

export const ADMIN_TRIGGER = ".90909";
export const ADMIN_NAMES = [];

export const HOME_LIMIT = 3;
export const VIP_NAMES = [];
export const VIP_HOME_LIMIT = 10;

/** Seconds between teleports (home/warp/spawn/rtp/tpa) */
export const TP_COOLDOWN_SEC = 10;

/** Block home/warp/spawn after damage for this many seconds */
export const COMBAT_TAG_SEC = 10;

/** Dimensions where players cannot SET homes (teleport still ok) */
export const HOME_SET_BLACKLIST = [
  "minecraft:nether",
  // "minecraft:the_end",
];

/** Safe landing: search up/down this many blocks */
export const SAFE_LANDING_RANGE = 6;

export const TPA_TIMEOUT_MS = 60000;
export const RTP_COOLDOWN_SEC = 60;
export const RTP_RANGE = 2000;
export const RTP_MAX_TRIES = 12;
export const FREEZE_DEFAULT_SEC = 0;

export const STARTER_KIT_ENABLED = true;
export const STARTER_KIT = [
  { id: "minecraft:wooden_sword", amount: 1 },
  { id: "minecraft:wooden_pickaxe", amount: 1 },
  { id: "minecraft:wooden_axe", amount: 1 },
  { id: "minecraft:bread", amount: 16 },
  { id: "minecraft:torch", amount: 16 },
];

/** Economy */
export const ECO_ENABLED = true;
export const ECO_START_BAL = 100;
export const ECO_DAILY_AMOUNT = 50;
export const ECO_DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h

/** Simple land claim radius (blocks) */
export const CLAIM_ENABLED = true;
export const CLAIM_RADIUS = 8;
export const CLAIM_MAX_PER_PLAYER = 1;

export const WEBHOOK_URL = "";
export const ADMIN_LOG_WEBHOOK = "";
export const REPORT_ON_FIRST_JOIN = true;
