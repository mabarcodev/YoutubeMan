<p align="center">
  <img src="docs/img/portada.jpg" alt="youtubeman: tu asistente de creación de vídeo con IA" width="100%">
</p>

# youtubeman

> [English version](README.en.md)

**Vídeos de lanzamiento, demos de producto y publicaciones para redes, hechos con código.** Le das tu proyecto y
youtubeman saca capturas reales de tu producto, te propone la historia y el estilo, anima cada escena y te entrega el
vídeo (o las imágenes del post) listo para publicar.

No es vídeo generado por IA: cada fotograma se dibuja con código. Por eso el texto sale perfecto, la interfaz es la
**real** de tu producto y cambiar algo es tocar una línea y volver a grabar.

https://github.com/user-attachments/assets/70dcf060-9fcd-4aab-a8f5-a8236e3a32b9

## Qué puedes pedirle

Le hablas con normalidad, como a una persona. Por ejemplo:

- **Un vídeo de tu app o de tu proyecto.** Dale la ruta de su carpeta y lo examina **sin tocar nada**: saca el logo,
  los colores, los textos y capturas reales de tu producto.

  > `/youtubeman hazme un vídeo de 20 segundos de mi app. Está en D:\Proyectos\MiApp`

- **Un vídeo de tu web.** Dale la dirección y hace las capturas de la propia página.

  > `/youtubeman quiero una demo de https://miweb.com para Instagram`

- **Copiar un estilo que te guste.** Pásale enlaces de vídeos de X (o un vídeo que tengas descargado) como
  referencia: copia el ritmo, los colores y las transiciones, nunca el contenido.

  > `/youtubeman que tenga el estilo de este vídeo: https://x.com/usuario/status/123…`

- **Con música.** Busca música con licencia y hace que cada corte caiga en su golpe.
- **Para cada red social.** Dile dónde lo vas a publicar (YouTube, X, Reels, TikTok, LinkedIn…) y lo prepara en el
  tamaño justo.
- **Imágenes y carruseles.** También hace la imagen de un post o un carrusel para Instagram o LinkedIn.

**Cómo trabaja contigo:** antes de hacer nada te propone la historia y el estilo, y se para **4 veces** para que digas
«sí» o pidas cambios. Si algo no te gusta, dile qué falla y qué quieres («a los 9 segundos no se lee el precio: que se
lea en el móvil»). Cada versión se guarda aparte (`-v1`, `-v2`…) y nunca se borra la anterior. El vídeo terminado
aparece en `videos/<nombre>/salida/`.

## Qué incluye

youtubeman es un pequeño estudio de vídeo con un director y tres especialistas:

| Pieza                   | Qué es              | Qué hace                                                                                           |
| ----------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| `/youtubeman`           | Skill (el director) | Habla contigo, propone la historia y el estilo, reparte el trabajo y para en cada punto de control |
| `youtubeman-explorador` | Agente              | Examina tu repo o tu web sin tocarlos y prepara el material: marca, capturas reales, música        |
| `youtubeman-animador`   | Agente              | Construye y pule cada escena del vídeo                                                             |
| `youtubeman-critico`    | Agente              | Revisa lo que sale como un director exigente, lo puntúa y señala los 3 peores fallos               |
| Motor y herramientas    | Código              | Dibujan, graban y revisan los vídeos (`engine/` y `tools/`)                                        |

La skill y los agentes son instrucciones en texto y vienen ya puestos en la carpeta (`.claude/` y `AGENTS.md`). Solo
funcionan con tu IA abierta dentro de la carpeta de youtubeman: **no se instala nada en la configuración de tu IA**.

- **Claude Code (recomendado):** los carga solo. Escribe `/youtubeman`.
- **Otra IA (Codex, Cursor, Gemini…):** lee `AGENTS.md`. Si no lo hace sola, dile «lee AGENTS.md».

**100 % en local:** sin nube, sin claves de API y sin servidores MCP. Internet solo hace falta para instalar y, si
quieres, para bajar un vídeo de referencia o buscar música con licencia.

## Requisitos

Todo es obligatorio, para que el estudio funcione igual en cualquier ordenador:

| Programa               | Para qué                              |
| ---------------------- | ------------------------------------- |
| Node.js 22 o superior  | Motor y herramientas                  |
| Python 3.11 o superior | Medir el ritmo de la música (librosa) |
| ffmpeg                 | Codificar el vídeo y mezclar el audio |
| git                    | Descargar el estudio                  |

Si te falta alguno:

