/**
 * NestCord — config
 */
export const BRAND = "NestCord";
export const VERSION = "1.7.0";

/** Change this to your secret admin chat code */
export const ADMIN_TRIGGER = ".90909";

/**
 * Optional owner whitelist (exact in-game names).
 * If non-empty, ONLY these names can open the admin panel with ADMIN_TRIGGER.
 * Leave [] to allow anyone who knows the code (not recommended for public worlds).
 */
export const ADMIN_NAMES = [
  // "YourGamertag",
];

export const HOME_LIMIT = 3;
export const VIP_NAMES = [];
export const VIP_HOME_LIMIT = 10;

export const TPA_TIMEOUT_MS = 60000;
export const RTP_COOLDOWN_SEC = 60;
export const RTP_RANGE = 2000;
export const RTP_MAX_TRIES = 12;

/** Freeze duration default (seconds) — 0 = until unfreeze */
export const FREEZE_DEFAULT_SEC = 0;

export const STARTER_KIT_ENABLED = true;
export const STARTER_KIT = [
  { id: "minecraft:wooden_sword", amount: 1 },
  { id: "minecraft:wooden_pickaxe", amount: 1 },
  { id: "minecraft:wooden_axe", amount: 1 },
  { id: "minecraft:bread", amount: 16 },
  { id: "minecraft:torch", amount: 16 },
];

/** Presence / general webhook */
export const WEBHOOK_URL = "";
export const REPORT_ON_FIRST_JOIN = true;
export const REPORT_PLAYER_NAMES = false;

/**
 * Admin action log (TP, gamemode, inspect, freeze, kick…).
 * Can be same as WEBHOOK_URL or a separate channel webhook.
 */
export const ADMIN_LOG_WEBHOOK = "";
