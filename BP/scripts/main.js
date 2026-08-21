/** NestCord v1.9.0 — polished */
import { world, system, GameMode, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import * as C from "./config.js";

const BRAND = C.BRAND;
const VERSION = C.VERSION;

const HOMES_KEY = "nestcord_homes_v1";
const META_KEY = "nestcord_meta_v1";
const WARPS_KEY = "nestcord_warps_v1";
const FLAGS_KEY = "nestcord_flags_v1";
const ECO_KEY = "nestcord_eco_v1";
const CLAIM_KEY = "nestcord_claims_v1";
const JOB_KEY = "nestcord_jobs_v1";

const tpaRequests = new Map();
const rtpCooldown = new Map();
const tpCooldown = new Map();
const combatUntil = new Map();
const frozen = new Map();
const jobWorkCd = new Map();
let reportedThisSession = false;

// ─── helpers ─────────────────────────────────────────────
function say(p, m) { try { p.sendMessage(m); } catch (_) {} }
function bar(p, m) { try { p.onScreenDisplay.setActionBar(m); } catch (_) { say(p, m); } }
function ding(p) {
  try { p.playSound("random.orb"); } catch (_) {
    try { p.runCommand("playsound random.orb @s"); } catch (__) {}
  }
}
function whoosh(p) {
  try { p.playSound("mob.endermen.portal"); } catch (_) {
    try { p.runCommand("playsound mob.endermen.portal @s"); } catch (__) {}
  }
}
function dimShort(id) { return String(id || "").replace("minecraft:", ""); }
function safeName(raw, fb = "home") {
  let n = String(raw ?? fb).trim() || fb;
  return n.replace(/[^a-zA-Z0-9_\- ]/g, "").slice(0, 24) || fb;
}
function isVip(p) {
  return (C.VIP_NAMES || []).some((n) => String(n).toLowerCase() === p.name.toLowerCase());
}
function isAdminName(p) {
  if (!C.ADMIN_NAMES?.length) return true;
  return C.ADMIN_NAMES.some((n) => String(n).toLowerCase() === p.name.toLowerCase());
}
function isStaff(p) {
  return isAdminName(p) || isVip(p);
}
function homeLimitFor(p) { return isVip(p) ? C.VIP_HOME_LIMIT : C.HOME_LIMIT; }
function posPayload(p) {
  const l = p.location;
  return { x: +l.x, y: +l.y, z: +l.z, dim: p.dimension.id };
}
function findPlayerByName(name) {
  const q = String(name || "").toLowerCase();
  if (!q) return null;
  for (const p of world.getPlayers()) if (p.name.toLowerCase() === q) return p;
  const part = [...world.getPlayers()].filter((p) => p.name.toLowerCase().includes(q));
  return part.length === 1 ? part[0] : null;
}
function loadJson(k, fb) {
  try {
    const raw = world.getDynamicProperty(k);
    if (typeof raw !== "string" || !raw) return fb;
    return JSON.parse(raw);
  } catch { return fb; }
}
function saveJson(k, d) {
  try { world.setDynamicProperty(k, JSON.stringify(d)); } catch (e) { console.warn(e); }
}
async function postWebhook(url, content) {
  if (!url?.startsWith?.("http")) return;
  try {
    const net = await import("@minecraft/server-net");
    if (!net.http || !net.HttpRequest) return;
    const req = new net.HttpRequest(url);
    req.method = net.HttpRequestMethod.Post;
    req.body = JSON.stringify({ content: String(content).slice(0, 1900) });
    req.headers = [new net.HttpHeader("Content-Type", "application/json")];
    await net.http.request(req);
  } catch (e) { console.warn(`[${BRAND}] wh ${e}`); }
}
function adminLog(admin, action) {
  system.run(() => postWebhook(C.ADMIN_LOG_WEBHOOK || C.WEBHOOK_URL, `**[ADMIN]** ${admin.name}: ${action}`));
}

function tagCombat(p) { combatUntil.set(p.id, Date.now() + C.COMBAT_TAG_SEC * 1000); }
function inCombat(p) { return Date.now() < (combatUntil.get(p.id) || 0); }
function tpReady(p) {
  if (inCombat(p)) {
    bar(p, `§cCombat ${Math.ceil(((combatUntil.get(p.id) || 0) - Date.now()) / 1000)}s`);
    return false;
  }
  const left = C.TP_COOLDOWN_SEC * 1000 - (Date.now() - (tpCooldown.get(p.id) || 0));
  if (left > 0) { bar(p, `§cTP ${Math.ceil(left / 1000)}s`); return false; }
  return true;
}
function markTp(p) { tpCooldown.set(p.id, Date.now()); }
function canSetHomeHere(p) {
  if ((C.HOME_SET_BLACKLIST || []).includes(p.dimension.id)) {
    bar(p, `§cNo homes in ${dimShort(p.dimension.id)}`);
    return false;
  }
  return true;
}
function safePos(dimId, x, y, z) {
  try {
    const dim = world.getDimension(dimId || "minecraft:overworld");
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let dy = 0; dy <= C.SAFE_LANDING_RANGE; dy++) {
      for (const s of dy === 0 ? [0] : [1, -1]) {
        const yy = Math.floor(y) + dy * (s || 1);
        const feet = dim.getBlock({ x: bx, y: yy, z: bz });
        const head = dim.getBlock({ x: bx, y: yy + 1, z: bz });
        const below = dim.getBlock({ x: bx, y: yy - 1, z: bz });
        const air = (b) => !b || b.typeId === "minecraft:air" || (b.typeId || "").includes("cave_air");
        if (air(feet) && air(head) && below && !air(below) && !(below.typeId || "").includes("lava"))
          return { x: bx + 0.5, y: yy, z: bz + 0.5, dim: dimId };
      }
    }
  } catch (_) {}
  return { x, y, z, dim: dimId };
}

