# Guide · Your first video with youtubeman

> [Versión en español](GUIA.md) · Installation: [README](../README.en.md)

## 1. Folders

```
Videos/
├── _estudio/        the studio (this repo): you don't touch it to make videos
├── MyProduct/       a project: its material (kit/), its scenes and its videos (salida/)
└── AnotherProduct/
```

- Open your AI in **`Videos`** or in the project folder. **Never in your product's repo**: the repo is read-only (you
  give it the path and youtubeman reads it without touching it).
- Finished videos go to `Videos/<Project>/salida/`, versioned (`-v1`, `-v2`…). A previous version is never deleted.

## 2. Ask for it

In Claude Code type `/youtubeman` and what you want. The more concrete, the better:

```
/youtubeman I want a 20-second launch video for MyProduct.
Repo: C:\path\to\my-product
Folder: MyProduct
Formats: 16:9 and 9:16
For: X and the website
Style: like this video → https://x.com/user/status/123…
Music: yes
```

If something is missing, it asks for everything in a single message: what the piece is, the repo path, the folder,
duration, formats, where it will be published, references and music.

**How it will see your product.** It needs the real interface to capture it:

- **Public website:** give it the URL.
- **App started locally or installed app:** it asks before opening anything, and never installs anything in your
  repo without permission.
- **Data:** if your app holds real data (customers, sales…), leave it in a clean or demo state first. Whatever is in
  the screenshots ends up in the video.

## 3. Approve every step

youtubeman stops four times and waits for your "yes":

1. **Story and style:** the problem, the features shown, the proof, the closing line and the style sheet
   (`LOOK.md`).
2. **Script:** what happens at each moment, on the music's beat.
3. **Scenes:** it shows you contact sheets and a live preview.
4. **Final video:** watch it **and listen to it**. The AI can't hear: you validate the sound.

**How to ask for changes:** say what's wrong and what you want, not how to fix it. For example: "at 9 s the price
can't be read → it must be readable on a phone". Put all your notes in a single message: every round of changes costs
tokens.

## 4. Style references

A reference is a video whose **style** you like. youtubeman copies its grammar (pacing, typography, color,
transitions, how text comes in), **never** its content, logos or characters.

**How to give them:**

- A link to an X post (`https://x.com/<user>/status/<id>`), a direct URL to an `.mp4`, or a video file.
- Screenshots or images, if there is no video.
- Paste them in your request or when it asks about the style.

**What makes a good reference:**

- **1 to 3.** More references dilute the style.
- **The same kind of piece** you want: for a 20 s product demo, another product demo, not a music video.
- **Short, with a clear style:** 10–60 s, with a recognizable visual idea (huge type, camera diving into the UI, flat
  colors…).
- **Know what you like about each one:** "the pacing", "how the text appears", "the colors". Say it and it gets
  priority.

**What it does with them:** `tools/referencia.mjs` downloads the video and extracts frames and a contact sheet into
`<Project>/kit/referencias/<name>/`. From there a `estilo.md` is written (palette, fonts, shot length, transitions,
camera, texture and text entrances) and carried into your `LOOK.md`, which you approve.

Without references it still works: it proposes a style from your product's real brand.

## 5. Music and sound

- By default it looks for **real music and sound effects with a commercial license** (for example Mixkit), measures
  them (BPM, beats and drop) and puts the key moment of the video on the music's drop.
- If you have your own licensed track, put it in `<Project>/kit/audio/` and tell it.
- Every track's license is recorded in the project inventory.

## 6. Formats

| Format   | Size        | For                                              |
| -------- | ----------- | ------------------------------------------------ |
| **16:9** | 1920 × 1080 | YouTube, X, LinkedIn, your website               |
| **9:16** | 1080 × 1920 | Instagram Reels, Stories, TikTok, YouTube Shorts |
| **1:1**  | 1080 × 1080 | Instagram feed, X, LinkedIn, Facebook            |
| **4:5**  | 1080 × 1350 | Instagram posts (image, carousel or video)       |

**16:9 + 9:16** covers almost everything. Each format is reframed, not cropped.

**Images and carousels:**

```
/youtubeman I want a 5-image carousel in 4:5 for Instagram about <topic>. Folder: MyProduct
```

## 7. When you publish

- The **first frame is the thumbnail**: it must state the hook in words.
- It works **with the sound off**: everything important is written on screen.
- The post text is about **the proof** (what your product does best), not "introducing X 1.0".
- Put the link to your site in the first reply, not inside the video.

## 8. Usage and how to spend less

A ~30-second video, start to finish, uses roughly **1 to 1.5 million tokens** in Claude Code. To spend less:

- **Scenes:** for short videos, ask for a single animator for the whole video instead of one per scene.
- **Changes:** put all your notes in a single round.
- **Small tweaks** (a size, a color, a timing): ask the director to do them directly, without relaunching the
  animator.
- **Quality:** review with drafts and leave the final render for the end.

## 9. Without Claude Code

The studio doesn't depend on any specific AI. With another one (Codex, Gemini, Cursor…), give it as instructions:

- `claude/skills/youtubeman/SKILL.md`: the full process and checkpoints.
- `claude/skills/youtubeman/encargos.md` and `claude/agents/*.md`: what each specialist does (explorer, animator,
  critic).
- `REGLAS.md` and `docs/CONTRATO-ESCENA.md`: the rules for the videos and how a scene is written.

In those documents, `{{ESTUDIO}}` is the path of your `_estudio` folder and `{{VIDEOS}}` the path of your `Videos`
folder. The example project `ejemplos/demo` is the model to follow.

## 10. If something fails

First, always: `npm run doctor` inside `_estudio` (or ask your AI to run it). It says what's missing and how to fix
it. More fixes: [RUNBOOK.md](RUNBOOK.md) (in Spanish).
