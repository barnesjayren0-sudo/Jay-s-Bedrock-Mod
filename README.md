# NestCord v1.7.0

## Admin (`.90909` or your `ADMIN_TRIGGER`)

| Tool | Action |
|------|--------|
| Freeze / Unfreeze | Lock player in place until unfreeze |
| Invsee | Item counts in chat |
| Warn | Clear warning message to player |
| Kick | Kick if API/command allows; else freeze fallback |
| Spectate Player | Spectator + TP to them |
| TP / Inspect homes | As before |

### config.js
```js
export const ADMIN_TRIGGER = ".90909";
export const ADMIN_NAMES = ["YourGamertag"]; // empty = anyone with code
export const ADMIN_LOG_WEBHOOK = "https://discord.com/api/webhooks/...";
```

Admin actions log to `ADMIN_LOG_WEBHOOK` (or `WEBHOOK_URL`).