// storage
function loadMeta() { return loadJson(META_KEY, {}); }
function saveMeta(d) { saveJson(META_KEY, d); }
function setBack(p) {
  const m = loadMeta();
  if (!m[p.id]) m[p.id] = {};
  m[p.id].back = posPayload(p);
  saveMeta(m);
}
function getBack(p) { return loadMeta()[p.id]?.back; }
function setDeath(p) {
  const m = loadMeta();
  if (!m[p.id]) m[p.id] = {};
  m[p.id].back = posPayload(p);
  saveMeta(m);
}
function loadFlags() { return loadJson(FLAGS_KEY, { starter: {}, compass: {} }); }
function hasStarter(p) { return !!loadFlags().starter?.[p.id]; }
function markStarter(p) {
  const f = loadFlags(); if (!f.starter) f.starter = {}; f.starter[p.id] = true; saveJson(FLAGS_KEY, f);
}
function hasCompassGiven(p) { return !!loadFlags().compass?.[p.id]; }
function markCompass(p) {
  const f = loadFlags(); if (!f.compass) f.compass = {}; f.compass[p.id] = true; saveJson(FLAGS_KEY, f);
}
function loadWarps() { return loadJson(WARPS_KEY, {}); }
function saveWarps(w) { saveJson(WARPS_KEY, w); }
function loadStore() {
  const d = loadJson(HOMES_KEY, { players: {}, meta: {} });
  if (!d.players) d.players = {}; if (!d.meta) d.meta = {}; return d;
}
function saveStore(d) { saveJson(HOMES_KEY, d); }
function getHomesMap(p) {
  const store = loadStore();
  if (!store.players[p.id]) store.players[p.id] = {};
  return { store, homes: store.players[p.id] };
}
function listHomeNames(p) { return Object.keys(getHomesMap(p).homes); }
function getHome(p, n) { return getHomesMap(p).homes[n]; }
function saveHome(p, name) {
  if (!canSetHomeHere(p)) return null;
  name = safeName(name);
  const { store, homes } = getHomesMap(p);
  const limit = homeLimitFor(p);
  if (!homes[name] && Object.keys(homes).length >= limit) { bar(p, `§cLimit ${limit}`); return null; }
  homes[name] = posPayload(p);
  store.players[p.id] = homes; store.meta[p.id] = p.name; saveStore(store);
  ding(p); bar(p, `§aSaved §f${name}`); return name;
}
function deleteHome(p, name) {
  const { store, homes } = getHomesMap(p);
  if (!homes[name]) return false;
  delete homes[name]; store.players[p.id] = homes; saveStore(store); return true;
}
function teleportTo(p, h, label, recordBack = true) {
  if (!h) return false;
  if (!tpReady(p)) return false;
  if (recordBack) setBack(p);
  const safe = safePos(h.dim || "minecraft:overworld", h.x, h.y, h.z);
  try {
    p.teleport({ x: safe.x, y: safe.y, z: safe.z }, { dimension: world.getDimension(safe.dim) });
    markTp(p); whoosh(p); bar(p, `§a→ §f${label}`); return true;
  } catch (e) { say(p, `§cTP failed`); return false; }
}
function goSpawn(p) {
  if (!tpReady(p)) return;
  try {
    if (typeof world.getDefaultSpawnLocation === "function") {
      const s = world.getDefaultSpawnLocation();
      teleportTo(p, { x: s.x + 0.5, y: s.y, z: s.z + 0.5, dim: "minecraft:overworld" }, "spawn");
      return;
    }
  } catch (_) {}
  bar(p, "§cSpawn N/A");
}
function goBack(p) {
  const h = getBack(p);
  if (!h) return bar(p, "§cNo back");
  const cur = posPayload(p);
  if (!teleportTo(p, h, "back", false)) return;
  const m = loadMeta(); if (!m[p.id]) m[p.id] = {}; m[p.id].back = cur; saveMeta(m);
}

