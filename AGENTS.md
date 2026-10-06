# youtubeman

Estudio para hacer vídeos de lanzamiento, demos de producto y publicaciones para redes **con código**. Este archivo
lo leen Codex y otras IAs; Claude Code lo lee a través de `CLAUDE.md`.

## Hacer un vídeo

Cuando el usuario pida un vídeo, una demo, una imagen o un carrusel para redes (o diga «youtubeman»):

1. Lee y sigue `.claude/skills/youtubeman/SKILL.md`. Eres el **director**: el proceso tiene 4 puntos de control en
   los que paras y esperas el sí del usuario.
2. Los especialistas están en `.claude/agents/`: `youtubeman-explorador.md`, `youtubeman-animador.md` y
   `youtubeman-critico.md`. Si tu herramienta tiene subagentes, lánzalos con esas fichas y las plantillas de
   `.claude/skills/youtubeman/encargos.md`; si no, haz tú cada tarea siguiendo su ficha.
3. Las reglas de todos los vídeos están en `REGLAS.md` y la referencia del motor en `docs/CONTRATO-ESCENA.md`.
   Ejemplo completo: `ejemplos/demo/`.
4. Cada vídeo se guarda en `videos/<Proyecto>/` (git lo ignora). El repo o la web del producto **solo se leen**:
   nunca los modifiques.

## Cambiar el código del estudio

El motor está en `engine/`, las herramientas en `tools/`, las plantillas en `templates/` y la skill y los agentes en
`.claude/`. Esto es desarrollo, no producción de vídeos.

### Antes de dar algo por terminado

```bash
npm run lint && npm run format:check   # ESLint + Prettier
npm test                               # unitarios (rápidos, sin red)
npm run test:integracion               # ffmpeg + Chromium (más lentos; de uno en uno: en paralelo saturan la máquina)
npm run smoke                          # determinismo, desenfoque y sincronía de audio de punta a punta
npm run coverage                       # objetivo ≥ 80 % en engine/ y tools/lib/
```

Si cambias `.claude/` (skill o agentes), `npm test` comprueba que no llevan rutas de ningún ordenador y que los
archivos que citan existen. Para probarlos, abre una sesión nueva de tu IA en esta carpeta.

### Convenciones

- Comentarios y mensajes en español con tildes; los comentarios explican el **porqué**.
- Nombres en español (`crearTempo`, `rutaSalida`); las primitivas de movimiento, en inglés (`spring`, `track`).
- `engine/*.js` es código de navegador; los módulos puros (motion, layout, tempo, composicion) también se importan
  desde Node en los tests. Nada de dependencias en el motor.
- Herramientas CLI: `leerArgs` (`tools/lib/args.mjs`: parseArgs con errores en español), funciones puras exportadas,
  `esPrincipal(import.meta.url)`, `--ayuda`, `❌ mensaje` + código 1 al fallar.
- ffmpeg siempre a través de `tools/lib/ffmpeg.mjs` (puede no estar en el PATH de la consola).
- El determinismo es sagrado: cualquier cambio en el render se valida con `npm run smoke`.
- Nada de rutas de un ordenador concreto en el repo: todo se calcula desde `tools/lib/rutas.mjs`.
- Las decisiones importantes van a `docs/adr/`, los cambios a `CHANGELOG.md` y el estado a `hand_off_claude.md`.
