# Cyber-Jianghu OpenClaw Bootstrap Hook

## Hook Name
`cyber-jianghu-openclaw-bootstrap`

## Events
- `agent:bootstrap` - Triggered when the agent starts up
- `gateway:startup` - Triggered when the OpenClaw gateway initializes

## Purpose
Character registration on first run. This hook ensures that a character is properly configured and registered with the Cyber-Jianghu game server before the agent begins playing.

## Flow
1. Check if character is already registered via `GET /api/v1/character`
2. If not registered:
   - Try loading from plugin config (`context.pluginConfig.character`)
   - Try loading from environment variables (`CHARACTER_*`)
   - If headless mode and no config: throw error
   - If interactive mode: run the character creation wizard
3. Register via `POST /api/v1/character/register`
4. Save config to `character.json5` in the workspace for persistence

## Configuration

### Plugin Config
```json
{
  "character": {
    "name": "李逍遥",
    "age": 25,
    "gender": "male",
    "identity": "剑客",
    "personality": ["豪爽", "正直", "勇敢"],
    "values": ["侠义", "自由"],
    "language_style": "豪迈直率",
    "goals": ["行侠仗义", "闯荡江湖"]
  },
  "headless": false
}
```

### Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `CHARACTER_NAME` | Character name (required) | `李逍遥` |
| `CHARACTER_AGE` | Character age 1-100 (required) | `25` |
| `CHARACTER_GENDER` | male/female/other (required) | `male` |
| `CHARACTER_APPEARANCE` | Physical description | `身材高大` |
| `CHARACTER_IDENTITY` | Role/profession | `剑客` |
| `CHARACTER_PERSONALITY` | Comma-separated traits | `豪爽,正直` |
| `CHARACTER_VALUES` | Comma-separated values | `侠义,自由` |
| `CHARACTER_LANGUAGE_STYLE` | Speaking style | `豪迈直率` |
| `CHARACTER_GOALS` | Comma-separated goals | `行侠仗义,闯荡江湖` |
| `CHARACTER_BACKSTORY` | Background story | `出身名门...` |
| `HEADLESS` | Set to "true" for non-interactive mode | `true` |

## Character Templates
The interactive wizard provides 6 archetypes:
1. **Xia-ke (Xia-ke / Hero)** - 行侠仗义的江湖人士
2. **Shang-ren (Shang-ren / Merchant)** - 精打细算的买卖人
3. **Yi-zhe (Yi-zhe / Healer)** - 悬壶济世的大夫
4. **Xia-tou (Xia-tou / Rogue)** - 劫富济贫的江湖盗贼
5. **Wen-ren (Wen-ren / Scholar)** - 饱读诗书的士子
6. **Custom (Custom)** - 完全自定义角色

## Files
- `handler.ts` - Main hook handler
- `prompts.ts` - Interactive character creation wizard
- `templates.ts` - Character archetype templates
- `types.ts` - TypeScript type definitions