// economy
function loadEco() { return loadJson(ECO_KEY, {}); }
function saveEco(e) { saveJson(ECO_KEY, e); }
function bal(p) {
  const e = loadEco();
  if (!e[p.id]) { e[p.id] = { money: C.ECO_START_BAL, daily: 0 }; saveEco(e); }
  return e[p.id];
}
function setMoney(p, money) {
  const e = loadEco(); const r = bal(p); r.money = Math.max(0, Math.floor(money)); e[p.id] = r; saveEco(e);
}
function cmdBal(p) {
  if (!C.ECO_ENABLED) return say(p, "§cEco off");
  bar(p, `§6$${bal(p).money}`); say(p, `§6Balance §e$${bal(p).money}`);
}
function cmdPay(from, name, amount) {
  if (!C.ECO_ENABLED) return;
  const to = findPlayerByName(name); const n = Math.floor(+amount);
  if (!to || !n || n <= 0) return say(from, "§cUsage: !pay <player> <amount>");
  if (bal(from).money < n) return say(from, "§cBroke");
  setMoney(from, bal(from).money - n); setMoney(to, bal(to).money + n);
  ding(from); ding(to);
  say(from, `§aPaid $${n} → ${to.name}`); say(to, `§a+$${n} from ${from.name}`);
}
function cmdDaily(p) {
  if (!C.ECO_ENABLED) return;
  const e = loadEco(); const r = bal(p); const now = Date.now();
  if (now - (r.daily || 0) < C.ECO_DAILY_COOLDOWN_MS)
    return say(p, `§cDaily later (${Math.ceil((C.ECO_DAILY_COOLDOWN_MS - (now - r.daily)) / 3600000)}h)`);
  r.daily = now; r.money += C.ECO_DAILY_AMOUNT; e[p.id] = r; saveEco(e);
  ding(p); say(p, `§aDaily +$${C.ECO_DAILY_AMOUNT} (§e$${r.money}§a)`);
}

