# Ejemplo · Ruta (demo)

Proyecto completo y pequeño que demuestra el estudio de punta a punta y sirve de **modelo para el animador**.
"Ruta" es una app ficticia de planificar repartos; su interfaz es la maqueta `kit/app/index.html`.

## Qué demuestra

- **Interfaz real → captura → animación:** `kit/app/capturar.mjs` captura la maqueta (pulsando el botón de
  verdad para el estado optimizado) y guarda en `kit/capturas/capturas.json` dónde está cada cosa y los datos.
- **Texto en máscara** con una palabra de acento en otra fuente (`escenas/comun.js`).
- **Cámara** con zoom logarítmico hacia el cursor y un **clic** que abre la captura optimizada en círculo.
- **Contador** que baja con la barra de distancia, con los datos de la app (nunca escritos a mano).
- **Traspasos por forma compartida** (punto → tarjeta → barra → punto) con `encadenar(…, { solape })`.
- **Bucle exacto:** el último fotograma es el primero.
- **Cuatro formatos** reencuadrados (no recortados) desde la misma línea de tiempo; en vertical usa las capturas
  de móvil.

## Cómo se renderiza

Desde la carpeta del estudio:

```bash
# Volver a capturar la maqueta (solo si cambia kit/app/index.html)
node ejemplos/demo/kit/app/capturar.mjs

# Vista previa con barra de tiempo
node tools/vista-previa.mjs --proyecto ejemplos/demo --modulo pelicula.js --abrir

# Borrador rápido y revisión
node tools/render.mjs --proyecto ejemplos/demo --modulo pelicula.js --borrador
node tools/revisar.mjs ejemplos/demo/revision/pelicula/pelicula-16x9-borrador.mp4 --bpm 120

# Final en los cuatro formatos (a salida/, versionado)
node tools/render.mjs --proyecto ejemplos/demo --modulo pelicula.js --formato 16:9,9:16,1:1,4:5
```

`salida/` y `revision/` no se guardan en git; `muestras/` tiene algunos fotogramas del resultado.
