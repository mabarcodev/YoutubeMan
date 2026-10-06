# youtubeman

> [English version](README.en.md)

**Vídeos de lanzamiento, demos de producto y publicaciones para redes, hechos con código.** Le das tu proyecto y
youtubeman saca capturas reales de tu producto, te propone la historia y el estilo, anima cada escena y entrega el
MP4 (o las imágenes del post) listo para publicar.

No es vídeo generado por IA: cada fotograma se dibuja con HTML y una función del tiempo `dibujar(t)`, Playwright lo
captura y ffmpeg lo codifica. Por eso el texto sale perfecto, la interfaz es la **real** y cambiar algo es tocar una
línea y volver a renderizar.

<!-- VÍDEO DE MUESTRA: se sustituye por el vídeo subido a GitHub -->

https://github.com/user-attachments/assets/70dcf060-9fcd-4aab-a8f5-a8236e3a32b9

## Qué hace

- **Kit real:** lee el repo de tu producto (sin tocarlo), saca logo, colores y tipografías, y hace capturas reales.
- **Historia y estilo contigo:** te propone el guion por pulsos y el estilo, y para en cada punto de control hasta
  que apruebas. Puede copiar la gramática de un vídeo de referencia que te guste.
- **Animación y crítica:** anima las escenas, las revisa con dureza (legibilidad en móvil, ritmo, marca) y las pule.
- **Sonido a ritmo:** mide la música (BPM, golpes y subida) para que cada corte caiga en su golpe.
- **Formatos:** 16:9 (X, YouTube, web), 9:16 (Reels, Shorts, TikTok), 1:1 y 4:5; imágenes y carruseles.

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

Si usas un agente de IA, puede comprobarlo e instalarlo por ti (con tu permiso).

## Instalación

Crea una carpeta para tus vídeos (por ejemplo `Videos`) y clona el estudio dentro con el nombre `_estudio`:

```bash
cd Videos
git clone https://github.com/mabarcodev/YoutubeMan.git _estudio
cd _estudio
npm install
npm run preparar   # navegador de capturas + librosa con las versiones fijadas + diagnóstico
```

Cada vídeo vivirá en su propia carpeta junto al estudio (`Videos/MiProducto`, `Videos/OtroProducto`…).

## Úsalo con tu IA

**Recomendado: [Claude Code](https://claude.com/claude-code).** El estudio trae la skill `/youtubeman` (el director)
y sus tres agentes (explorador, animador y crítico) ya escritos en su formato. Añádelos una vez:

```bash
npm run instalar-agentes   # copia la skill y los agentes a ~/.claude con las rutas de tu ordenador
```

Abre Claude Code en tu carpeta `Videos` y escribe **`/youtubeman`**.

**Con otra IA** (Codex, Gemini, Cursor…): las instrucciones son documentos de texto normales. Pásale como
instrucciones `claude/skills/youtubeman/SKILL.md` (el proceso), `REGLAS.md` (las reglas de todos los vídeos) y
`docs/CONTRATO-ESCENA.md` (cómo se escribe una escena). Los encargos de cada especialista están en `claude/agents/`.

👉 **Paso a paso para tu primer vídeo, referencias de estilo y consejos: [docs/GUIA.md](docs/GUIA.md).**

## Consumo aproximado

Un vídeo de unos 30 segundos, de principio a fin, gasta aproximadamente **entre 1 y 1,5 millones de tokens** en
Claude Code (explorador, animador y director). La guía explica cómo gastar menos.

## Herramientas

Todas se ejecutan con `node tools/<herramienta>.mjs` y tienen `--ayuda`:

| Herramienta        | Para qué                                                                            |
| ------------------ | ----------------------------------------------------------------------------------- |
| `nuevo-proyecto`   | Crea la carpeta de un proyecto desde las plantillas                                 |
| `capturar`         | Capturas reales de una web o app (también localhost), recortes transparentes        |
| `referencia`       | Fotogramas y hoja de contactos de un vídeo de referencia (archivo, URL o post de X) |
| `medir-audio`      | Picos de los efectos, BPM, pulsos y subida de la música → `AUDIO.json`              |
| `vista-previa`     | Abre una escena en el navegador con barra de tiempo                                 |
| `render`           | MP4 en uno o varios formatos, borradores, tramos o fotos PNG                        |
| `revisar`          | Hojas de contactos, prueba de móvil, tiras, saltos de un fotograma y bucle          |
| `doctor`           | Diagnóstico de la instalación                                                       |
| `preparar`         | Navegador de capturas y entorno de Python con las versiones fijadas                 |
| `instalar-agentes` | Añade o comprueba la skill y los agentes en `~/.claude`                             |

## Estructura

```
engine/      motor del navegador: muelles, formatos, tempo, montaje, técnicas
tools/       herramientas de línea de comandos (tools/lib: sus librerías)
claude/      skill /youtubeman y fichas de los agentes
templates/   plantillas de proyecto, escena y montaje
ejemplos/    proyecto de ejemplo («Ruta», una app inventada): la base que siguen los agentes
REGLAS.md    reglas de todos los vídeos
docs/        GUIA (uso), CONTRATO-ESCENA (motor), RUNBOOK (si algo falla), adr/ (decisiones)
tests/       pruebas unitarias y de integración
```

## Contribuir

Las mejoras son bienvenidas: abre un issue o un pull request. Antes de enviar:

```bash
npm run lint && npm run format:check && npm test
```

Normas del código: [CLAUDE.md](CLAUDE.md) · cambios: [CHANGELOG.md](CHANGELOG.md) · si algo falla:
[docs/RUNBOOK.md](docs/RUNBOOK.md).

## Licencia

[MIT](LICENSE). La música, los efectos y las fuentes que uses en cada proyecto tienen su propia licencia: el
explorador las anota en el inventario del proyecto.
