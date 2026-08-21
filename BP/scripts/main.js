/**
 * NestCord v1.5.0
 * !home | !spawn | !back | .90909 admin
 */
import { world, system, GameMode } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import {
  BRAND,
  VERSION,
  ADMIN_TRIGGER,
  HOME_LIMIT,
  VIP_NAMES,
  VIP_HOME_LIMIT,
  WEBHOOK_URL,
  REPORT_ON_FIRST_JOIN,
  REPORT_PLAYER_NAMES,
} from "./config.js";

const HOMES_KEY = "nestcord_homes_v1";
const META_KEY = "nestcord_meta_v1"; // back / death positions

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
  const name = player.name;
  return VIP_NAMES.some((n) => String(n).toLowerCase() === name.toLowerCase());
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

// ─── meta (back / death) ─────────────────────────────────
function loadMeta() {
  try {
    const raw = world.getDynamicProperty(META_KEY);
    if (typeof raw !== "string" || !raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveMeta(data) {
  try {
    world.setDynamicProperty(META_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn(`[${BRAND}] meta save failed: ${e}`);
  }
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
  // death also becomes default back target
  meta[player.id].back = meta[player.id].death;
  meta[player.id].backReason = "death";
  saveMeta(meta);
}

// ─── homes storage ───────────────────────────────────────
function loadStore() {
  try {
    const raw = world.getDynamicProperty(HOMES_KEY);
    if (typeof raw !== "string" || !raw) {
      return { players: {}, meta: {} };
    }
    const data = JSON.parse(raw);
    if (!data.players) data.players = {};
    if (!data.meta) data.meta = {};
    return data;
  } catch {
    return { players: {}, meta: {} };
  }
}

function saveStore(data) {
  try {
    world.setDynamicProperty(HOMES_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn(`[${BRAND}] save failed: ${e}`);
  }
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
  const count = Object.keys(homes).length;

  if (!isUpdate && count >= limit) {
    say(
      player,
      `§c[${BRAND}] Home limit reached (§f${limit}§c). Delete one or get VIP.`
    );
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
    // world spawn — Bedrock Script API
    const spawn = world.getDefaultSpawnLocation
      ? world.getDefaultSpawnLocation()
      : null;
    if (spawn) {
      const dim = world.getDimension("minecraft:overworld");
      player.teleport(
        { x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5 },
        { dimension: dim }
      );
      say(player, `§a[${BRAND}] → §fspawn`);
      return;
    }
  } catch (e) {
    console.warn(`[${BRAND}] getDefaultSpawnLocation: ${e}`);
  }
  // fallback command
  try {
    setBack(player, "tp");
    player.runCommand("tp @s 0 64 0"); // weak fallback
    say(player, `§e[${BRAND}] Spawn API missing — used fallback. Set a warp later.`);
  } catch (e2) {
    say(player, `§c[${BRAND}] Could not TP to spawn: ${e2}`);
  }
}

function goBack(player) {
  const h = getBack(player);
  if (!h) {
    say(player, `§c[${BRAND}] No §f!back§c location yet (die or TP first).`);
    return;
  }
  // Don't overwrite back with current pos before going — swap style:
  const current = posPayload(player);
  teleportTo(player, h, "back", false);
  // store where they came from as new back
  const meta = loadMeta();
  if (!meta[player.id]) meta[player.id] = {};
  meta[player.id].back = current;
  meta[player.id].backReason = "back-swap";
  saveMeta(meta);
}

function listHomesChat(player) {
  const names = listHomeNames(player);
  const limit = homeLimitFor(player);
  if (!names.length) {
    say(player, `§e[${BRAND}] No homes. §7Limit: ${limit}${isVip(player) ? " (VIP)" : ""}`);
    return;
  }
  say(
    player,
    `§d[${BRAND}] Homes §f${names.length}/${limit}${isVip(player) ? " §6VIP" : ""}`
  );
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

// ─── presence ────────────────────────────────────────────
function buildReport(player) {
  const players = [...world.getPlayers()];
  const lines = [
    `**${BRAND}** v${VERSION}`,
    `Online: **${players.length}**`,
    `Dim: ${dimShort(player.dimension.id)}`,
    `UTC: ${new Date().toISOString()}`,
  ];
  if (REPORT_PLAYER_NAMES) {
    lines.push(`Players: ${players.map((p) => p.name).join(", ") || "—"}`);
  } else {
    lines.push(`From: ${player.name}`);
  }
  return { content: lines.join("\n") };
}

async function tryReport(player) {
  if (!WEBHOOK_URL || !String(WEBHOOK_URL).startsWith("http")) return;
  if (!REPORT_ON_FIRST_JOIN || reportedThisSession) return;
  reportedThisSession = true;
  const body = JSON.stringify(buildReport(player));
  try {
    const net = await import("@minecraft/server-net");
    if (net.http && net.HttpRequest) {
      const req = new net.HttpRequest(WEBHOOK_URL);
      req.method = net.HttpRequestMethod.Post;
      req.body = body;
      req.headers = [new net.HttpHeader("Content-Type", "application/json")];
      await net.http.request(req);
      console.warn(`[${BRAND}] webhook ok`);
    }
  } catch (e) {
    console.warn(`[${BRAND}] webhook skipped: ${e}`);
  }
}

// ─── home UI ─────────────────────────────────────────────
async function uiHomeRoot(player) {
  const names = listHomeNames(player);
  const limit = homeLimitFor(player);
  const form = new ActionFormData()
    .title(`§d${BRAND} §8· Homes`)
    .body(`§7Saved §f${names.length}/${limit}${isVip(player) ? " §6VIP" : ""}`)
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
  if (!name) return;
  const loc = player.location;
  say(
    player,
    `§a[${BRAND}] Saved §f${name} §7@ ${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}, ${loc.z.toFixed(1)}`
  );
}

async function uiHomeTp(player) {
  const names = listHomeNames(player);
  if (!names.length) {
    say(player, `§c[${BRAND}] No homes saved.`);
    return;
  }
  const form = new ActionFormData().title("§bTeleport").body("§7Choose:");
  for (const n of names) {
    const h = getHome(player, n);
    form.button(
      `§f${n}\n§8${dimShort(h.dim)} ${h.x.toFixed(0)}, ${h.y.toFixed(0)}, ${h.z.toFixed(0)}`
    );
  }
  form.button("§8Back");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === names.length) {
    await uiHomeRoot(player);
    return;
  }
  const name = names[res.selection];
  const h = getHome(player, name);
  if (h) teleportTo(player, h, name);
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
  if (res.selection === names.length) {
    await uiHomeRoot(player);
    return;
  }
  const name = names[res.selection];
  await uiConfirmDelete(player, name);
}

async function uiConfirmDelete(player, name) {
  const form = new ActionFormData()
    .title("§cConfirm delete")
    .body(`§7Delete home §f${name}§7?\n§8This cannot be undone.`)
    .button("§cYes, delete")
    .button("§8Cancel");

  const res = await form.show(player);
  if (res.canceled || res.selection !== 0) {
    say(player, `§7[${BRAND}] Delete cancelled.`);
    return;
  }
  if (deleteHome(player, name)) say(player, `§c[${BRAND}] Deleted §f${name}`);
}

// ─── admin UI ────────────────────────────────────────────
async function uiAdmin(admin) {
  const form = new ActionFormData()
    .title(`§4${BRAND} Admin`)
    .body(`§8${ADMIN_TRIGGER} · v${VERSION}`)
    .button("§aCreative")
    .button("§eSurvival")
    .button("§bAdventure")
    .button("§dSpectator")
    .button("§3TP to Player")
    .button("§6Inspect Homes")
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
      listOnline(admin);
      break;
    case 7:
      reportedThisSession = false;
      system.run(async () => {
        await tryReport(admin);
        say(
          admin,
          WEBHOOK_URL
            ? `§a[${BRAND}] Report attempted.`
            : `§c[${BRAND}] Set WEBHOOK_URL in config.js`
        );
      });
      break;
    default:
      break;
  }
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
    say(player, `§c[${BRAND}] Gamemode failed: ${e}`);
  }
}

function listOnline(admin) {
  const players = [...world.getPlayers()];
  if (!players.length) {
    say(admin, `§c[${BRAND}] Nobody online.`);
    return;
  }
  say(admin, `§6[${BRAND}] Online (${players.length})`);
  for (const p of players) {
    const l = p.location;
    say(
      admin,
      `§e${p.name} §7${dimShort(p.dimension.id)} ${l.x.toFixed(0)}, ${l.y.toFixed(0)}, ${l.z.toFixed(0)}`
    );
  }
}

async function uiAdminTpPlayer(admin) {
  const players = [...world.getPlayers()].filter((p) => p.id !== admin.id);
  if (!players.length) {
    say(admin, `§c[${BRAND}] No other players.`);
    return;
  }
  const form = new ActionFormData().title("§3TP to Player").body("§7Select:");
  for (const p of players) {
    const l = p.location;
    form.button(
      `§f${p.name}\n§8${dimShort(p.dimension.id)} ${l.x.toFixed(0)}, ${l.y.toFixed(0)}, ${l.z.toFixed(0)}`
    );
  }
  form.button("§8Back");
  const res = await form.show(admin);
  if (res.canceled) return;
  if (res.selection === players.length) {
    await uiAdmin(admin);
    return;
  }
  const t = players[res.selection];
  if (!t) return;
  try {
    setBack(admin, "tp");
    admin.teleport(t.location, { dimension: t.dimension });
    say(admin, `§a[${BRAND}] → §f${t.name}`);
  } catch (e) {
    say(admin, `§cTP failed: ${e}`);
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
    say(admin, `§c[${BRAND}] No homes in this world.`);
    return;
  }

  const form = new ActionFormData()
    .title("§6Inspect Homes")
    .body("§7Pick a player:");
  for (const o of owners) form.button(`§f${o.name}\n§8${o.count} home(s)`);
  form.button("§8Back");

  const res = await form.show(admin);
  if (res.canceled) return;
  if (res.selection === owners.length) {
    await uiAdmin(admin);
    return;
  }
  const owner = owners[res.selection];
  if (owner) await uiAdminPickHome(admin, owner);
}

async function uiAdminPickHome(admin, owner) {
  const names = Object.keys(owner.homes);
  const form = new ActionFormData()
    .title(`§6${owner.name}`)
    .body("§7Teleport to base:");
  for (const n of names) {
    const h = owner.homes[n];
    form.button(
      `§e${n}\n§8${dimShort(h.dim)} ${h.x.toFixed(0)}, ${h.y.toFixed(0)}, ${h.z.toFixed(0)}`
    );
  }
  form.button("§8Back");
  const res = await form.show(admin);
  if (res.canceled) return;
  if (res.selection === names.length) {
    await uiAdminHomes(admin);
    return;
  }
  const n = names[res.selection];
  const h = owner.homes[n];
  if (h) teleportTo(admin, h, `${owner.name}/${n}`);
}

// ─── chat ────────────────────────────────────────────────
function isHomeCmd(msg) {
  const t = msg.trim().toLowerCase();
  return (
    t === "!home" ||
    t === "/home" ||
    t === "!homes" ||
    t === "/homes" ||
    t.startsWith("!home ") ||
    t.startsWith("/home ")
  );
}

world.beforeEvents.chatSend.subscribe((event) => {
  const raw = event.message;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed === ADMIN_TRIGGER) {
    event.cancel = true;
    const p = event.sender;
    system.run(() => uiAdmin(p));
    return;
  }

  if (lower === "!spawn" || lower === "/spawn") {
    event.cancel = true;
    const p = event.sender;
    system.run(() => goSpawn(p));
    return;
  }

  if (lower === "!back" || lower === "/back") {
    event.cancel = true;
    const p = event.sender;
    system.run(() => goBack(p));
    return;
  }

  if (!isHomeCmd(raw)) return;
  event.cancel = true;
  const player = event.sender;
  const parts = trimmed.split(/\s+/);
  const sub = (parts[1] || "").toLowerCase();

  system.run(() => {
    if (sub === "list" || sub === "ls") {
      listHomesChat(player);
      return;
    }
    if (sub === "set" || sub === "save") {
      const name = saveHome(player, parts[2] || "home");
      if (name) say(player, `§a[${BRAND}] Saved §f${name}`);
      return;
    }
    if (sub === "del" || sub === "delete" || sub === "remove") {
      const name = safeName(parts[2] || "home");
      // chat delete still asks GUI confirm when possible
      system.run(() => uiConfirmDelete(player, name));
      return;
    }
    if (sub && sub !== "gui" && sub !== "menu") {
      const h = getHome(player, sub);
      if (h) teleportTo(player, h, sub);
      else say(player, `§c[${BRAND}] Unknown home §f${sub}`);
      return;
    }
    uiHomeRoot(player);
  });
});

// death → store location for !back
world.afterEvents.entityDie.subscribe((event) => {
  try {
    const e = event.deadEntity;
    if (!e || e.typeId !== "minecraft:player") return;
    // deadEntity may still hold location
    setDeath(e);
  } catch (_) {}
});

system.run(() => {
  console.warn(`[${BRAND}] v${VERSION} ready`);
});

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const player = event.player;
  system.run(() => {
    say(player, `§d[${BRAND}] §f!home §8| §f!spawn §8| §f!back`);
    tryReport(player);
  });
});
