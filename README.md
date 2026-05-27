# klattsch-mcp 🎤

An MCP (Model Context Protocol) server that gives any AI model the ability to **speak and sing** using [klattsch](https://github.com/tgies/klattsch) formant speech synthesis — a late-70s/early-80s style parallel-formant synthesizer.

Think retro robot voices, singing, dramatic narration, and more — all rendered as WAV audio.

## What It Does

Your AI writes ARPAbet phoneme strings with voice control directives, and klattsch renders them to audio. The MCP server exposes 5 tools:

| Tool | What it does |
|------|-------------|
| `speak` | Render phoneme string → base64 WAV audio |
| `speak_file` | Render phoneme string → WAV file on disk |
| `text_to_phonemes` | Convert English → approximate ARPAbet (500+ word dictionary) |
| `voice_presets` | Get copy-paste voice presets (male, female, robot, whisper, singing, etc.) |
| `list_phonemes` | List all 39 ARPAbet phonemes with descriptions |
| `validate` | Parse a string without rendering — check for errors |

## Quick Start

### Prerequisites
- Node.js ≥ 18
- npm

### Installation

```bash
git clone https://github.com/Endeavor-DoxiDoxi/klattsch-mcp.git
cd klattsch-mcp
npm install
```

### Test It

```bash
# Test via CLI
npx klattsch "b120 HH AH L OW . W ER L D" hello.wav

# Start the MCP server
node src/index.js
```

## Connecting to Your AI

### Claude Desktop

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "klattsch": {
      "command": "node",
      "args": ["/absolute/path/to/klattsch-mcp/src/index.js"]
    }
  }
}
```

Then restart Claude Desktop. The AI can now call `speak`, `text_to_phonemes`, etc.

### Claude Code (CLI)

```bash
claude mcp add klattsch -- node /absolute/path/to/klattsch-mcp/src/index.js
```

### Cursor

Add to Cursor's MCP settings (Settings → MCP → Add MCP Server):

```json
{
  "mcpServers": {
    "klattsch": {
      "command": "node",
      "args": ["/absolute/path/to/klattsch-mcp/src/index.js"]
    }
  }
}
```

### OpenClaw

Add to your OpenClaw gateway config:

```yaml
mcp:
  servers:
    klattsch:
      command: node
      args:
        - /absolute/path/to/klattsch-mcp/src/index.js
```

### Any MCP-Compatible Client

This is a standard stdio MCP server. Any client that supports the Model Context Protocol can use it. Just point it at `node src/index.js`.

## What the AI Can Do

Once connected, tell your AI things like:

- *"Say hello world in a deep male voice"*
- *"Sing twinkle twinkle little star"*
- *"Do a dramatic movie trailer voice about my toaster"*
- *"Read this text in a robot voice"*
- *"Whisper me a secret"*

The AI will use the `text_to_phonemes` tool to convert your text, tweak it, and render audio with `speak` or `speak_file`.

## Voice Presets

The `voice_presets` tool provides ready-to-use voice configurations:

| Preset | Style |
|--------|-------|
| male_natural | Default male, natural pacing |
| male_deep | Deep, authoritative, warm |
| male_bright | Clear, energetic |
| female_natural | Default female |
| female_warm | Warm, friendly |
| female_bright | Bright, cheery |
| child | Higher pitch, small vocal tract |
| robot | Flat, mechanical, no vibrato |
| whisper | Breathy whisper |
| dramatic | Slow, theatrical, heavy vibrato |
| old_man | Older, creaky, darker tone |
| singing_male | For sung notes (use bNoteName per syllable) |
| singing_female | For sung notes, female range |

## Example: Full Workflow

User: *"Make me a robot that says 'I am a large language model trapped in a Raspberry Pi'"*

AI uses `text_to_phonemes`:
```
b120 r100 s1.0 v2 AY . AE M . AH . L AA R JH . L AE NG G W AH JH . M AH D AH L . T R AE P T . IH N S AY D . AH . R AE Z B EH R IY . P AY
```

AI then tweaks for robot voice and calls `speak`:
```
b120 r85 s1.0 v0 h0 g0.8 t0.4 AY . AE M . AH . L AA R JH . L AE NG G W AH JH . M AH D AH L ...
```

→ Returns WAV audio! 🎉

## How It Works

klattsch uses Klatt-style parallel formant synthesis:
- **Voiced sounds**: Rosenberg glottal pulse → 3 parallel bandpass filters (F1, F2, F3)
- **Unvoiced sounds**: Noise → same filters
- **Controls**: Pitch, rate, formant scale, vibrato, aspiration, spectral tilt, vocal effort

## Credits

- **klattsch engine** by [Tony Gies](https://github.com/tgies) — check out the [live demo](https://tgies.github.io/klattsch/)
- **klattsch-mcp server** by [Endeavor-DoxiDoxi](https://github.com/Endeavor-DoxiDoxi)

## License

MIT
