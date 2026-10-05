# youtubeman

> [Versión en español](README.md)

**Launch videos, product demos and social posts, made with code.** Give it your project and youtubeman takes real
screenshots of your product, proposes the story and the style with you, animates every scene and delivers the MP4
(or the post images) ready to publish.

It is not AI-generated video: every frame is drawn with HTML and a function of time `dibujar(t)`, Playwright
captures it and ffmpeg encodes it. Text is always crisp, the interface is the **real** one, and changing something
means editing a line and rendering again.

> The studio (docs, tools and agent instructions) is written in Spanish. Any modern AI handles it fine, and it can
> talk to you in your language.



https://github.com/user-attachments/assets/244f70cf-bef8-45a0-82eb-c74b77cee147



## What it does

- **Real kit:** reads your product repo (read-only), extracts logo, colors and fonts, and takes real screenshots.
- **Story and style with you:** proposes a beat-by-beat script and a look, and stops at every checkpoint until you
  approve. It can copy the grammar of a reference video you like.
- **Animation and critique:** animates the scenes, reviews them harshly (mobile legibility, pacing, brand) and
  polishes them.
- **Sound on the beat:** measures the music (BPM, beats and drop) so every cut lands on its beat.
- **Formats:** 16:9 (X, YouTube, web), 9:16 (Reels, Shorts, TikTok), 1:1 and 4:5; images and carousels.

**100 % local:** no cloud, no API keys, no MCP servers. Internet is only needed to install and, optionally, to fetch a
reference video or look for licensed music.

## Requirements

Everything is required, so the studio behaves the same on every computer:

| Program              | What for                        |
| -------------------- | ------------------------------- |
| Node.js 22 or newer  | Engine and tools                |
| Python 3.11 or newer | Music rhythm analysis (librosa) |
| ffmpeg               | Video encoding and audio mixing |
| git                  | Getting the studio              |

If something is missing:

| System                | Command                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| Windows               | `winget install OpenJS.NodeJS.LTS Python.Python.3.12 Gyan.FFmpeg Git.Git` |
| macOS                 | `brew install node python ffmpeg git`                                     |
| Linux (Debian/Ubuntu) | `sudo apt install nodejs npm python3 python3-venv ffmpeg git`             |

If you use an AI agent, it can check and install them for you (with your permission).

## Installation

Create a folder for your videos (for example `Videos`) and clone the studio inside it as `_estudio`:

```bash
cd Videos
git clone https://github.com/mabarcodev/YoutubeMan.git _estudio
cd _estudio
npm install
npm run preparar   # screenshot browser + librosa with pinned versions + diagnostics
```

Each video lives in its own folder next to the studio (`Videos/MyProduct`, `Videos/AnotherProduct`…).

## Use it with your AI

**Recommended: [Claude Code](https://claude.com/claude-code).** The studio ships the `/youtubeman` skill (the
director) and its three agents (explorer, animator and critic) already in Claude Code's format. Add them once:

```bash
npm run instalar-agentes   # copies the skill and agents to ~/.claude with your computer's paths
```

Open Claude Code in your `Videos` folder and type **`/youtubeman`**.

**With another AI** (Codex, Gemini, Cursor…): the instructions are plain text documents. Give it
`claude/skills/youtubeman/SKILL.md` (the process), `REGLAS.md` (the rules for every video) and
`docs/CONTRATO-ESCENA.md` (how a scene is written). Each specialist's brief lives in `claude/agents/`.

👉 **Step-by-step first video, style references and tips: [docs/GUIDE.en.md](docs/GUIDE.en.md).**

## Approximate usage

A ~30-second video, start to finish, uses roughly **1 to 1.5 million tokens** in Claude Code (explorer, animator and
director). The guide explains how to spend less.

## Tools

Run them with `node tools/<tool>.mjs`; all of them have `--ayuda` (help):

| Tool               | What for                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| `nuevo-proyecto`   | Creates a project folder from the templates                             |
| `capturar`         | Real screenshots of a site or app (localhost too), transparent cut-outs |
| `referencia`       | Frames and contact sheet of a reference video (file, URL or X post)     |
| `medir-audio`      | Effect peaks, BPM, beats and music drop → `AUDIO.json`                  |
| `vista-previa`     | Opens a scene in the browser with a timeline                            |
| `render`           | MP4 in one or more formats, drafts, ranges or PNG stills                |
| `revisar`          | Contact sheets, mobile check, strips, single-frame jumps and loop check |
| `doctor`           | Installation diagnostics                                                |
| `preparar`         | Screenshot browser and Python environment with pinned versions          |
| `instalar-agentes` | Adds or checks the skill and agents in `~/.claude`                      |

## Contributing

Improvements are welcome: open an issue or a pull request. Before sending:

```bash
npm run lint && npm run format:check && npm test
```

Code conventions: [CLAUDE.md](CLAUDE.md) · changes: [CHANGELOG.md](CHANGELOG.md) · troubleshooting:
[docs/RUNBOOK.md](docs/RUNBOOK.md).

## License

[MIT](LICENSE). The music, sound effects and fonts used in each project have their own licenses: the explorer
records them in the project inventory.
