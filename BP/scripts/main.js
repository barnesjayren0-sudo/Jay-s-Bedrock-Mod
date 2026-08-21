/**
 * NestCord v1.6.0
 * Homes, spawn, back, TPA, warps, RTP, starter kit, admin
 */
import { world, system, GameMode, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import {
  BRAND,
  VERSION,
  ADMIN_TRIGGER,
  HOME_LIMIT,
  VIP_NAMES,
  VIP_HOME_LIMIT,
  TPA_TIMEOUT_MS,
  RTP_COOLDOWN_SEC,
  RTP_RANGE,
  RTP_MAX_TRIES,
  STARTER_KIT_ENABLED,
  STARTER_KIT,
  WEBHOOK_URL,
  REPORT_ON_FIRST_JOIN,
  REPORT_PLAYER_NAMES,
} from "./config.js";

const HOMES_KEY = "nestcord_homes_v1";
const META_KEY = "nestcord_meta_v1";
const WARPS_KEY = "nestcord_warps_v1";
const FLAGS_KEY = "nestcord_flags_v1"; // starter kit claimed, etc.

/** @type {Map<string, { fromId: string, fromName: string, expires: number }>} */
const tpaRequests = new Map(); // key = target player id

/** @type {Map<string, number>} */
const rtpCooldown = new Map();

let reportedThisSession = false;

// ─── utils ───────────────────────────────────────────────
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
  n = n.replace(/[^a-zA-Z0-9_\- ]/g, "").slice(0, 24);
  return n || fallback;
}

function isVip(player) {
  return VIP_NAMES.some((n) => String(n).toLowerCase() === player.name.toLowerCase());
}

function homeLimitFor(player) {
  return isVip(player) ? VIP_HOME_LIMIT : HOME_LIMIT;
}

function posPayload(player) {
  const loc = player.location;
  return {
    x: Number(loc.x),
    y: Number(loc.y),
    z: Number(loc.z),
    dim: player.dimension.id,
  };
}

function findPlayerByName(name) {
  const q = String(name || "").toLowerCase();
  if (!q) return null;
  for (const p of world.getPlayers()) {
    if (p.name.toLowerCase() === q) return p;
  }
  // partial match if unique
  const partial = [...world.getPlayers()].filter((p) =>
    p.name.toLowerCase().includes(q)
  );
  return partial.length === 1 ? partial[0] : null;
}

// ─── JSON props ──────────────────────────────────────────
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

// meta: back
function loadMeta() {
  return loadJson(META_KEY, {});
}
function saveMeta(data) {
  saveJson(META_KEY, data);
}
function setBack(player, reason = "tp") {
  const meta = loadMeta();
  if (!meta[player.id]) meta[player.id] = {};
  meta[player.id].back = posPayload(player);
  meta[player.id].backReason = reason;
  saveMeta(meta);
}
function getBack(player) {
  const meta = loadMeta();
  return meta[player.id] && meta[player.id].back;
}
function setDeath(player) {
  const meta = loadMeta();
  if (!meta[player.id]) meta[player.id] = {};
  meta[player.id].death = posPayload(player);
  meta[player.id].back = meta[player.id].death;
  meta[player.id].backReason = "death";
  saveMeta(meta);
}

// flags: starter
function loadFlags() {
  return loadJson(FLAGS_KEY, { starter: {} });
}
function saveFlags(f) {
  saveJson(FLAGS_KEY, f);
}
function hasStarter(player) {
  const f = loadFlags();
  return !!(f.starter && f.starter[player.id]);
}
function markStarter(player) {
  const f = loadFlags();
  if (!f.starter) f.starter = {};
  f.starter[player.id] = true;
  saveFlags(f);
}

// warps
function loadWarps() {
  return loadJson(WARPS_KEY, {});
}
function saveWarps(w) {
  saveJson(WARPS_KEY, w);
}

