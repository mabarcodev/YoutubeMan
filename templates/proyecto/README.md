# __NOMBRE__ · vídeos (youtubeman)

Carpeta de trabajo de los vídeos y publicaciones de **__NOMBRE__**. El código del producto **no vive aquí**:
se lee (solo lectura) desde su repo: `__REPO__`.

## Qué hay en cada sitio

| Ruta                         | Qué es                                                                     |
| ---------------------------- | -------------------------------------------------------------------------- |
| `proyecto.json`              | Nombre, repo, formatos, fps y tempo (BPM) del proyecto                     |
| `brief.md`                   | La historia: dolor, funciones, prueba, llamada a la acción                 |
| `LOOK.md`                    | Ficha de estilo que siguen todas las escenas                               |
| `guion.md`                   | Mapa de pulsos aprobado antes de animar                                    |
| `kit/capturas/`              | Capturas **reales** del producto                                           |
| `kit/audio/`                 | Música y efectos reales con su medición (`AUDIO.json`) y licencia          |
| `kit/fuentes/`, `kit/marca/` | Tipografías y logo reales                                                  |
| `kit/referencias/`           | Fotogramas y guía de estilo de los vídeos de referencia                    |
| `escenas/NN-nombre/`         | Cada escena (`escena.js`) por separado                                     |
| `pelicula.js`                | El montaje: todas las escenas en una sola línea de tiempo                  |
| `revision/`                  | Material del crítico: hojas de contactos, notas y puntuaciones             |
| `salida/`                    | Vídeos e imágenes finales, versionados (`-v1`, `-v2`…). Nunca se sobrescriben |

## Comandos (desde `<carpeta-de-vídeos>/_estudio`)

```bash
# Vista previa con barra de tiempo en el navegador
node tools/vista-previa.mjs --proyecto "<esta carpeta>" --modulo pelicula.js

# Borrador rápido / render final en varios formatos
node tools/render.mjs --proyecto "<esta carpeta>" --modulo pelicula.js --borrador
node tools/render.mjs --proyecto "<esta carpeta>" --modulo pelicula.js --formato 16:9,9:16

# Revisión automática de un vídeo
node tools/revisar.mjs "<esta carpeta>\salida\<video>.mp4"
```
