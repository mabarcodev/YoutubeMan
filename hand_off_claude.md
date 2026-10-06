# Traspaso · estudio youtubeman

> Documento vivo para quien retome el trabajo (persona o IA). Última actualización: 2026-10-06 (v0.3.0).

## Qué es esto

El taller de **youtubeman**: vídeos de motion design y publicaciones hechos **con código**. Cada escena es un
módulo con `dibujar(t)` puro; Playwright captura los fotogramas y ffmpeg codifica el MP4. Lo maneja la skill
`/youtubeman` (director) con tres subagentes (explorador, animador y crítico), que viven en `.claude/` y solo
funcionan con la IA abierta en la carpeta del estudio (nada se instala en `~/.claude`); `AGENTS.md` lleva lo mismo
para otras IAs. Los vídeos se crean en `videos/` (ignorada por git). Porqués: `docs/adr/` (la última, 0006). Reglas
de los vídeos: `REGLAS.md`. Referencia del motor: `docs/CONTRATO-ESCENA.md`. Uso: `docs/GUIA.md`.

## Estado

| Pieza                                                                     | Estado                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------- |
| Motor (`engine/`), render, revisión, prueba de humo                       | ✅ hecho y testeado                                 |
| Herramientas de `tools/` (incluida `preparar`, que es `npm run instalar`) | ✅ hechas y testeadas                               |
| Skill y subagentes (`.claude/`) y `AGENTS.md`, sin rutas de ningún equipo | ✅ se usan desde la carpeta, sin instalar           |
| Ejemplo `ejemplos/demo` («Ruta», app inventada) en 16:9, 9:16, 1:1 y 4:5  | ✅ base que siguen los agentes                      |
| Flujo completo de `/youtubeman` en un proyecto real                       | ✅ probado: demo de una app de escritorio (v1 → v4) |
| Documentación pública (README es/en, GUIA es/en, LICENSE MIT)             | ✅                                                  |

## Lo aprendido en el primer proyecto real

- **Coste:** un vídeo de ~30 s gasta ~1–1,5 M tokens; cada ronda del animador, ~0,5–0,7 M. En piezas cortas, un
  solo animador con todos los tramos en una escena; las notas del usuario en una sola ronda; los retoques pequeños,
  el director directamente en la escena.
- **Diseño genérico:** tarjetas blancas con sombra difusa, píldoras centradas y círculos de color que crecen se leen
  como «vídeo de IA». Funciona mejor tipografía enorme en movimiento, interfaz real grande en capas y transiciones
  que atraviesan objetos (lamas, zoom a través de un botón).
- **Datos de la app:** el estado de la app sale en el vídeo. Pedir al usuario un estado limpio o de demo antes de
  capturar, y desactivar en esa copia lo que tenga efectos fuera (impresión automática, copias de seguridad).
- **Avisos de la app:** textos reales como «registrada sin imprimir» pueden leerse en negativo. Comentarlo con el
  usuario antes de usarlos como prueba.

## Lo que falta o no se ha probado

- `npm run instalar` en macOS y Linux (probado en Windows, también en un clon limpio).
- La revisión con el subagente crítico en un proyecto real (en la demo real revisó el director para ahorrar tokens).
- El flujo completo con una IA que no sea Claude Code (Codex, Cursor…) a través de `AGENTS.md`.

## Cómo verificar que todo funciona

```bash
cd <carpeta del estudio>
npm run doctor
npm run lint && npm run format:check
npm test && npm run test:integracion
npm run smoke
```

## Cosas que conviene saber

- En Windows, ffmpeg con `winget install Gyan.FFmpeg`; puede no estar en el PATH de una consola abierta antes:
  `tools/lib/ffmpeg.mjs` lo busca también en la carpeta de winget.
- Si el equipo entra en reposo durante un render largo en segundo plano, el proceso se congela.
- Prettier no puede formatear `templates/proyecto/*.md` (convierte `__NOMBRE__` en negrita); están en
  `.prettierignore` y `tests/unit/plantillas.test.mjs` lo vigila.
- Deuda técnica: `referencia.mjs` depende del formato JSON de api.fxtwitter.com (si cambia, solo lo detecta una
  prueba manual); la mezcla cachea los sonidos sintetizados en `.render-tmp/` del proyecto (si se cambian sus
  fórmulas, borrar esa carpeta).
