# ADR 0001 · Motor propio con `seek(t)` en lugar de un framework o de After Effects

- **Fecha:** 2026-10-02
- **Estado:** aceptada

## Contexto

Los vídeos de motion design que se hicieron virales con Opus 5.5 en septiembre de 2026 no son vídeo generado por IA:
son **programas**. El modelo escribe una página con una función que pinta el fotograma exacto de cualquier instante,
un navegador sin ventana la captura fotograma a fotograma y ffmpeg une las imágenes. Investigamos cinco caminos:

| Opción                                 | A favor                                                                                                 | En contra                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Motor propio `seek(t)`** (HTML + JS) | Sin dependencias raras; es lo que Opus elige por defecto; vale igual para vídeo e imagen; control total | Hay que escribir y mantener el render, el audio y la revisión           |
| Remotion (React)                       | Maduro, buen estudio de previsualización                                                                | Requiere bundler y React; licencia de empresa a partir de cierto tamaño |
| HyperFrames (HTML + GSAP, Apache 2.0)  | 21 skills, incluida una de vídeos de lanzamiento                                                        | Otra capa de convenciones; Opus no lo elige si no se le obliga          |
| After Effects por MCP                  | Calidad profesional y edición manual                                                                    | Necesita AE y un motion designer; no es reproducible desde un repo      |
| mtioon.com (MCP comercial)             | Lee el repo y deja una línea de tiempo editable                                                         | 20–200 €/mes, cerrado, no hace publicaciones estáticas a nuestra manera |

## Decisión

Motor propio en `engine/`: escenas como módulos ES con `montar()` y `dibujar(t, ctx)` puro; muelles en forma
cerrada; formatos con zonas seguras; tempo en pulsos; montaje de escenas que es a su vez una escena. El render
(`tools/render.mjs`) usa Playwright + ffmpeg, con desenfoque de movimiento por submuestras.

## Consecuencias

- Cualquier fotograma se puede pintar sin simular los anteriores: render paralelo, tramos sueltos para revisar y
  resultados idénticos en cada ejecución (lo comprueba `npm run smoke`).
- Un mismo módulo sirve para MP4 y para PNG (publicaciones y carruseles).
- Si algún día compensa un framework, el contrato de escena es lo bastante simple como para adaptarlo; HyperFrames
  queda como alternativa documentada.