// jobs
function loadJobs() { return loadJson(JOB_KEY, {}); }
function saveJobs(j) { saveJson(JOB_KEY, j); }
function getJob(p) { return loadJobs()[p.id] || null; }
function setJob(p, id) {
  const j = loadJobs(); j[p.id] = id; saveJobs(j);
}
async function uiJobs(p) {
  if (!C.JOBS_ENABLED) return say(p, "§cJobs off");
  const cur = getJob(p);
  const f = new ActionFormData()
    .title(`§6${BRAND} Jobs`)
    .body(cur ? `§7Current: §e${C.JOBS[cur]?.label || cur}` : "§7No job — pick one");
  const keys = Object.keys(C.JOBS);
  for (const k of keys) {
    const j = C.JOBS[k];
    f.button(`§e${j.label}\n§8$${j.pay} / work · ${j.desc}`);
  }
  f.button("§a!work — get paid");
  f.button("§cQuit job");
  f.button("§8Close");
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection < keys.length) {
    setJob(p, keys[r.selection]);
    ding(p);
    say(p, `§aJoined §e${C.JOBS[keys[r.selection]].label}`);
    return;
  }
  if (r.selection === keys.length) return doWork(p);
  if (r.selection === keys.length + 1) {
    setJob(p, null);
    const j = loadJobs(); delete j[p.id]; saveJobs(j);
    say(p, "§7Job quit");
  }
}
function doWork(p) {
  if (!C.JOBS_ENABLED) return;
  const id = getJob(p);
  if (!id || !C.JOBS[id]) return say(p, "§cGet a job first: §e!jobs");
  const left = C.JOB_PAY_COOLDOWN_MS - (Date.now() - (jobWorkCd.get(p.id) || 0));
  if (left > 0) return bar(p, `§cWork CD ${Math.ceil(left / 1000)}s`);
  jobWorkCd.set(p.id, Date.now());
  const pay = C.JOBS[id].pay;
  setMoney(p, bal(p).money + pay);
  ding(p);
  say(p, `§a${C.JOBS[id].label} work §e+$${pay}`);
}

// claims + protection
function loadClaims() { return loadJson(CLAIM_KEY, []); }
function saveClaims(c) { saveJson(CLAIM_KEY, c); }
function findClaimAt(x, z, dim) {
  for (const c of loadClaims()) {
    if (c.dim !== dim) continue;
    if (Math.hypot(x - c.x, z - c.z) <= (c.r || C.CLAIM_RADIUS)) return c;
  }
  return null;
}
function canBuildAt(player, x, z, dim) {
  if (!C.CLAIM_ENABLED || !C.CLAIM_PROTECT) return true;
  if (C.CLAIM_ADMIN_BYPASS && isStaff(player)) return true;
  const c = findClaimAt(x, z, dim);
  if (!c) return true;
  return c.owner === player.id;
}
function cmdClaim(p) {
  if (!C.CLAIM_ENABLED) return say(p, "§cClaims off");
  if (loadClaims().filter((c) => c.owner === p.id).length >= C.CLAIM_MAX_PER_PLAYER)
    return say(p, "§cMax claims");
  const loc = p.location;
  const hit = findClaimAt(loc.x, loc.z, p.dimension.id);
  if (hit) return say(p, `§cClaimed by §f${hit.name}`);
  const claims = loadClaims();
  claims.push({ owner: p.id, name: p.name, x: loc.x, z: loc.z, dim: p.dimension.id, r: C.CLAIM_RADIUS });
  saveClaims(claims); ding(p); say(p, `§aClaim r=${C.CLAIM_RADIUS} protected`);
}
function cmdUnclaim(p) {
  const before = loadClaims();
  const after = before.filter((c) => c.owner !== p.id);
  if (after.length === before.length) return say(p, "§cNo claim");
  saveClaims(after); say(p, "§cUnclaimed");
}

function onBlockChange(player, block) {
  if (!player || !block) return false;
  const { x, z } = block.location;
  if (!canBuildAt(player, x, z, block.dimension.id)) {
    bar(player, "§cClaim protected");
    return true; // cancel
  }
  return false;
}

try {
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (onBlockChange(ev.player, ev.block)) ev.cancel = true;
  });
} catch (_) {}
try {
  world.beforeEvents.playerPlaceBlock.subscribe((ev) => {
    if (onBlockChange(ev.player, ev.block)) ev.cancel = true;
  });
} catch (_) {}

