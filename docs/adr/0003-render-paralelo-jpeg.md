# ADR 0003 · Captura en paralelo y JPEG para los fotogramas de vídeo

- **Fecha:** 2026-10-02
- **Estado:** aceptada

## Contexto

La primera versión del render capturaba los fotogramas en PNG con una sola página de Chromium: la prueba de humo
(3 s a 60 fps con 4 submuestras = 721 capturas) tardaba **64 s**, así que un vídeo de 30 s se iba a ~11 minutos.
Medimos en este equipo (8 hilos lógicos):

| Configuración      | Capturas por segundo |
| ------------------ | -------------------- |
| 1 página, PNG      | 14,9                 |
| 4 páginas, PNG     | 22,0                 |
| 8 páginas, PNG     | 22,6                 |
| 4 páginas, JPEG 95 | 34,1                 |

## Decisión

- `render.mjs` abre **4 páginas** por defecto (`--hilos`) y reparte las muestras; como `seek(t)` es puro, da igual
  qué página pinte cada una. `capturarEnOrden()` las entrega a ffmpeg en orden.
- Los fotogramas de **vídeo** se capturan en **JPEG 95**: el MP4 final es `yuv420p` de todos modos, así que la
  diferencia no se ve. Las **fotos** (`--fotos`, publicaciones) siguen en **PNG** sin pérdida.

## Consecuencias

- La prueba de humo pasa de 64 s a **25,6 s** (2,5×): un vídeo de 30 s con calidad final ronda los 4 minutos.
- Más páginas que 4 no ayudan en esta máquina: el cuello de botella pasa a ser la codificación de las capturas.