// homes
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
    say(player, `§c[${BRAND}] Home limit §f${limit}§c reached.`);
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
  if (recordBack) setBack(player, "tp");
  try {
    const dimension = world.getDimension(h.dim || "minecraft:overworld");
    player.teleport({ x: h.x, y: h.y, z: h.z }, { dimension });
    say(player, `§a[${BRAND}] → §f${label}`);
    return true;
  } catch (e) {
    say(player, `§cTeleport failed: ${e}`);
    return false;
  }
}

function goSpawn(player) {
  try {
    setBack(player, "tp");
    if (typeof world.getDefaultSpawnLocation === "function") {
      const spawn = world.getDefaultSpawnLocation();
      const dim = world.getDimension("minecraft:overworld");
      player.teleport(
        { x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5 },
        { dimension: dim }
      );
      say(player, `§a[${BRAND}] → §fspawn`);
      return;
    }
  } catch (e) {
    console.warn(`[${BRAND}] spawn: ${e}`);
  }
  say(player, `§c[${BRAND}] Spawn unavailable on this build.`);
}

function goBack(player) {
  const h = getBack(player);
  if (!h) {
    say(player, `§c[${BRAND}] No back location.`);
    return;
  }
  const current = posPayload(player);
  teleportTo(player, h, "back", false);
  const meta = loadMeta();
  if (!meta[player.id]) meta[player.id] = {};
  meta[player.id].back = current;
  saveMeta(meta);
}

function listHomesChat(player) {
  const names = listHomeNames(player);
  const limit = homeLimitFor(player);
  if (!names.length) {
    say(player, `§e[${BRAND}] No homes. Limit ${limit}`);
    return;
  }
  say(player, `§d[${BRAND}] Homes ${names.length}/${limit}`);
  for (const n of names) {
    const h = getHome(player, n);
    say(
      player,
      `§7- §f${n} §8${dimShort(h.dim)} ${h.x.toFixed(0)}, ${h.y.toFixed(0)}, ${h.z.toFixed(0)}`
    );
  }
}

function ownerLabel(id, meta) {
  for (const p of world.getPlayers()) {
    if (p.id === id) return p.name;
  }
  return (meta && meta[id]) || `player:${String(id).slice(0, 8)}`;
}

// ─── starter kit ─────────────────────────────────────────
function giveStarterKit(player) {
  if (!STARTER_KIT_ENABLED) return;
  if (hasStarter(player)) return;
  try {
    for (const entry of STARTER_KIT) {
      const stack = new ItemStack(entry.id, entry.amount || 1);
      player.dimension.spawnItem(stack, player.location);
    }
    // try add to inventory first via runCommand as backup feel
    markStarter(player);
    say(player, `§a[${BRAND}] Starter kit delivered (items near you if inv full).`);
  } catch (e) {
    // command fallback
    try {
      for (const entry of STARTER_KIT) {
        player.runCommand(
          `give @s ${entry.id.replace("minecraft:", "")} ${entry.amount || 1}`
        );
      }
      markStarter(player);
      say(player, `§a[${BRAND}] Starter kit received.`);
    } catch (e2) {
      console.warn(`[${BRAND}] starter kit: ${e2}`);
    }
  }
}

// ─── TPA ─────────────────────────────────────────────────
function requestTpa(from, targetName) {
  const target = findPlayerByName(targetName);
  if (!target) {
    say(from, `§c[${BRAND}] Player not found: §f${targetName}`);
    return;
  }
  if (target.id === from.id) {
    say(from, `§c[${BRAND}] Can't TPA yourself.`);
    return;
  }
  tpaRequests.set(target.id, {
    fromId: from.id,
    fromName: from.name,
    expires: Date.now() + TPA_TIMEOUT_MS,
  });
  say(from, `§a[${BRAND}] TPA sent to §f${target.name}§a. They type §e!tpaccept`);
  say(
    target,
    `§e[${BRAND}] §f${from.name}§e requests to teleport to you. §a!tpaccept §7or §c!tpadeny`
  );
}