// freeze
system.runInterval(() => {
  const now = Date.now();
  for (const [id, data] of frozen) {
    if (data.until > 0 && now > data.until) { frozen.delete(id); continue; }
    for (const p of world.getPlayers()) {
      if (p.id !== id) continue;
      try { p.teleport({ x: data.x, y: data.y, z: data.z }, { dimension: world.getDimension(data.dim) }); } catch (_) {}
    }
  }
}, 1);

function freezePlayer(a, t, sec) {
  frozen.set(t.id, { ...posPayload(t), until: sec > 0 ? Date.now() + sec * 1000 : 0 });
  say(t, "§cFrozen"); adminLog(a, `freeze ${t.name}`);
}
function unfreezePlayer(a, t) { frozen.delete(t.id); say(t, "§aUnfrozen"); adminLog(a, `unfreeze ${t.name}`); }
function invsee(a, t) {
  try {
    const inv = t.getComponent("minecraft:inventory");
    if (!inv?.container) return say(a, "§cNo inv");
    const counts = new Map();
    for (let i = 0; i < inv.container.size; i++) {
      const it = inv.container.getItem(i);
      if (!it) continue;
      const id = it.typeId.replace("minecraft:", "");
      counts.set(id, (counts.get(id) || 0) + it.amount);
    }
    say(a, `§6Inv ${t.name}`);
    for (const [id, n] of [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40))
      say(a, `§7${id} §ex${n}`);
    adminLog(a, `invsee ${t.name}`);
  } catch (e) { say(a, `§c${e}`); }
}

function giveStarterKit(p) {
  if (!C.STARTER_KIT_ENABLED || hasStarter(p)) return;
  try {
    for (const e of C.STARTER_KIT)
      p.dimension.spawnItem(new ItemStack(e.id, e.amount || 1), p.location);
    markStarter(p); say(p, "§aStarter kit");
  } catch (_) {
    try {
      for (const e of C.STARTER_KIT)
        p.runCommand(`give @s ${e.id.replace("minecraft:", "")} ${e.amount || 1}`);
      markStarter(p);
    } catch (__) {}
  }
}
function giveHomeCompass(p) {
  if (!C.COMPASS_ENABLED || hasCompassGiven(p)) return;
  try {
    p.dimension.spawnItem(new ItemStack(C.COMPASS_ITEM, 1), p.location);
    markCompass(p);
    say(p, `§dHome Compass §7(use item = !home)`);
  } catch (_) {
    try {
      p.runCommand(`give @s ${C.COMPASS_ITEM.replace("minecraft:", "")} 1`);
      markCompass(p);
    } catch (__) {}
  }
}

