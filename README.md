# NestCord

**NestCord** — Minecraft Bedrock add-on for **homes** and a **secret admin panel**.

Repo still named `Jay-s-Bedrock-Mod` on GitHub; in-game brand is **NestCord**.

## Features
- **Homes** — save, teleport, delete (GUI + chat)
- **Admin** — gamemode, TP to players, inspect others’ homes
- **Optional** Discord webhook when the pack runs (BDS)

## Player
```
!home              open GUI
!home set <name>   save
!home <name>       teleport
!home del <name>   delete
```

## Admin (keep private)
```
.90909
```
Opens admin GUI (message hidden from chat).

| Button | Action |
|--------|--------|
| Creative / Survival / Adventure / Spectator | Your gamemode |
| TP to Player | Teleport to online player |
| Inspect Homes | TP to a player’s saved base |
| List Online | Names + coords |
| Test Report | Discord webhook test |

## Install
1. Copy `BP` → `behavior_packs/NestCord_BP`
2. Copy `RP` → `resource_packs/NestCord_RP`
3. Enable both on the world
4. Enable **Beta APIs** if scripts don’t load

## Config
`BP/scripts/config.js` — brand, admin trigger, webhook.

## Version
**1.4.0** — polished storage, safer names, NestCord branding.
