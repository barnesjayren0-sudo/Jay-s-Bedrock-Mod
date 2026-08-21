# Jay's Bedrock Mod

Minecraft **Bedrock Edition** add-on base (Behavior Pack + Resource Pack + Script API).

## Structure

```
Jay-s-Bedrock-Mod/
├── BP/                          # Behavior Pack
│   ├── manifest.json
│   ├── pack_icon.png            # (optional — add your own 128x128)
│   ├── texts/
│   │   └── en_US.lang
│   └── scripts/
│       └── main.js              # Script API entry
├── RP/                          # Resource Pack
│   ├── manifest.json
│   ├── pack_icon.png            # (optional)
│   └── texts/
│       └── en_US.lang
└── README.md
```

## Install (phone / Windows / console with storage)

1. Zip **BP** folder → rename to `JayBedrock_BP.mcpack` (or import folder).
2. Zip **RP** folder → rename to `JayBedrock_RP.mcpack`.
3. Open the `.mcpack` files so Minecraft imports them.
4. Create / edit a world → **Behavior Packs** → activate **Jay's Bedrock BP**.
5. **Resource Packs** → activate **Jay's Bedrock RP**.
6. Enable **Beta APIs** / experiments if the game asks for Script API.

### Android path (manual)
```
/games/com.mojang/behavior_packs/JayBedrock_BP/
/games/com.mojang/resource_packs/JayBedrock_RP/
```

## Script API

Entry: `BP/scripts/main.js`  
Uses `@minecraft/server` — sends a chat message when a player joins (proof the pack loaded).

## Next features we can add
- Custom items / blocks
- More Script API systems (combat, HUD, events)
- Mobile-friendly UI forms (`@minecraft/server-ui`)

## License
MIT — do what you want on your own worlds.
