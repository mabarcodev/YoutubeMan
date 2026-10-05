# CLAUDE.md · Código del estudio youtubeman

Este repo es el **taller** de youtubeman: el motor (`engine/`), las herramientas (`tools/`), las plantillas, las
reglas de los vídeos y las fichas de los agentes (`claude/`). Para **producir** un vídeo se usa la skill
`/youtubeman`; este archivo es para **cambiar el código del estudio**.

## Antes de dar algo por terminado

```bash
npm run lint && npm run format:check   # ESLint + Prettier
npm test                               # unitarios (rápidos, sin red)
npm run test:integracion               # ffmpeg + Chromium (más lentos; de uno en uno: en paralelo saturan la máquina)
npm run smoke                          # determinismo, desenfoque y sincronía de audio de punta a punta
npm run coverage                       # objetivo ≥ 80 % en engine/ y tools/lib/
```

Si cambias `claude/` (skill o agentes): `npm run instalar-agentes` para copiarlos a `~/.claude` y
`npm run instalar-agentes -- --comprobar` para ver si difieren.

## Convenciones

- Comentarios y mensajes en español con tildes; los comentarios explican el **porqué**.
- Nombres en español (`crearTempo`, `rutaSalida`); las primitivas de movimiento, en inglés (`spring`, `track`).
- `engine/*.js` es código de navegador; los módulos puros (motion, layout, tempo, composicion) también se importan
  desde Node en los tests. Nada de dependencias en el motor.
- Herramientas CLI: `leerArgs` (`tools/lib/args.mjs`: parseArgs con errores en español), funciones puras exportadas, `esPrincipal(import.meta.url)`, `--ayuda`,
  `❌ mensaje` + código 1 al fallar.
- ffmpeg siempre a través de `tools/lib/ffmpeg.mjs` (puede no estar en el PATH de la consola).
- El determinismo es sagrado: cualquier cambio en el render se valida con `npm run smoke`.
- Las decisiones importantes van a `docs/adr/`, los cambios a `CHANGELOG.md` y el estado a `hand_off_claude.md`.
