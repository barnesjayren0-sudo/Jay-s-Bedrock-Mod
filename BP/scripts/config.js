/**
 * NestCord — config
 */
export const BRAND = "NestCord";
export const VERSION = "1.6.0";

export const ADMIN_TRIGGER = ".90909";

export const HOME_LIMIT = 3;
export const VIP_NAMES = [];
export const VIP_HOME_LIMIT = 10;

/** TPA request expires after this many ms */
export const TPA_TIMEOUT_MS = 60000;

/** RTP cooldown seconds */
export const RTP_COOLDOWN_SEC = 60;

/** RTP search radius from 0,0 */
export const RTP_RANGE = 2000;

/** Max attempts to find safe ground */
export const RTP_MAX_TRIES = 12;

/** Give starter kit once per player */
export const STARTER_KIT_ENABLED = true;

/** Item typeIds for starter kit */
export const STARTER_KIT = [
  { id: "minecraft:wooden_sword", amount: 1 },
  { id: "minecraft:wooden_pickaxe", amount: 1 },
  { id: "minecraft:wooden_axe", amount: 1 },
  { id: "minecraft:bread", amount: 16 },
  { id: "minecraft:torch", amount: 16 },
];

export const WEBHOOK_URL = "";
export const REPORT_ON_FIRST_JOIN = true;
export const REPORT_PLAYER_NAMES = false;