function acceptTpa(target) {
  const req = tpaRequests.get(target.id);
  if (!req || Date.now() > req.expires) {
    tpaRequests.delete(target.id);
    say(target, `§c[${BRAND}] No pending TPA.`);
    return;
  }
  tpaRequests.delete(target.id);
  let from = null;
  for (const p of world.getPlayers()) {
    if (p.id === req.fromId) {
      from = p;
      break;
    }
  }
  if (!from) {
    say(target, `§c[${BRAND}] Requester is offline.`);
    return;
  }
  setBack(from, "tpa");
  try {
    from.teleport(target.location, { dimension: target.dimension });
    say(from, `§a[${BRAND}] TPA accepted → §f${target.name}`);
    say(target, `§a[${BRAND}] You accepted §f${from.name}`);
  } catch (e) {
    say(target, `§cTPA failed: ${e}`);
  }
}

function denyTpa(target) {
  const req = tpaRequests.get(target.id);
  if (!req) {
    say(target, `§c[${BRAND}] No pending TPA.`);
    return;
  }
  tpaRequests.delete(target.id);
  say(target, `§7[${BRAND}] TPA denied.`);
  for (const p of world.getPlayers()) {
    if (p.id === req.fromId) {
      say(p, `§c[${BRAND}] ${target.name} denied your TPA.`);
      break;
    }
  }
}

// ─── warps ───────────────────────────────────────────────
function setWarp(admin, name) {
  name = safeName(name, "warp").toLowerCase().replace(/ /g, "_");
  const warps = loadWarps();
  warps[name] = posPayload(admin);
  saveWarps(warps);
  say(admin, `§a[${BRAND}] Warp §f${name} §aset.`);
}

function delWarp(admin, name) {
  name = safeName(name, "").toLowerCase().replace(/ /g, "_");
  const warps = loadWarps();
  if (!warps[name]) {
    say(admin, `§c[${BRAND}] No warp §f${name}`);
    return;
  }
  delete warps[name];
  saveWarps(warps);
  say(admin, `§c[${BRAND}] Warp §f${name} §cdeleted.`);
}

function listWarps(player) {
  const warps = loadWarps();
  const names = Object.keys(warps);
  if (!names.length) {
    say(player, `§e[${BRAND}] No warps. Admin: §f!setwarp <name>`);
    return;
  }
  say(player, `§d[${BRAND}] Warps: §f${names.join(", ")}`);
}

function goWarp(player, name) {
  name = String(name || "").toLowerCase().replace(/ /g, "_");
  const warps = loadWarps();
  if (!name) {
    listWarps(player);
    return;
  }
  const h = warps[name];
  if (!h) {
    say(player, `§c[${BRAND}] Unknown warp §f${name}§c. §7!warps`);
    return;
  }
  teleportTo(player, h, `warp:${name}`);
}

// ─── RTP ─────────────────────────────────────────────────
function isSafeBlock(block) {
  if (!block) return false;
  const id = block.typeId;
  if (!id || id === "minecraft:air") return false;
  if (id.includes("lava") || id.includes("fire") || id.includes("cactus")) return false;
  if (id.includes("water")) return false;
  return true;
}

function tryRtp(player) {
  const now = Date.now();
  const last = rtpCooldown.get(player.id) || 0;
  const left = RTP_COOLDOWN_SEC * 1000 - (now - last);
  if (left > 0) {
    say(player, `§c[${BRAND}] RTP cooldown §f${Math.ceil(left / 1000)}s`);
    return;
  }

  const overworld = world.getDimension("minecraft:overworld");
  for (let i = 0; i < RTP_MAX_TRIES; i++) {
    const x = Math.floor((Math.random() * 2 - 1) * RTP_RANGE);
    const z = Math.floor((Math.random() * 2 - 1) * RTP_RANGE);
    try {
      // sample top-ish Y
      for (let y = 120; y >= 40; y--) {
        const block = overworld.getBlock({ x, y, z });
        const above = overworld.getBlock({ x, y: y + 1, z });
        const above2 = overworld.getBlock({ x, y: y + 2, z });
        if (
          isSafeBlock(block) &&
          above &&
          above.typeId === "minecraft:air" &&
          above2 &&
          above2.typeId === "minecraft:air"
        ) {
          setBack(player, "rtp");
          player.teleport(
            { x: x + 0.5, y: y + 1, z: z + 0.5 },
            { dimension: overworld }
          );
          rtpCooldown.set(player.id, now);
          say(player, `§a[${BRAND}] RTP → §f${x}, ${y + 1}, ${z}`);
          return;
        }
      }
    } catch (_) {
      // chunk may not be loaded — try another point
    }
  }
  say(player, `§c[${BRAND}] RTP failed to find safe ground. Try again.`);
}