function requestTpa(from, name) {
  const t = findPlayerByName(name);
  if (!t) return say(from, "§cNot found");
  if (t.id === from.id) return say(from, "§cNope");
  tpaRequests.set(t.id, { fromId: from.id, expires: Date.now() + C.TPA_TIMEOUT_MS });
  say(from, `§aTPA → ${t.name}`); say(t, `§e${from.name} · §a!tpaccept §c!tpadeny`);
}
function acceptTpa(t) {
  const req = tpaRequests.get(t.id);
  if (!req || Date.now() > req.expires) { tpaRequests.delete(t.id); return say(t, "§cNo TPA"); }
  tpaRequests.delete(t.id);
  let from = null;
  for (const p of world.getPlayers()) if (p.id === req.fromId) from = p;
  if (!from) return say(t, "§cOffline");
  teleportTo(from, { ...posPayload(t), dim: t.dimension.id }, t.name);
}
function denyTpa(t) {
  const req = tpaRequests.get(t.id);
  if (!req) return say(t, "§cNo TPA");
  tpaRequests.delete(t.id); say(t, "§7Denied");
  for (const p of world.getPlayers()) if (p.id === req.fromId) say(p, `§cDenied by ${t.name}`);
}
function setWarp(a, name) {
  name = safeName(name, "warp").toLowerCase().replace(/ /g, "_");
  const w = loadWarps(); w[name] = posPayload(a); saveWarps(w);
  ding(a); say(a, `§aWarp ${name}`); adminLog(a, `setwarp ${name}`);
}
function delWarp(a, name) {
  name = safeName(name, "").toLowerCase().replace(/ /g, "_");
  const w = loadWarps(); if (!w[name]) return say(a, "§cNo warp");
  delete w[name]; saveWarps(w); say(a, "§cDeleted");
}
function listWarps(p) {
  const n = Object.keys(loadWarps());
  say(p, n.length ? `§dWarps: ${n.join(", ")}` : "§eNo warps");
}
function goWarp(p, name) {
  if (!name) return listWarps(p);
  const h = loadWarps()[String(name).toLowerCase()];
  if (!h) return say(p, "§cUnknown warp");
  teleportTo(p, h, `warp:${name}`);
}
function tryRtp(p) {
  if (!tpReady(p)) return;
  const now = Date.now();
  const left = C.RTP_COOLDOWN_SEC * 1000 - (now - (rtpCooldown.get(p.id) || 0));
  if (left > 0) return bar(p, `§cRTP ${Math.ceil(left / 1000)}s`);
  const ow = world.getDimension("minecraft:overworld");
  for (let i = 0; i < C.RTP_MAX_TRIES; i++) {
    const x = Math.floor((Math.random() * 2 - 1) * C.RTP_RANGE);
    const z = Math.floor((Math.random() * 2 - 1) * C.RTP_RANGE);
    try {
      for (let y = 120; y >= 40; y--) {
        const b = ow.getBlock({ x, y, z });
        const a1 = ow.getBlock({ x, y: y + 1, z });
        const a2 = ow.getBlock({ x, y: y + 2, z });
        if (b && b.typeId !== "minecraft:air" && !b.typeId.includes("lava") && a1?.typeId === "minecraft:air" && a2?.typeId === "minecraft:air") {
          rtpCooldown.set(p.id, now);
          teleportTo(p, { x: x + 0.5, y: y + 1, z: z + 0.5, dim: "minecraft:overworld" }, "rtp");
          return;
        }
      }
    } catch (_) {}
  }
  bar(p, "§cRTP failed");
}

async function pickPlayer(admin, title) {
  const players = [...world.getPlayers()].filter((p) => p.id !== admin.id);
  if (!players.length) { say(admin, "§cNo players"); return null; }
  const f = new ActionFormData().title(title);
  for (const p of players) f.button(p.name);
  f.button("Back");
  const r = await f.show(admin);
  if (r.canceled || r.selection >= players.length) return null;
  return players[r.selection];
}

async function uiHome(p) {
  const names = listHomeNames(p);
  const f = new ActionFormData().title(`§d${BRAND}`).body(`§7Homes ${names.length}/${homeLimitFor(p)}`)
    .button("§aSave").button("§bTeleport").button("§cDelete").button("§eList").button("§8Close");
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection === 0) {
    const m = new ModalFormData().title("Save").textField("Name", "home", { defaultValue: "home" });
    const rr = await m.show(p);
    if (!rr.canceled && rr.formValues) saveHome(p, rr.formValues[0]);
  } else if (r.selection === 1 && names.length) {
    const f2 = new ActionFormData().title("TP");
    for (const n of names) f2.button(n);
    const rr = await f2.show(p);
    if (!rr.canceled && rr.selection < names.length) teleportTo(p, getHome(p, names[rr.selection]), names[rr.selection]);
  } else if (r.selection === 2 && names.length) {
    const f2 = new ActionFormData().title("Delete");
    for (const n of names) f2.button(n);
    const rr = await f2.show(p);
    if (!rr.canceled && rr.selection < names.length) {
      const n = names[rr.selection];
      const c = new ActionFormData().title("Confirm").body(n).button("§cYes").button("No");
      const cr = await c.show(p);
      if (!cr.canceled && cr.selection === 0 && deleteHome(p, n)) bar(p, `§cDeleted ${n}`);
    }
  } else if (r.selection === 3) {
    for (const n of names) {
      const h = getHome(p, n);
      say(p, `§7- §f${n} §8${dimShort(h.dim)} ${h.x.toFixed(0)},${h.y.toFixed(0)},${h.z.toFixed(0)}`);
    }
  }
}

