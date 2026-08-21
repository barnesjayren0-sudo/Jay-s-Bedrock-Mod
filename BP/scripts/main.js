/**
 * NestCord v1.7.0
 */
import { world, system, GameMode, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import {
  BRAND,
  VERSION,
  ADMIN_TRIGGER,
  ADMIN_NAMES,
  HOME_LIMIT,
  VIP_NAMES,
  VIP_HOME_LIMIT,
  TPA_TIMEOUT_MS,
  RTP_COOLDOWN_SEC,
  RTP_RANGE,
  RTP_MAX_TRIES,
  FREEZE_DEFAULT_SEC,
  STARTER_KIT_ENABLED,
  STARTER_KIT,
  WEBHOOK_URL,
  REPORT_ON_FIRST_JOIN,
  ADMIN_LOG_WEBHOOK,
} from "./config.js";

const HOMES_KEY = "nestcord_homes_v1";
const META_KEY = "nestcord_meta_v1";
const WARPS_KEY = "nestcord_warps_v1";
const FLAGS_KEY = "nestcord_flags_v1";

const tpaRequests = new Map();
const rtpCooldown = new Map();
/** @type {Map<string, { x:number,y:number,z:number,dim:string, until:number }>} */
const frozen = new Map();

let reportedThisSession = false;

function say(player, msg) {
  try {
    player.sendMessage(msg);
  } catch (_) {}
}

function dimShort(id) {
  return String(id || "").replace("minecraft:", "");
}

function safeName(raw, fallback = "home") {
  let n = String(raw ?? fallback).trim();
  if (!n) n = fallback;
  return n.replace(/[^a-zA-Z0-9_\- ]/g, "").slice(0, 24) || fallback;
}

function isVip(player) {
  return VIP_NAMES.some((n) => String(n).toLowerCase() === player.name.toLowerCase());
}

function isAdminName(player) {
  if (!ADMIN_NAMES || ADMIN_NAMES.length === 0) return true;
  return ADMIN_NAMES.some((n) => String(n).toLowerCase() === player.name.toLowerCase());
}

function homeLimitFor(player) {
  return isVip(player) ? VIP_HOME_LIMIT : HOME_LIMIT;
}

function posPayload(player) {
  const loc = player.location;
  return { x: Number(loc.x), y: Number(loc.y), z: Number(loc.z), dim: player.dimension.id };
}

function findPlayerByName(name) {
  const q = String(name || "").toLowerCase();
  if (!q) return null;
  for (const p of world.getPlayers()) {
    if (p.name.toLowerCase() === q) return p;
  }
  const partial = [...world.getPlayers()].filter((p) => p.name.toLowerCase().includes(q));
  return partial.length === 1 ? partial[0] : null;
}

function loadJson(key, fallback) {
  try {
    const raw = world.getDynamicProperty(key);
    if (typeof raw !== "string" || !raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveJson(key, data) {
  try {
    world.setDynamicProperty(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`[${BRAND}] save ${key}: ${e}`);
  }
}

async function postWebhook(url, content) {
  if (!url || !String(url).startsWith("http")) return false;
  try {
    const net = await import("@minecraft/server-net");
    if (!net.http || !net.HttpRequest) return false;
    const req = new net.HttpRequest(url);
    req.method = net.HttpRequestMethod.Post;
    req.body = JSON.stringify({ content: String(content).slice(0, 1900) });
    req.headers = [new net.HttpHeader("Content-Type", "application/json")];
    await net.http.request(req);
    return true;
  } catch (e) {
    console.warn(`[${BRAND}] webhook: ${e}`);
    return false;
  }
}

function adminLog(admin, action) {
  const line = `**[ADMIN]** ${admin.name}: ${action} · ${new Date().toISOString()}`;
  console.warn(`[${BRAND}] ${line}`);
  const url = ADMIN_LOG_WEBHOOK || WEBHOOK_URL;
  system.run(() => postWebhook(url, line));
}

// meta / flags / warps / homes (same as 1.6)
function loadMeta() {
  return loadJson(META_KEY, {});
}
function saveMeta(d) {
  saveJson(META_KEY, d);
}
function setBack(player) {
  const meta = loadMeta();
  if (!meta[player.id]) meta[player.id] = {};
  meta[player.id].back = posPayload(player);
  saveMeta(meta);
}
function getBack(player) {
  const m = loadMeta();
  return m[player.id] && m[player.id].back;
}
function setDeath(player) {
  const meta = loadMeta();
  if (!meta[player.id]) meta[player.id] = {};
  meta[player.id].back = posPayload(player);
  saveMeta(meta);
}

function loadFlags() {
  return loadJson(FLAGS_KEY, { starter: {} });
}
function hasStarter(player) {
  const f = loadFlags();
  return !!(f.starter && f.starter[player.id]);
}
function markStarter(player) {
  const f = loadFlags();
  if (!f.starter) f.starter = {};
  f.starter[player.id] = true;
  saveJson(FLAGS_KEY, f);
}

function loadWarps() {
  return loadJson(WARPS_KEY, {});
}
function saveWarps(w) {
  saveJson(WARPS_KEY, w);
}

function loadStore() {
  const data = loadJson(HOMES_KEY, { players: {}, meta: {} });
  if (!data.players) data.players = {};
  if (!data.meta) data.meta = {};
  return data;
}
function saveStore(data) {
  saveJson(HOMES_KEY, data);
}
function getHomesMap(player) {
  const store = loadStore();
  if (!store.players[player.id]) store.players[player.id] = {};
  return { store, homes: store.players[player.id] };
}
function listHomeNames(player) {
  return Object.keys(getHomesMap(player).homes);
}
function getHome(player, name) {
  return getHomesMap(player).homes[name];
}
function saveHome(player, name) {
  name = safeName(name);
  const { store, homes } = getHomesMap(player);
  const limit = homeLimitFor(player);
  const isUpdate = Object.prototype.hasOwnProperty.call(homes, name);
  if (!isUpdate && Object.keys(homes).length >= limit) {
    say(player, `§c[${BRAND}] Home limit ${limit}.`);
    return null;
  }
  homes[name] = posPayload(player);
  store.players[player.id] = homes;
  store.meta[player.id] = player.name;
  saveStore(store);
  return name;
}
function deleteHome(player, name) {
  const { store, homes } = getHomesMap(player);
  if (!homes[name]) return false;
  delete homes[name];
  store.players[player.id] = homes;
  saveStore(store);
  return true;
}

function teleportTo(player, h, label, recordBack = true) {
  if (!h || h.x === undefined) {
    say(player, "§cInvalid location.");
    return false;
  }
  if (recordBack) setBack(player);
  try {
    const dimension = world.getDimension(h.dim || "minecraft:overworld");
    player.teleport({ x: h.x, y: h.y, z: h.z }, { dimension });
    say(player, `§a[${BRAND}] → §f${label}`);
    return true;
  } catch (e) {
    say(player, `§cTP failed: ${e}`);
    return false;
  }
}

function goSpawn(player) {
  try {
    setBack(player);
    if (typeof world.getDefaultSpawnLocation === "function") {
      const spawn = world.getDefaultSpawnLocation();
      player.teleport(
        { x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5 },
        { dimension: world.getDimension("minecraft:overworld") }
      );
      say(player, `§a[${BRAND}] → spawn`);
      return;
    }
  } catch (_) {}
  say(player, `§c[${BRAND}] Spawn unavailable.`);
}

function goBack(player) {
  const h = getBack(player);
  if (!h) {
    say(player, `§c[${BRAND}] No back location.`);
    return;
  }
  const cur = posPayload(player);
  teleportTo(player, h, "back", false);
  const meta = loadMeta();
  if (!meta[player.id]) meta[player.id] = {};
  meta[player.id].back = cur;
  saveMeta(meta);
}

function listHomesChat(player) {
  const names = listHomeNames(player);
  const limit = homeLimitFor(player);
  if (!names.length) {
    say(player, `§e[${BRAND}] No homes (${limit} max)`);
    return;
  }
  say(player, `§d[${BRAND}] ${names.length}/${limit}`);
  for (const n of names) {
    const h = getHome(player, n);
    say(player, `§7- §f${n} §8${dimShort(h.dim)} ${h.x.toFixed(0)}, ${h.y.toFixed(0)}, ${h.z.toFixed(0)}`);
  }
}

function ownerLabel(id, meta) {
  for (const p of world.getPlayers()) if (p.id === id) return p.name;
  return (meta && meta[id]) || id.slice(0, 8);
}

// freeze loop
system.runInterval(() => {
  const now = Date.now();
  for (const [id, data] of frozen.entries()) {
    if (data.until > 0 && now > data.until) {
      frozen.delete(id);
      continue;
    }
    for (const p of world.getPlayers()) {
      if (p.id !== id) continue;
      try {
        const dim = world.getDimension(data.dim);
        p.teleport({ x: data.x, y: data.y, z: data.z }, { dimension: dim });
      } catch (_) {}
    }
  }
}, 1);

function freezePlayer(admin, target, sec) {
  const pos = posPayload(target);
  const until = sec > 0 ? Date.now() + sec * 1000 : 0;
  frozen.set(target.id, { ...pos, until });
  say(target, `§c[${BRAND}] You are frozen by staff.`);
  say(admin, `§a[${BRAND}] Froze §f${target.name}${sec > 0 ? ` §7(${sec}s)` : " §7(until unfreeze)"}`);
  adminLog(admin, `freeze ${target.name}${sec > 0 ? ` ${sec}s` : ""}`);
}

function unfreezePlayer(admin, target) {
  frozen.delete(target.id);
  say(target, `§a[${BRAND}] Unfrozen.`);
  say(admin, `§a[${BRAND}] Unfroze §f${target.name}`);
  adminLog(admin, `unfreeze ${target.name}`);
}

function invsee(admin, target) {
  try {
    const inv = target.getComponent("minecraft:inventory");
    if (!inv || !inv.container) {
      say(admin, `§c[${BRAND}] No inventory component.`);
      return;
    }
    const c = inv.container;
    const counts = new Map();
    for (let i = 0; i < c.size; i++) {
      const item = c.getItem(i);
      if (!item) continue;
      const id = item.typeId.replace("minecraft:", "");
      counts.set(id, (counts.get(id) || 0) + item.amount);
    }
    if (counts.size === 0) {
      say(admin, `§e[${BRAND}] ${target.name} inventory empty.`);
      adminLog(admin, `invsee ${target.name} (empty)`);
      return;
    }
    say(admin, `§6[${BRAND}] Inv §f${target.name}§6:`);
    const lines = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [id, n] of lines.slice(0, 40)) {
      say(admin, `§7- §f${id} §ex${n}`);
    }
    if (lines.length > 40) say(admin, `§8… +${lines.length - 40} more`);
    adminLog(admin, `invsee ${target.name} (${lines.length} stacks)`);
  } catch (e) {
    say(admin, `§cInvsee failed: ${e}`);
  }
}

function warnPlayer(admin, target, reason) {
  const r = reason || "No reason given";
  say(target, `§c§l[${BRAND} WARNING]§r §c${r}`);
  say(target, `§7From staff: §f${admin.name}`);
  say(admin, `§aWarned §f${target.name}`);
  adminLog(admin, `warn ${target.name}: ${r}`);
}

function kickPlayer(admin, target, reason) {
  const r = reason || "Kicked by staff";
  say(target, `§c§l[${BRAND}] Kicked: §f${r}`);
  adminLog(admin, `kick ${target.name}: ${r}`);
  system.run(() => {
    try {
      // Bedrock Script API — kick if available
      if (typeof target.kick === "function") {
        target.kick(r);
        say(admin, `§aKicked §f${target.name}`);
        return;
      }
    } catch (_) {}
    try {
      target.runCommand(`kick "${target.name}" ${r}`);
      say(admin, `§aKick command sent for §f${target.name}`);
    } catch (e) {
      // fallback: freeze + clear message
      freezePlayer(admin, target, 0);
      say(admin, `§eKick API unavailable — froze §f${target.name} §einstead. (${e})`);
    }
  });
}

function spectatePlayer(admin, target) {
  setBack(admin);
  try {
    admin.setGameMode(GameMode.spectator);
  } catch (_) {
    try {
      admin.runCommand("gamemode spectator @s");
    } catch (__) {}
  }
  try {
    admin.teleport(target.location, { dimension: target.dimension });
    say(admin, `§d[${BRAND}] Spectating §f${target.name}`);
    adminLog(admin, `spectate ${target.name}`);
  } catch (e) {
    say(admin, `§cSpectate TP failed: ${e}`);
  }
}

function giveStarterKit(player) {
  if (!STARTER_KIT_ENABLED || hasStarter(player)) return;
  try {
    for (const entry of STARTER_KIT) {
      player.dimension.spawnItem(new ItemStack(entry.id, entry.amount || 1), player.location);
    }
    markStarter(player);
    say(player, `§a[${BRAND}] Starter kit delivered.`);
  } catch (_) {
    try {
      for (const entry of STARTER_KIT) {
        player.runCommand(`give @s ${entry.id.replace("minecraft:", "")} ${entry.amount || 1}`);
      }
      markStarter(player);
    } catch (e2) {
      console.warn(`[${BRAND}] kit: ${e2}`);
    }
  }
}

function requestTpa(from, targetName) {
  const target = findPlayerByName(targetName);
  if (!target) {
    say(from, `§cPlayer not found.`);
    return;
  }
  if (target.id === from.id) {
    say(from, `§cCan't TPA yourself.`);
    return;
  }
  tpaRequests.set(target.id, { fromId: from.id, fromName: from.name, expires: Date.now() + TPA_TIMEOUT_MS });
  say(from, `§aTPA → §f${target.name}`);
  say(target, `§e${from.name} requests TPA. §a!tpaccept §7/ §c!tpadeny`);
}

function acceptTpa(target) {
  const req = tpaRequests.get(target.id);
  if (!req || Date.now() > req.expires) {
    tpaRequests.delete(target.id);
    say(target, `§cNo pending TPA.`);
    return;
  }
  tpaRequests.delete(target.id);
  let from = null;
  for (const p of world.getPlayers()) if (p.id === req.fromId) from = p;
  if (!from) {
    say(target, `§cRequester offline.`);
    return;
  }
  setBack(from);
  try {
    from.teleport(target.location, { dimension: target.dimension });
    say(from, `§aTPA accepted.`);
    say(target, `§aAccepted §f${from.name}`);
  } catch (e) {
    say(target, `§c${e}`);
  }
}

function denyTpa(target) {
  const req = tpaRequests.get(target.id);
  if (!req) {
    say(target, `§cNo pending TPA.`);
    return;
  }
  tpaRequests.delete(target.id);
  say(target, `§7Denied.`);
  for (const p of world.getPlayers()) {
    if (p.id === req.fromId) say(p, `§c${target.name} denied TPA.`);
  }
}

function setWarp(admin, name) {
  name = safeName(name, "warp").toLowerCase().replace(/ /g, "_");
  const warps = loadWarps();
  warps[name] = posPayload(admin);
  saveWarps(warps);
  say(admin, `§aWarp §f${name} §aset.`);
  adminLog(admin, `setwarp ${name}`);
}
function delWarp(admin, name) {
  name = safeName(name, "").toLowerCase().replace(/ /g, "_");
  const warps = loadWarps();
  if (!warps[name]) {
    say(admin, `§cNo warp.`);
    return;
  }
  delete warps[name];
  saveWarps(warps);
  say(admin, `§cWarp deleted.`);
  adminLog(admin, `delwarp ${name}`);
}
function listWarps(player) {
  const names = Object.keys(loadWarps());
  say(player, names.length ? `§dWarps: §f${names.join(", ")}` : `§eNo warps.`);
}
function goWarp(player, name) {
  if (!name) return listWarps(player);
  name = String(name).toLowerCase().replace(/ /g, "_");
  const h = loadWarps()[name];
  if (!h) {
    say(player, `§cUnknown warp.`);
    return;
  }
  teleportTo(player, h, `warp:${name}`);
}

function isSafeBlock(block) {
  if (!block || !block.typeId || block.typeId === "minecraft:air") return false;
  const id = block.typeId;
  if (id.includes("lava") || id.includes("fire") || id.includes("cactus") || id.includes("water")) return false;
  return true;
}

function tryRtp(player) {
  const now = Date.now();
  const left = RTP_COOLDOWN_SEC * 1000 - (now - (rtpCooldown.get(player.id) || 0));
  if (left > 0) {
    say(player, `§cRTP cooldown ${Math.ceil(left / 1000)}s`);
    return;
  }
  const overworld = world.getDimension("minecraft:overworld");
  for (let i = 0; i < RTP_MAX_TRIES; i++) {
    const x = Math.floor((Math.random() * 2 - 1) * RTP_RANGE);
    const z = Math.floor((Math.random() * 2 - 1) * RTP_RANGE);
    try {
      for (let y = 120; y >= 40; y--) {
        const block = overworld.getBlock({ x, y, z });
        const a1 = overworld.getBlock({ x, y: y + 1, z });
        const a2 = overworld.getBlock({ x, y: y + 2, z });
        if (isSafeBlock(block) && a1?.typeId === "minecraft:air" && a2?.typeId === "minecraft:air") {
          setBack(player);
          player.teleport({ x: x + 0.5, y: y + 1, z: z + 0.5 }, { dimension: overworld });
          rtpCooldown.set(player.id, now);
          say(player, `§aRTP → ${x}, ${y + 1}, ${z}`);
          return;
        }
      }
    } catch (_) {}
  }
  say(player, `§cRTP failed.`);
}

async function tryReport(player) {
  if (!WEBHOOK_URL || !REPORT_ON_FIRST_JOIN || reportedThisSession) return;
  reportedThisSession = true;
  await postWebhook(WEBHOOK_URL, `**${BRAND}** v${VERSION} online · ${player.name}`);
}

// ─── player pick helper for admin tools ──────────────────
async function pickOnlinePlayer(admin, title, body) {
  const players = [...world.getPlayers()].filter((p) => p.id !== admin.id);
  if (!players.length) {
    say(admin, `§cNo other players.`);
    return null;
  }
  const form = new ActionFormData().title(title).body(body || "§7Select:");
  for (const p of players) {
    const l = p.location;
    form.button(`§f${p.name}\n§8${dimShort(p.dimension.id)} ${l.x.toFixed(0)}, ${l.y.toFixed(0)}, ${l.z.toFixed(0)}`);
  }
  form.button("§8Back");
  const res = await form.show(admin);
  if (res.canceled || res.selection === players.length) return null;
  return players[res.selection] || null;
}

async function promptReason(admin, title) {
  const modal = new ModalFormData()
    .title(title)
    .textField("Reason", "optional", { defaultValue: "" });
  const res = await modal.show(admin);
  if (res.canceled || !res.formValues) return null;
  return String(res.formValues[0] || "").trim() || "No reason given";
}

// ─── home UI (compact) ───────────────────────────────────
async function uiHomeRoot(player) {
  const names = listHomeNames(player);
  const limit = homeLimitFor(player);
  const form = new ActionFormData()
    .title(`§d${BRAND} Homes`)
    .body(`§7${names.length}/${limit}`)
    .button("§aSave")
    .button("§bTeleport")
    .button("§cDelete")
    .button("§eList")
    .button("§8Close");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === 0) {
    const m = new ModalFormData().title("Save").textField("Name", "home", { defaultValue: "home" });
    const r = await m.show(player);
    if (!r.canceled && r.formValues) {
      const n = saveHome(player, r.formValues[0]);
      if (n) say(player, `§aSaved ${n}`);
    }
  } else if (res.selection === 1) {
    if (!names.length) return say(player, `§cNo homes`);
    const f = new ActionFormData().title("TP");
    for (const n of names) f.button(n);
    f.button("Back");
    const r = await f.show(player);
    if (!r.canceled && r.selection < names.length) {
      const h = getHome(player, names[r.selection]);
      if (h) teleportTo(player, h, names[r.selection]);
    }
  } else if (res.selection === 2) {
    if (!names.length) return say(player, `§cNo homes`);
    const f = new ActionFormData().title("Delete");
    for (const n of names) f.button(`§c${n}`);
    f.button("Back");
    const r = await f.show(player);
    if (!r.canceled && r.selection < names.length) {
      const name = names[r.selection];
      const c = new ActionFormData().title("Confirm").body(`Delete ${name}?`).button("§cYes").button("Cancel");
      const cr = await c.show(player);
      if (!cr.canceled && cr.selection === 0 && deleteHome(player, name)) say(player, `§cDeleted ${name}`);
    }
  } else if (res.selection === 3) listHomesChat(player);
}

// ─── admin UI ────────────────────────────────────────────
async function uiAdmin(admin) {
  if (!isAdminName(admin)) {
    say(admin, `§c[${BRAND}] Not on admin whitelist.`);
    adminLog(admin, "DENIED admin panel (whitelist)");
    return;
  }

  const form = new ActionFormData()
    .title(`§4${BRAND} Admin`)
    .body(`§8v${VERSION} · ${ADMIN_TRIGGER}`)
    .button("§aCreative")
    .button("§eSurvival")
    .button("§dSpectator mode")
    .button("§3TP to Player")
    .button("§5Spectate Player")
    .button("§6Inspect Homes")
    .button("§bInvsee")
    .button("§cFreeze")
    .button("§aUnfreeze")
    .button("§6Warn")
    .button("§4Kick")
    .button("§2Set Warp Here")
    .button("§7List Online")
    .button("§8Close");

  const res = await form.show(admin);
  if (res.canceled) return;

  switch (res.selection) {
    case 0:
      setMode(admin, GameMode.creative, "creative");
      adminLog(admin, "gamemode creative");
      break;
    case 1:
      setMode(admin, GameMode.survival, "survival");
      adminLog(admin, "gamemode survival");
      break;
    case 2:
      setMode(admin, GameMode.spectator, "spectator");
      adminLog(admin, "gamemode spectator");
      break;
    case 3: {
      const t = await pickOnlinePlayer(admin, "§3TP to Player");
      if (!t) return uiAdmin(admin);
      setBack(admin);
      try {
        admin.teleport(t.location, { dimension: t.dimension });
        say(admin, `§a→ ${t.name}`);
        adminLog(admin, `tp to ${t.name}`);
      } catch (e) {
        say(admin, `§c${e}`);
      }
      break;
    }
    case 4: {
      const t = await pickOnlinePlayer(admin, "§5Spectate");
      if (!t) return uiAdmin(admin);
      spectatePlayer(admin, t);
      break;
    }
    case 5:
      await uiAdminHomes(admin);
      break;
    case 6: {
      const t = await pickOnlinePlayer(admin, "§bInvsee");
      if (!t) return uiAdmin(admin);
      invsee(admin, t);
      break;
    }
    case 7: {
      const t = await pickOnlinePlayer(admin, "§cFreeze");
      if (!t) return uiAdmin(admin);
      freezePlayer(admin, t, FREEZE_DEFAULT_SEC);
      break;
    }
    case 8: {
      const t = await pickOnlinePlayer(admin, "§aUnfreeze");
      if (!t) return uiAdmin(admin);
      unfreezePlayer(admin, t);
      break;
    }
    case 9: {
      const t = await pickOnlinePlayer(admin, "§6Warn");
      if (!t) return uiAdmin(admin);
      const reason = await promptReason(admin, "Warn reason");
      if (reason === null) return;
      warnPlayer(admin, t, reason);
      break;
    }
    case 10: {
      const t = await pickOnlinePlayer(admin, "§4Kick");
      if (!t) return uiAdmin(admin);
      const reason = await promptReason(admin, "Kick reason");
      if (reason === null) return;
      kickPlayer(admin, t, reason);
      break;
    }
    case 11: {
      const m = new ModalFormData().title("Warp").textField("Name", "shop", { defaultValue: "shop" });
      const r = await m.show(admin);
      if (!r.canceled && r.formValues) setWarp(admin, r.formValues[0]);
      break;
    }
    case 12:
      listOnline(admin);
      break;
    default:
      break;
  }
}

function setMode(player, mode, cmdName) {
  try {
    player.setGameMode(mode);
    say(player, `§aMode → ${cmdName}`);
    return;
  } catch (_) {}
  try {
    player.runCommand(`gamemode ${cmdName} @s`);
    say(player, `§aMode → ${cmdName}`);
  } catch (e) {
    say(player, `§c${e}`);
  }
}

function listOnline(admin) {
  const players = [...world.getPlayers()];
  say(admin, `§6Online (${players.length})`);
  for (const p of players) {
    const l = p.location;
    const fr = frozen.has(p.id) ? " §c[FROZEN]" : "";
    say(admin, `§e${p.name}${fr} §7${dimShort(p.dimension.id)} ${l.x.toFixed(0)}, ${l.y.toFixed(0)}, ${l.z.toFixed(0)}`);
  }
}

async function uiAdminHomes(admin) {
  const store = loadStore();
  const owners = Object.keys(store.players)
    .map((id) => ({
      id,
      name: ownerLabel(id, store.meta),
      homes: store.players[id] || {},
      count: Object.keys(store.players[id] || {}).length,
    }))
    .filter((o) => o.count > 0);
  if (!owners.length) {
    say(admin, `§cNo homes.`);
    return;
  }
  const form = new ActionFormData().title("Inspect Homes");
  for (const o of owners) form.button(`${o.name}\n${o.count}`);
  form.button("Back");
  const res = await form.show(admin);
  if (res.canceled || res.selection === owners.length) return;
  const owner = owners[res.selection];
  const names = Object.keys(owner.homes);
  const f2 = new ActionFormData().title(owner.name);
  for (const n of names) {
    const h = owner.homes[n];
    f2.button(`${n}\n${dimShort(h.dim)} ${h.x.toFixed(0)}, ${h.y.toFixed(0)}, ${h.z.toFixed(0)}`);
  }
  f2.button("Back");
  const r2 = await f2.show(admin);
  if (r2.canceled || r2.selection === names.length) return;
  const h = owner.homes[names[r2.selection]];
  if (h) {
    teleportTo(admin, h, `${owner.name}/${names[r2.selection]}`);
    adminLog(admin, `inspect home ${owner.name}/${names[r2.selection]}`);
  }
}

// chat
world.beforeEvents.chatSend.subscribe((event) => {
  const trimmed = event.message.trim();
  const lower = trimmed.toLowerCase();
  const parts = trimmed.split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const player = event.sender;

  if (trimmed === ADMIN_TRIGGER) {
    event.cancel = true;
    system.run(() => uiAdmin(player));
    return;
  }

  const simple = {
    "!spawn": () => goSpawn(player),
    "/spawn": () => goSpawn(player),
    "!back": () => goBack(player),
    "/back": () => goBack(player),
    "!rtp": () => tryRtp(player),
    "/rtp": () => tryRtp(player),
    "!warps": () => listWarps(player),
    "/warps": () => listWarps(player),
    "!tpaccept": () => acceptTpa(player),
    "/tpaccept": () => acceptTpa(player),
    "!tpadeny": () => denyTpa(player),
    "/tpadeny": () => denyTpa(player),
    "!tpdeny": () => denyTpa(player),
  };
  if (simple[cmd] && parts.length === 1) {
    event.cancel = true;
    system.run(simple[cmd]);
    return;
  }
  if (cmd === "!tpa" || cmd === "/tpa") {
    event.cancel = true;
    system.run(() => requestTpa(player, parts.slice(1).join(" ")));
    return;
  }
  if (cmd === "!warp" || cmd === "/warp") {
    event.cancel = true;
    system.run(() => goWarp(player, parts[1]));
    return;
  }
  if (cmd === "!setwarp" || cmd === "/setwarp") {
    event.cancel = true;
    system.run(() => {
      if (VIP_NAMES.length && !isVip(player) && !isAdminName(player)) {
        say(player, `§cStaff only.`);
        return;
      }
      setWarp(player, parts[1] || "warp");
    });
    return;
  }
  if (cmd === "!delwarp" || cmd === "/delwarp") {
    event.cancel = true;
    system.run(() => {
      if (VIP_NAMES.length && !isVip(player) && !isAdminName(player)) {
        say(player, `§cStaff only.`);
        return;
      }
      delWarp(player, parts[1] || "");
    });
    return;
  }
  if (cmd === "!home" || cmd === "/home" || cmd === "!homes" || cmd === "/homes") {
    event.cancel = true;
    const sub = (parts[1] || "").toLowerCase();
    system.run(() => {
      if (sub === "list" || sub === "ls") return listHomesChat(player);
      if (sub === "set" || sub === "save") {
        const n = saveHome(player, parts[2] || "home");
        if (n) say(player, `§aSaved ${n}`);
        return;
      }
      if (sub === "del" || sub === "delete") {
        const name = safeName(parts[2] || "home");
        system.run(async () => {
          const c = new ActionFormData().title("Confirm").body(`Delete ${name}?`).button("§cYes").button("Cancel");
          const r = await c.show(player);
          if (!r.canceled && r.selection === 0 && deleteHome(player, name)) say(player, `§cDeleted ${name}`);
        });
        return;
      }
      if (sub && sub !== "gui") {
        const h = getHome(player, sub);
        if (h) teleportTo(player, h, sub);
        else say(player, `§cUnknown home`);
        return;
      }
      uiHomeRoot(player);
    });
  }
});

world.afterEvents.entityDie.subscribe((e) => {
  try {
    if (e.deadEntity?.typeId === "minecraft:player") setDeath(e.deadEntity);
  } catch (_) {}
});

system.run(() => console.warn(`[${BRAND}] v${VERSION}`));

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const player = event.player;
  system.run(() => {
    say(player, `§d[${BRAND}] §f!home §8| §f!tpa §8| §f!warp §8| §f!rtp`);
    giveStarterKit(player);
    tryReport(player);
  });
});
