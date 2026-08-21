# NestCord v1.5.0

Bedrock homes + admin tools.

## Player commands
| Command | Action |
|---------|--------|
| `!home` | Home GUI |
| `!home list` | List homes in chat |
| `!home set <name>` | Save (limit: 3, VIP: 10) |
| `!home <name>` | Teleport |
| `!home del <name>` | Delete with **confirm GUI** |
| `!spawn` | World spawn |
| `!back` | Last TP or death location |

## VIP homes
In `BP/scripts/config.js`:
```js
export const VIP_NAMES = ["YourGamertag"];
export const HOME_LIMIT = 3;
export const VIP_HOME_LIMIT = 10;
```

## Admin
```
.90909
```

## Install
Enable BP + RP + Beta APIs.

https://github.com/barnesjayren0-sudo/Jay-s-Bedrock-Mod
