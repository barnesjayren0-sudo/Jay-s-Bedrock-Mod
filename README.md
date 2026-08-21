# Jay's Bedrock Mod

Minecraft **Bedrock** add-on: Behavior Pack + Resource Pack + Script API.

## /home GUI (v1.1)

Open the menu by chatting:

```
!home
```

(Also accepts `/home` in chat — the message is canceled so it won’t show to others.)

### GUI buttons
| Button | Action |
|--------|--------|
| **Save / Update Home** | Name your home (default `home`) at current position |
| **Teleport to Home** | Pick a saved home and TP |
| **Delete Home** | Remove a saved home |

### Quick chat (no GUI)
```
!home set <name>     save
!home <name>         teleport
!home del <name>     delete
!home                open GUI
```

Homes are stored in **world dynamic properties** (per player id).

## Install
1. Copy `BP` → `behavior_packs/JayBedrock_BP/`
2. Copy `RP` → `resource_packs/JayBedrock_RP/`
3. Enable both packs on the world
4. Turn on **Beta APIs** if Script API asks for it

## Repo
https://github.com/barnesjayren0-sudo/Jay-s-Bedrock-Mod