// ─── presence ────────────────────────────────────────────
async function tryReport(player) {
  if (!WEBHOOK_URL || !String(WEBHOOK_URL).startsWith("http")) return;
  if (!REPORT_ON_FIRST_JOIN || reportedThisSession) return;
  reportedThisSession = true;
  try {
    const net = await import("@minecraft/server-net");
    if (net.http && net.HttpRequest) {
      const players = [...world.getPlayers()];
      const body = JSON.stringify({
        content: `**${BRAND}** v${VERSION} | online ${players.length} | ${player.name}`,
      });
      const req = new net.HttpRequest(WEBHOOK_URL);
      req.method = net.HttpRequestMethod.Post;
      req.body = body;
      req.headers = [new net.HttpHeader("Content-Type", "application/json")];
      await net.http.request(req);
    }
  } catch (e) {
    console.warn(`[${BRAND}] webhook: ${e}`);
  }
}

// ─── home UI ─────────────────────────────────────────────
async function uiHomeRoot(player) {
  const names = listHomeNames(player);
  const limit = homeLimitFor(player);
  const form = new ActionFormData()
    .title(`§d${BRAND} §8· Homes`)
    .body(`§7${names.length}/${limit}${isVip(player) ? " §6VIP" : ""}`)
    .button("§aSave / Update")
    .button("§bTeleport")
    .button("§cDelete")
    .button("§eList in chat")
    .button("§8Close");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === 0) await uiHomeSave(player);
  else if (res.selection === 1) await uiHomeTp(player);
  else if (res.selection === 2) await uiHomeDel(player);
  else if (res.selection === 3) listHomesChat(player);
}

async function uiHomeSave(player) {
  const names = listHomeNames(player);
  const modal = new ModalFormData()
    .title("§aSave Home")
    .textField("Name", names[0] || "home", { defaultValue: "home" });
  const res = await modal.show(player);
  if (res.canceled || !res.formValues) return;
  const name = saveHome(player, res.formValues[0]);
  if (name) say(player, `§a[${BRAND}] Saved §f${name}`);
}

async function uiHomeTp(player) {
  const names = listHomeNames(player);
  if (!names.length) {
    say(player, `§c[${BRAND}] No homes.`);
    return;
  }
  const form = new ActionFormData().title("§bTeleport").body("§7Choose:");
  for (const n of names) {
    const h = getHome(player, n);
    form.button(`§f${n}\n§8${dimShort(h.dim)} ${h.x.toFixed(0)}, ${h.y.toFixed(0)}, ${h.z.toFixed(0)}`);
  }
  form.button("§8Back");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === names.length) return uiHomeRoot(player);
  const name = names[res.selection];
  const h = getHome(player, name);
  if (h) teleportTo(player, h, name);
}

async function uiConfirmDelete(player, name) {
  const form = new ActionFormData()
    .title("§cConfirm delete")
    .body(`§7Delete §f${name}§7?`)
    .button("§cYes, delete")
    .button("§8Cancel");
  const res = await form.show(player);
  if (res.canceled || res.selection !== 0) {
    say(player, `§7[${BRAND}] Cancelled.`);
    return;
  }
  if (deleteHome(player, name)) say(player, `§c[${BRAND}] Deleted §f${name}`);
}