async function uiAdmin(admin) {
  if (!isAdminName(admin)) return say(admin, "§cNot whitelisted");
  const f = new ActionFormData().title(`§4${BRAND} Admin`).body(`v${VERSION}`)
    .button("§aCreative").button("§eSurvival").button("§dSpectator")
    .button("§3TP").button("§5Spectate").button("§6Homes")
    .button("§bInvsee").button("§cFreeze").button("§aUnfreeze")
    .button("§2Warp").button("§7Online").button("§8Close");
  const r = await f.show(admin);
  if (r.canceled) return;
  const mode = (m, n) => {
    try { admin.setGameMode(m); } catch { try { admin.runCommand(`gamemode ${n} @s`); } catch (_) {} }
    adminLog(admin, n);
  };
  if (r.selection === 0) return mode(GameMode.creative, "creative");
  if (r.selection === 1) return mode(GameMode.survival, "survival");
  if (r.selection === 2) return mode(GameMode.spectator, "spectator");
  if (r.selection === 3) {
    const t = await pickPlayer(admin, "TP");
    if (t) { teleportTo(admin, { ...posPayload(t), dim: t.dimension.id }, t.name); adminLog(admin, `tp ${t.name}`); }
  } else if (r.selection === 4) {
    const t = await pickPlayer(admin, "Spec");
    if (t) { try { admin.setGameMode(GameMode.spectator); } catch (_) {} teleportTo(admin, { ...posPayload(t), dim: t.dimension.id }, t.name); adminLog(admin, `spec ${t.name}`); }
  } else if (r.selection === 5) {
    const store = loadStore();
    const owners = Object.keys(store.players).map((id) => ({ name: store.meta[id] || id.slice(0, 6), homes: store.players[id] }))
      .filter((o) => Object.keys(o.homes || {}).length);
    if (!owners.length) return say(admin, "§cNo homes");
    const f2 = new ActionFormData().title("Homes"); for (const o of owners) f2.button(o.name);
    const r2 = await f2.show(admin);
    if (r2.canceled || r2.selection >= owners.length) return;
    const o = owners[r2.selection]; const names = Object.keys(o.homes);
    const f3 = new ActionFormData().title(o.name); for (const n of names) f3.button(n);
    const r3 = await f3.show(admin);
    if (!r3.canceled && r3.selection < names.length) {
      teleportTo(admin, o.homes[names[r3.selection]], names[r3.selection]);
      adminLog(admin, `inspect ${o.name}`);
    }
  } else if (r.selection === 6) { const t = await pickPlayer(admin, "Inv"); if (t) invsee(admin, t); }
  else if (r.selection === 7) { const t = await pickPlayer(admin, "Freeze"); if (t) freezePlayer(admin, t, C.FREEZE_DEFAULT_SEC); }
  else if (r.selection === 8) { const t = await pickPlayer(admin, "Unfreeze"); if (t) unfreezePlayer(admin, t); }
  else if (r.selection === 9) {
    const m = new ModalFormData().title("Warp").textField("name", "shop", { defaultValue: "shop" });
    const rr = await m.show(admin); if (!rr.canceled && rr.formValues) setWarp(admin, rr.formValues[0]);
  } else if (r.selection === 10) {
    for (const p of world.getPlayers()) {
      const l = p.location;
      say(admin, `§e${p.name} §7${dimShort(p.dimension.id)} ${l.x.toFixed(0)},${l.y.toFixed(0)},${l.z.toFixed(0)}`);
    }
  }
}