| Sistema               | Comando                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| Windows               | `winget install OpenJS.NodeJS.LTS Python.Python.3.12 Gyan.FFmpeg Git.Git` |
| macOS                 | `brew install node python ffmpeg git`                                     |
| Linux (Debian/Ubuntu) | `sudo apt install nodejs npm python3 python3-venv ffmpeg git`             |

Si usas una IA, puede comprobarlo e instalarlo por ti (con tu permiso).

## Instalación

Son dos pasos: **descargar** el estudio (lo hace git) e **instalar** lo que necesita (lo hace npm: librerías,
navegador de capturas y Python para medir la música). Esta línea hace los dos. Pégala en PowerShell (Windows) o en la
Terminal (Mac y Linux):

```bash
git clone https://github.com/mabarcodev/YoutubeMan.git youtubeman; cd youtubeman; npm run instalar
```

- `git clone …` descarga el estudio en una carpeta nueva llamada `youtubeman`.
- `npm run instalar` instala todo lo demás y termina con un diagnóstico que te dice si falta algo.

**¿Usas una IA?** Que lo haga ella. Ábrela en la carpeta donde quieras guardarlo (por ejemplo, Documentos) y pégale:

> Instala youtubeman desde https://github.com/mabarcodev/YoutubeMan siguiendo su README

Te pedirá permiso antes de cada paso. Cuando termine, cierra la IA y vuelve a abrirla **dentro** de la carpeta
`youtubeman`.

## Úsalo

1. Abre tu IA **dentro de la carpeta `youtubeman`**. La primera vez te preguntará si confías en la carpeta: di que sí.
2. Escribe `/youtubeman` y lo que quieres (mira los ejemplos de arriba). Cuanto más concreto, mejor.
3. Contesta a sus preguntas y aprueba cada paso.

👉 **Paso a paso de tu primer vídeo, referencias de estilo y consejos: [docs/GUIA.md](docs/GUIA.md).**

## Consumo aproximado

Un vídeo de unos 30 segundos, de principio a fin, gasta aproximadamente **entre 1 y 1,5 millones de tokens** en
Claude Code (explorador, animador y director). La guía explica cómo gastar menos.

## Herramientas

Las usa el director por ti. Todas se ejecutan con `node tools/<herramienta>.mjs` y tienen `--ayuda`:

| Herramienta      | Para qué                                                                             |
| ---------------- | ------------------------------------------------------------------------------------ |
| `nuevo-proyecto` | Crea la carpeta de un vídeo en `videos/` desde las plantillas                        |
| `capturar`       | Capturas reales de una web o app (también localhost), recortes transparentes         |
| `referencia`     | Fotogramas y hoja de contactos de un vídeo de referencia (archivo, URL o post de X)  |
| `medir-audio`    | Picos de los efectos, BPM, pulsos y subida de la música → `AUDIO.json`               |
| `vista-previa`   | Abre una escena en el navegador con barra de tiempo                                  |
| `render`         | MP4 en uno o varios formatos, borradores, tramos o fotos PNG                         |
| `revisar`        | Hojas de contactos, prueba de móvil, tiras, saltos de un fotograma y bucle           |
| `doctor`         | Diagnóstico de la instalación                                                        |
| `preparar`       | Lo que hace `npm run instalar`: librerías, navegador de capturas y entorno de Python |

## Estructura

```
.claude/     la skill /youtubeman y las fichas de los 3 agentes (se usan desde esta carpeta)
AGENTS.md    las mismas instrucciones para Codex y otras IAs
videos/      tus vídeos, uno por carpeta (git los ignora: nunca se suben)
engine/      motor del navegador: muelles, formatos, tempo, montaje, técnicas
tools/       herramientas de línea de comandos (tools/lib: sus librerías)
templates/   plantillas de proyecto, escena y montaje
ejemplos/    proyecto de ejemplo («Ruta», una app inventada): la base que siguen los agentes
REGLAS.md    reglas de todos los vídeos
docs/        GUIA (uso), CONTRATO-ESCENA (motor), RUNBOOK (si algo falla), adr/ (decisiones), img/ (portada)
tests/       pruebas unitarias y de integración
```

## Contribuir

Las mejoras son bienvenidas: abre un issue o un pull request. Antes de enviar:

```bash
npm run lint && npm run format:check && npm test
```

Normas del código: [AGENTS.md](AGENTS.md) · cambios: [CHANGELOG.md](CHANGELOG.md) · si algo falla:
[docs/RUNBOOK.md](docs/RUNBOOK.md).

## Licencia

[MIT](LICENSE). La música, los efectos y las fuentes que uses en cada proyecto tienen su propia licencia: el
explorador las anota en el inventario del proyecto.