async function uiHomeDel(player) {
  const names = listHomeNames(player);
  if (!names.length) {
    say(player, `§c[${BRAND}] Nothing to delete.`);
    return;
  }
  const form = new ActionFormData().title("§cDelete").body("§7Choose:");
  for (const n of names) form.button(`§c${n}`);
  form.button("§8Back");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === names.length) return uiHomeRoot(player);
  await uiConfirmDelete(player, names[res.selection]);
}

// ─── admin ───────────────────────────────────────────────
async function uiAdmin(admin) {
  const form = new ActionFormData()
    .title(`§4${BRAND} Admin`)
    .body(`§8v${VERSION}`)
    .button("§aCreative")
    .button("§eSurvival")
    .button("§bAdventure")
    .button("§dSpectator")
    .button("§3TP to Player")
    .button("§6Inspect Homes")
    .button("§2Set Warp Here")
    .button("§7List Online")
    .button("§5Test Report")
    .button("§8Close");

  const res = await form.show(admin);
  if (res.canceled) return;
  switch (res.selection) {
    case 0:
      setMode(admin, GameMode.creative, "creative");
      break;
    case 1:
      setMode(admin, GameMode.survival, "survival");
      break;
    case 2:
      setMode(admin, GameMode.adventure, "adventure");
      break;
    case 3:
      setMode(admin, GameMode.spectator, "spectator");
      break;
    case 4:
      await uiAdminTpPlayer(admin);
      break;
    case 5:
      await uiAdminHomes(admin);
      break;
    case 6:
      await uiAdminSetWarp(admin);
      break;
    case 7:
      listOnline(admin);
      break;
    case 8:
      reportedThisSession = false;
      system.run(async () => {
        await tryReport(admin);
        say(admin, WEBHOOK_URL ? `§aReport attempted.` : `§cSet WEBHOOK_URL`);
      });
      break;
    default:
      break;
  }
}

async function uiAdminSetWarp(admin) {
  const modal = new ModalFormData()
    .title("§2Set Warp")
    .textField("Warp name", "shop", { defaultValue: "shop" });
  const res = await modal.show(admin);
  if (res.canceled || !res.formValues) return;
  setWarp(admin, res.formValues[0]);
}

function setMode(player, mode, cmdName) {
  try {
    player.setGameMode(mode);
    say(player, `§a[${BRAND}] Mode → §f${cmdName}`);
    return;
  } catch (_) {}
  try {
    player.runCommand(`gamemode ${cmdName} @s`);
    say(player, `§a[${BRAND}] Mode → §f${cmdName}`);
  } catch (e) {
    say(player, `§cGamemode failed: ${e}`);
  }
}

function listOnline(admin) {
  const players = [...world.getPlayers()];
  say(admin, `§6[${BRAND}] Online (${players.length})`);
  for (const p of players) {
    const l = p.location;
    say(admin, `§e${p.name} §7${dimShort(p.dimension.id)} ${l.x.toFixed(0)}, ${l.y.toFixed(0)}, ${l.z.toFixed(0)}`);
  }
}

