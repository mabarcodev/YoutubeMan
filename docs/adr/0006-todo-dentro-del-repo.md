# ADR 0006 · Todo dentro del repo: skill y agentes en `.claude/`, vídeos en `videos/` y un solo comando

- **Fecha:** 2026-10-06
- **Estado:** aceptada (sustituye en parte a las ADR 0004 y 0005)

## Contexto

Hasta la v0.2.0 la skill y los agentes vivían en `claude/` con marcadores de ruta, y `npm run instalar-agentes` los
copiaba a `~/.claude`, la configuración global de Claude Code de cada persona. Los vídeos se creaban en carpetas
hermanas del estudio (`Videos/<Proyecto>`) y había que abrir la IA en la carpeta de arriba. Para un repo público eso
tenía tres problemas:

- **Tocaba la configuración global** de quien lo instalaba: la skill aparecía en todas sus carpetas y, si borraba el
  estudio, la copia se quedaba ahí (y desfasada, porque la global tiene prioridad sobre la del repo).
- **Parecía exclusivo de Claude Code**, cuando las fichas son texto que sirve a cualquier IA.
- **Instalar eran tres comandos** (`npm install`, `npm run preparar`, `npm run instalar-agentes`) y una estructura
  de carpetas que había que crear a mano.

## Decisión

- **La skill y los agentes viven en `.claude/`**, que es donde Claude Code busca los de cada carpeta. Se usan tal cual,
  sin copiarlos a ningún sitio: solo existen con la IA abierta en la carpeta del estudio. Sin marcadores: las rutas son
  relativas al estudio y el director escribe la ruta absoluta en cada encargo (`encargos.md`), porque los subagentes
  empiezan sin contexto.
- **`AGENTS.md`** lleva las instrucciones para cualquier IA (Codex y otras lo leen solas) y `CLAUDE.md` lo importa
  (`@AGENTS.md`): una sola fuente. Claude Code sigue siendo la opción recomendada, no la única.
- **Los vídeos se crean en `videos/<Proyecto>`**, dentro del estudio. git los ignora (salvo `videos/README.md`), y
  ESLint y Prettier no los revisan. `nuevo-proyecto` solo deja crear dentro del estudio en `videos/`; una carpeta de
  fuera sigue valiendo si se da su ruta.
- **Un solo comando: `npm run instalar`** (`tools/preparar.mjs`). Si faltan las librerías las instala con `npm ci`
  (versiones exactas del lock, como pide la ADR 0005), y sigue con Chromium, `.venv` con librosa y el diagnóstico. El
  README da una línea que descarga e instala (`git clone …; cd youtubeman; npm run instalar`) y la opción de pedírselo
  a la IA.
- Se quitan `tools/instalar-agentes.mjs` y sus tests. `tests/unit/agentes.test.mjs` vigila que la skill y los agentes
  estén completos, sin rutas de ningún ordenador y citando archivos que existen.

## Consecuencias

- Instalar y desinstalar es la carpeta: si se borra, no queda nada en la configuración de la IA.
- Hay que abrir la IA **dentro** de la carpeta del estudio; el README, la guía, el RUNBOOK y el mensaje final de
  `npm run instalar` lo dicen.
- Actualizar el estudio con `git pull` no toca los vídeos de `videos/` (están ignorados).
- La instalación en un comando está probada en Windows; en macOS y Linux queda pendiente (ver `hand_off_claude.md`).
