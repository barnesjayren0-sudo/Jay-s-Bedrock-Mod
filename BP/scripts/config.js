/**
 * NestCord — config
 */
export const BRAND = "NestCord";
export const VERSION = "1.5.0";

/** Secret admin chat trigger */
export const ADMIN_TRIGGER = ".90909";

/** Max homes for normal players */
export const HOME_LIMIT = 3;

/**
 * VIP players get a higher home limit.
 * Match exact gamertags / names as shown in-game.
 */
export const VIP_NAMES = [
  // "YourName",
];

export const VIP_HOME_LIMIT = 10;

/** Optional Discord webhook (BDS) */
export const WEBHOOK_URL = "";
export const REPORT_ON_FIRST_JOIN = true;
export const REPORT_PLAYER_NAMES = false;