async function uiAdminTpPlayer(admin) {
  const players = [...world.getPlayers()].filter((p) => p.id !== admin.id);
  if (!players.length) {
    say(admin, `§cNo other players.`);
    return;
  }
  const form = new ActionFormData().title("§3TP to Player").body("§7Select:");
  for (const p of players) {
    const l = p.location;
    form.button(`§f${p.name}\n§8${dimShort(p.dimension.id)} ${l.x.toFixed(0)}, ${l.y.toFixed(0)}, ${l.z.toFixed(0)}`);
  }
  form.button("§8Back");
  const res = await form.show(admin);
  if (res.canceled) return;
  if (res.selection === players.length) return uiAdmin(admin);
  const t = players[res.selection];
  if (!t) return;
  setBack(admin, "tp");
  try {
    admin.teleport(t.location, { dimension: t.dimension });
    say(admin, `§a→ §f${t.name}`);
  } catch (e) {
    say(admin, `§c${e}`);
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
  const form = new ActionFormData().title("§6Inspect Homes").body("§7Pick:");
  for (const o of owners) form.button(`§f${o.name}\n§8${o.count}`);
  form.button("§8Back");
  const res = await form.show(admin);
  if (res.canceled) return;
  if (res.selection === owners.length) return uiAdmin(admin);
  const owner = owners[res.selection];
  if (!owner) return;
  const names = Object.keys(owner.homes);
  const form2 = new ActionFormData().title(`§6${owner.name}`).body("§7TP:");
  for (const n of names) {
    const h = owner.homes[n];
    form2.button(`§e${n}\n§8${dimShort(h.dim)} ${h.x.toFixed(0)}, ${h.y.toFixed(0)}, ${h.z.toFixed(0)}`);
  }
  form2.button("§8Back");
  const res2 = await form2.show(admin);
  if (res2.canceled) return;
  if (res2.selection === names.length) return uiAdminHomes(admin);
  const h = owner.homes[names[res2.selection]];
  if (h) teleportTo(admin, h, `${owner.name}/${names[res2.selection]}`);
}

// ─── chat router ─────────────────────────────────────────
world.beforeEvents.chatSend.subscribe((event) => {
  const raw = event.message;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const parts = trimmed.split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const player = event.sender;

  if (trimmed === ADMIN_TRIGGER) {
    event.cancel = true;
    system.run(() => uiAdmin(player));
    return;
  }

  const handlers = {
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

  if (handlers[cmd] && parts.length === 1) {
    event.cancel = true;
    system.run(handlers[cmd]);
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

  // admin warp set/del via chat (same as knowing admin code — still need .90909 for full panel)
  // setwarp/delwarp open to anyone who can chat — restrict: only after we could check op.
  // Use simple approach: only players who can use admin panel should; we gate setwarp behind admin trigger session is hard.
  // Gate: require name in VIP_NAMES OR always allow setwarp only from admin GUI.
  // Chat setwarp allowed for VIP list as "staff"
  if (cmd === "!setwarp" || cmd === "/setwarp") {
    event.cancel = true;
    system.run(() => {
      if (!isVip(player) && VIP_NAMES.length > 0) {
        say(player, `§c[${BRAND}] Staff only (!setwarp). Use admin GUI or add VIP.`);
        return;
      }
      setWarp(player, parts[1] || "warp");
    });
    return;
  }
  if (cmd === "!delwarp" || cmd === "/delwarp") {
    event.cancel = true;
    system.run(() => {
      if (!isVip(player) && VIP_NAMES.length > 0) {
        say(player, `§c[${BRAND}] Staff only.`);
        return;
      }
      delWarp(player, parts[1] || "");
    });
    return;
  }

  // homes
  if (
    cmd === "!home" ||
    cmd === "/home" ||
    cmd === "!homes" ||
    cmd === "/homes"
  ) {
    event.cancel = true;
    const sub = (parts[1] || "").toLowerCase();
    system.run(() => {
      if (sub === "list" || sub === "ls") return listHomesChat(player);
      if (sub === "set" || sub === "save") {
        const name = saveHome(player, parts[2] || "home");
        if (name) say(player, `§a[${BRAND}] Saved §f${name}`);
        return;
      }
      if (sub === "del" || sub === "delete" || sub === "remove") {
        return uiConfirmDelete(player, safeName(parts[2] || "home"));
      }
      if (sub && sub !== "gui" && sub !== "menu") {
        const h = getHome(player, sub);
        if (h) teleportTo(player, h, sub);
        else say(player, `§c[${BRAND}] Unknown home §f${sub}`);
        return;
      }
      uiHomeRoot(player);
    });
  }
});

world.afterEvents.entityDie.subscribe((event) => {
  try {
    const e = event.deadEntity;
    if (e && e.typeId === "minecraft:player") setDeath(e);
  } catch (_) {}
});

system.run(() => console.warn(`[${BRAND}] v${VERSION} ready`));

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const player = event.player;
  system.run(() => {
    say(player, `§d[${BRAND}] §f!home §8| §f!spawn §8| §f!back §8| §f!tpa §8| §f!warp §8| §f!rtp`);
    giveStarterKit(player);
    tryReport(player);
  });
});
