# Jay's Bedrock Mod

## Can I see every server using my mod?

**No.** Minecraft does not give authors a global list of servers.

A world/server only shows up if:
1. Your pack is installed there, and
2. You enable **optional reporting** (Discord webhook) in `BP/scripts/config.js`

That works best on **Bedrock Dedicated Server (BDS)** with network allowed. Many phones/local worlds **cannot** send HTTP.

### Setup reporting
1. Discord → Server → Integrations → **Webhooks** → New → copy URL  
2. Open `BP/scripts/config.js`  
3. Set:
```js
export const WEBHOOK_URL = "https://discord.com/api/webhooks/...";
```
4. Reload pack / restart server  
5. Admin → **Test Server Report** (`.90909`) or wait for first join

You’ll get a Discord message: pack version, player count, time.

Keep `REPORT_PLAYER_NAMES = false` unless players agreed.

## Commands
| Chat | Action |
|------|--------|
| `!home` | Home GUI |
| `.90909` | Admin GUI (secret) |

## Repo
https://github.com/barnesjayren0-sudo/Jay-s-Bedrock-Mod
