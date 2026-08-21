/**
 * Jay's Bedrock Mod — /home with GUI
 * Chat: !home  or  /home  (slash may need cheats; !home always works via chat)
 */
import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const MOD_NAME = "Jay's Bedrock Mod";
const VERSION = "1.1.0";
const DYN_KEY = "jay_homes_v1";

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

function saveHome(player, name) {
  const { all, homes, id } = getPlayerHomes(player);
  const loc = player.location;
  const dim = player.dimension.id;
  homes[name] = {
    x: loc.x,
    y: loc.y,
    z: loc.z,
    dim,
  };
  all[id] = homes;
  saveAllHomes(all);
}

function deleteHome(player, name) {
  const { all, homes, id } = getPlayerHomes(player);
  delete homes[name];
  all[id] = homes;
  saveAllHomes(all);
}

function teleportHome(player, name) {
  const { homes } = getPlayerHomes(player);
  const h = homes[name];
  if (!h) {
    player.sendMessage("§cHome not found.");
    return false;
  }
  try {
    const dim = world.getDimension(h.dim);
    player.teleport(
      { x: h.x, y: h.y, z: h.z },
      { dimension: dim }
    );
    player.sendMessage(`§aTeleported to home §f${name}§a.`);
    return true;
  } catch (e) {
    player.sendMessage(`§cTeleport failed: ${e}`);
    return false;
  }
}

// ---------- GUI ----------
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
    form.button(`§f${n}\n§8${h.dim.replace("minecraft:", "")} · ${h.x.toFixed(0)}, ${h.y.toFixed(0)}, ${h.z.toFixed(0)}`);
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

  for (const n of names) {
    form.button(`§c${n}`);
  }
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

// ---------- chat / commands ----------
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
  if (!isHomeCommand(msg)) return;

  event.cancel = true;
  const player = event.sender;
  const parts = msg.trim().split(/\s+/);
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
      // !home <name> → teleport
      teleportHome(player, sub);
      return;
    }
    // default → GUI
    openHomeMenu(player);
  });
});

// Optional: custom command if Script Events / command registry available later

system.run(() => {
  console.warn(`[${MOD_NAME}] v${VERSION} — type !home for GUI`);
});

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  system.run(() => {
    try {
      event.player.sendMessage(
        `§d[${MOD_NAME}] §fType §e!home§f to open the home GUI.`
      );
    } catch (_) {}
  });
});
