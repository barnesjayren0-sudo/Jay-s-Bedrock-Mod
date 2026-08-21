/**
 * Jay's Bedrock Mod — Script API entry
 * Requires Beta APIs / Script enabled in world settings when needed.
 */
import { world, system } from "@minecraft/server";

const MOD_NAME = "Jay's Bedrock Mod";
const VERSION = "1.0.0";

system.run(() => {
  console.warn(`[${MOD_NAME}] v${VERSION} loaded`);
});

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const player = event.player;
  system.run(() => {
    try {
      player.sendMessage(`§d[${MOD_NAME}] §fScript API is running. §7v${VERSION}`);
    } catch (e) {
      console.warn(`[${MOD_NAME}] join message failed: ${e}`);
    }
  });
});

// Example: run every 5 seconds (disabled by default — uncomment to test)
// system.runInterval(() => {
//   for (const player of world.getPlayers()) {
//     // player.addEffect(...) etc.
//   }
// }, 100);