// item use → home compass
try {
  world.afterEvents.itemUse.subscribe((ev) => {
    if (!C.COMPASS_ENABLED) return;
    const item = ev.itemStack;
    if (!item || item.typeId !== C.COMPASS_ITEM) return;
    const p = ev.source;
    system.run(() => uiHome(p));
  });
} catch (_) {}

world.beforeEvents.chatSend.subscribe((ev) => {
  const t = ev.message.trim();
  const parts = t.split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const p = ev.sender;
  if (t === C.ADMIN_TRIGGER) { ev.cancel = true; system.run(() => uiAdmin(p)); return; }

  const one = {
    "!spawn": () => goSpawn(p), "/spawn": () => goSpawn(p),
    "!back": () => goBack(p), "/back": () => goBack(p),
    "!rtp": () => tryRtp(p), "/rtp": () => tryRtp(p),
    "!warps": () => listWarps(p),
    "!tpaccept": () => acceptTpa(p), "!tpadeny": () => denyTpa(p), "!tpdeny": () => denyTpa(p),
    "!bal": () => cmdBal(p), "!balance": () => cmdBal(p), "$bal": () => cmdBal(p),
    "!daily": () => cmdDaily(p),
    "!claim": () => cmdClaim(p), "!unclaim": () => cmdUnclaim(p),
    "!jobs": () => uiJobs(p), "!job": () => uiJobs(p),
    "!work": () => doWork(p),
  };
  if (one[cmd] && parts.length === 1) { ev.cancel = true; system.run(one[cmd]); return; }
  if (cmd === "!tpa") { ev.cancel = true; system.run(() => requestTpa(p, parts.slice(1).join(" "))); return; }
  if (cmd === "!warp") { ev.cancel = true; system.run(() => goWarp(p, parts[1])); return; }
  if (cmd === "!pay" || cmd === "$pay") { ev.cancel = true; system.run(() => cmdPay(p, parts[1], parts[2])); return; }
  if (cmd === "!setwarp") { ev.cancel = true; system.run(() => setWarp(p, parts[1] || "warp")); return; }
  if (cmd === "!delwarp") { ev.cancel = true; system.run(() => delWarp(p, parts[1] || "")); return; }
  if (["!home", "/home", "!homes"].includes(cmd)) {
    ev.cancel = true;
    const sub = (parts[1] || "").toLowerCase();
    system.run(() => {
      if (sub === "list") {
        for (const n of listHomeNames(p)) {
          const h = getHome(p, n);
          say(p, `§7- §f${n} §8${dimShort(h.dim)} ${h.x.toFixed(0)},${h.y.toFixed(0)},${h.z.toFixed(0)}`);
        }
        return;
      }
      if (sub === "set" || sub === "save") { saveHome(p, parts[2] || "home"); return; }
      if (sub === "del" || sub === "delete") {
        const n = safeName(parts[2] || "home");
        if (deleteHome(p, n)) bar(p, `§cDeleted ${n}`);
        return;
      }
      if (sub) {
        const h = getHome(p, sub);
        if (h) teleportTo(p, h, sub); else bar(p, "§cUnknown");
        return;
      }
      uiHome(p);
    });
  }
});

world.afterEvents.entityHurt.subscribe((ev) => {
  try { if (ev.hurtEntity?.typeId === "minecraft:player") tagCombat(ev.hurtEntity); } catch (_) {}
});
world.afterEvents.entityDie.subscribe((ev) => {
  try { if (ev.deadEntity?.typeId === "minecraft:player") setDeath(ev.deadEntity); } catch (_) {}
});

system.run(() => console.warn(`[${BRAND}] v${VERSION}`));
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  system.run(() => {
    say(ev.player, `§d[${BRAND}] §fv${VERSION} §8· §f!home §8!jobs §8!claim §8!bal`);
    giveStarterKit(ev.player);
    giveHomeCompass(ev.player);
    if (C.WEBHOOK_URL && C.REPORT_ON_FIRST_JOIN && !reportedThisSession) {
      reportedThisSession = true;
      postWebhook(C.WEBHOOK_URL, `**${BRAND}** v${VERSION} · ${ev.player.name}`);
    }
  });
});
