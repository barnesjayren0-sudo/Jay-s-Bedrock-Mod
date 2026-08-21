/** NestCord v1.9.0 config */
export const BRAND = "NestCord";
export const VERSION = "1.9.0";

export const ADMIN_TRIGGER = ".90909";
export const ADMIN_NAMES = [];

export const HOME_LIMIT = 3;
export const VIP_NAMES = [];
export const VIP_HOME_LIMIT = 10;

export const TP_COOLDOWN_SEC = 10;
export const COMBAT_TAG_SEC = 10;
export const HOME_SET_BLACKLIST = ["minecraft:nether"];
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

export const ECO_ENABLED = true;
export const ECO_START_BAL = 100;
export const ECO_DAILY_AMOUNT = 50;
export const ECO_DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export const CLAIM_ENABLED = true;
export const CLAIM_RADIUS = 8;
export const CLAIM_MAX_PER_PLAYER = 1;
/** If true, non-owners cannot break/place in claims */
export const CLAIM_PROTECT = true;
/** Admins (ADMIN_NAMES or empty list bypass) ignore claims */
export const CLAIM_ADMIN_BYPASS = true;

/** Jobs: !job / !jobs / !work */
export const JOBS_ENABLED = true;
export const JOB_PAY_COOLDOWN_MS = 5 * 60 * 1000; // 5 min between work pays
export const JOBS = {
  miner: { label: "Miner", pay: 25, desc: "Dig and earn" },
  farmer: { label: "Farmer", pay: 20, desc: "Harvest life" },
  hunter: { label: "Hunter", pay: 30, desc: "Combat pay" },
  builder: { label: "Builder", pay: 22, desc: "Place & build" },
};

/** Home compass — recovery compass; use item to open home GUI */
export const COMPASS_ENABLED = true;
export const COMPASS_ITEM = "minecraft:recovery_compass";

export const WEBHOOK_URL = "";
export const ADMIN_LOG_WEBHOOK = "";
export const REPORT_ON_FIRST_JOIN = true;
