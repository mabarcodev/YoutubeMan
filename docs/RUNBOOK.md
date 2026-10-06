# Runbook · qué hacer si algo falla

Primero, siempre: `npm run doctor` (en la carpeta del estudio). Dice qué falta y cómo arreglarlo.

## Instalación

| Síntoma                                                     | Qué hacer                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `No encuentro ffmpeg`                                       | `winget install --id Gyan.FFmpeg -e --source winget` (la fuente msstore da error de certificado). Si ya está instalado, abre una consola nueva o define `FFMPEG_PATH`. El estudio también lo busca en la carpeta de paquetes de winget. |
| Chromium no arranca / `Executable doesn't exist`            | `npx playwright install chromium` en la carpeta del estudio.                                                                                                                                                                            |
| `librosa` no disponible (sin BPM ni pulsos)                 | `npm run instalar` en la carpeta del estudio: crea `.venv` e instala librosa con las versiones de `requirements.txt`. Es obligatorio: sin él no se mide el ritmo de la música.                                                          |
| Errores raros tras actualizar Node o Playwright             | `npm ci` y `npx playwright install chromium`; luego `npm run smoke`.                                                                                                                                                                    |
| En la carpeta temporal de Windows no se puede ejecutar nada | Es una restricción de algunos equipos: clona el estudio en una carpeta normal (Documentos, otra unidad…), no en la temporal.                                                                                                            |

## Escenas

| Síntoma                                          | Qué hacer                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `La escena falló al cargar`                      | Abre la escena con `node tools/vista-previa.mjs --proyecto <dir> --modulo <escena.js> --abrir`: el error sale en pantalla. Lo típico: ruta del `import` (el motor es `/estudio/engine/…`), falta `export default`, o una imagen/fuente que da 404 (las rutas del kit empiezan por `/kit/…`). |
| Fuente que no se aplica                          | Declárala en `fuentes` con su `url` real y comprueba el nombre de `familia` en el CSS.                                                                                                                                                                                                       |
| Escena en blanco                                 | `dibujar` no coloca nada en ese instante o los elementos están fuera del lienzo: usa `ctx.W`, `ctx.H`, `ctx.zona`.                                                                                                                                                                           |
| Texto cortado o tildes que asoman                | Usa `palabrasEnMascara` y no reduzcas su `holgura` si el texto lleva tildes o descendentes.                                                                                                                                                                                                  |
| Se ve el texto pasar por encima de algo al subir | El borde de abajo de su máscara pisa ese elemento: sepáralos (ver `ejemplos/demo/escenas/03-cierre`).                                                                                                                                                                                        |
| `revisar.mjs` marca saltos de un fotograma       | Algo no es determinista (`Math.random`, `Date.now`, transiciones CSS, una imagen que carga tarde) o hay un error de cálculo en ese instante: renderiza `--fotos` alrededor del segundo marcado.                                                                                              |
| El bucle no cierra limpio                        | El estado en `t = duracion` debe ser igual que en `t = 0`; el último fotograma es `duracion − 1/fps`.                                                                                                                                                                                        |

## Render

| Síntoma                                    | Qué hacer                                                                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Va lento                                   | Itera con `--borrador`, revisa tramos con `--desde/--hasta` y deja el final para el final. Un vídeo de 12 s en calidad final tarda 1–2 min por formato en un portátil normal. |
| Un render largo en segundo plano «se para» | Si el equipo entra en reposo, el proceso se congela. Renderiza los formatos de uno en uno o con el equipo despierto.                                                          |
| Vídeo sin sonido                           | ¿La escena declara `sonidos` o `musica`? ¿Se usó `--sin-audio`? Las rutas de audio empiezan por `/kit/…`.                                                                     |
| Sonido adelantado o retrasado              | Mide el kit (`medir-audio.mjs --convertir`): los MP3 pueden esconder retardo y algunos efectos tienen el golpe tarde.                                                         |
| Error de argumentos                        | El mensaje dice qué falta y cómo escribirlo. Un valor que empieza por «-» va pegado a su opción: `--opcion=-valor`. `--ayuda` lista todas las opciones de cada herramienta.   |

## Agentes

| Síntoma                                   | Qué hacer                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/youtubeman` no aparece                  | Abre tu IA **dentro** de la carpeta del estudio (no en la de arriba ni en una subcarpeta) y empieza una sesión nueva. Si instalaste la v0.2.0, borra `~/.claude/skills/youtubeman` y `~/.claude/agents/youtubeman-*.md`: esa copia antigua tiene prioridad sobre la del repo. |
| Otra IA no sigue el proceso de youtubeman | Dile «lee AGENTS.md» al empezar. Si no tiene subagentes, hace ella misma las tareas del explorador, el animador y el crítico.                                                                                                                                                 |

## Volver atrás

El estudio es un repo git: `git log --oneline` para ver los cambios y `git revert <commit>` para deshacer uno.
Los vídeos finales nunca se sobrescriben (`-v1`, `-v2`…), así que siempre queda la versión anterior.
