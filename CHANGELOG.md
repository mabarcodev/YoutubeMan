# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.3.0] · 2026-10-06

Todo dentro de la carpeta del estudio: nada se instala en la configuración de tu IA. Ver ADR 0006.

> ⚠️ **Cambio incompatible.** Abre tu IA **dentro** de la carpeta del estudio. Si instalaste la v0.2.0, borra
> `~/.claude/skills/youtubeman` y `~/.claude/agents/youtubeman-*.md`: esa copia antigua tiene prioridad sobre la
> del repo. Los vídeos nuevos se crean en `videos/`; los que ya tengas fuera siguen valiendo si das su ruta.

### Añadido

- **`npm run instalar`:** un solo comando, también recién clonado. Instala las librerías (`npm ci`) si faltan, el
  navegador de capturas, el entorno de Python y termina con el diagnóstico y con dónde abrir la IA. El README da una
  línea que descarga e instala, y la opción de pedírselo a tu IA.
- **`AGENTS.md`:** las instrucciones para Codex y otras IAs (Claude Code las lee a través de `CLAUDE.md`).
- **README nuevo (es/en):** portada, «Qué puedes pedirle» con ejemplos, «Qué incluye» (la skill y los 3 agentes) y
  la instalación explicada paso a paso.
- **`videos/`:** carpeta de tus vídeos dentro del estudio, ignorada por git.
- **`tests/unit/agentes.test.mjs`:** vigila que la skill y los agentes estén completos, sin rutas de ningún ordenador
  y citando archivos que existen.
- **ADR 0006:** todo dentro del repo.

### Cambiado

- La skill y los agentes pasan de `claude/` a **`.claude/`** y se usan desde ahí, sin instalar: solo funcionan con
  la IA abierta en la carpeta del estudio. Sin marcadores de ruta: el director da la ruta del estudio en cada encargo.
- `nuevo-proyecto` crea los vídeos en `videos/<nombre>` y solo deja crear dentro del estudio ahí.
- Los mensajes de las herramientas piden `npm run instalar` y hablan de «la carpeta del estudio».
- Los tests de `referencia` usan un usuario y unos ids de X inventados en vez de los de un post real.
- El traspaso y el RUNBOOK ya no nombran proyectos ni equipos concretos.
- La guía (es/en) aclara que los enlaces de YouTube, Instagram o TikTok no se descargan solos: hay que pasar el
  archivo.

### Quitado

- `npm run instalar-agentes` (`tools/instalar-agentes.mjs`): ya no hace falta copiar nada a `~/.claude`.

### Corregido

- **El agente crítico no se cargaba:** su descripción tenía «vídeo: genera…» sin comillas, que no es YAML válido, y
  Claude Code ignoraba el agente entero. `tests/unit/agentes.test.mjs` vigila ahora las cabeceras.

## [0.2.0] · 2026-10-05

Primera versión pública.

### Añadido

- **Documentación pública:** README en español e inglés, guía de uso «Tu primer vídeo» (`docs/GUIA.md`,
  `docs/GUIDE.en.md`) con cómo pedir un vídeo, puntos de control, referencias de estilo, música, formatos, consumo
  de tokens y uso con otras IAs. Licencia MIT.
- **`npm run preparar`** (`tools/preparar.mjs`): instala el Chromium de Playwright, crea `.venv` con las versiones
  fijadas en `requirements.txt` y termina con el diagnóstico.
- **ADR 0005:** repo público, rutas por marcadores e instalación completa.

### Cambiado

- **Rutas por marcadores:** la skill y los agentes usan `{{ESTUDIO}}` y `{{VIDEOS}}`; el instalador los sustituye
  por las rutas de cada ordenador. El repo ya no lleva rutas de ningún equipo.
- `instalar-claude` pasa a llamarse **`instalar-agentes`** (`npm run instalar-agentes`).
- **Python con librosa es obligatorio** en `doctor.mjs` (antes opcional): sin él la música no se sincroniza igual.
- La skill indica al director cómo detectar e instalar (con permiso) Node, Python y ffmpeg si faltan.
- Ejemplos neutros en tests y ayudas; traspaso y ADRs sin notas personales.

## [0.1.0] · 2026-10-05

Primera versión del estudio de **youtubeman**.

### Añadido

- **Motor** (`engine/`): escenas como módulos con `dibujar(t)` puro; muelles en forma cerrada (`spring`, `track`,
  `logZoom`…), formatos 16:9 / 9:16 / 1:1 / 4:5 con zonas seguras, tempo en pulsos, montaje de escenas con traspasos
  por solape, técnicas de DOM (texto en máscara, cursor, cámara, contadores) y vista previa con barra de tiempo.
- **Render** (`tools/render.mjs`): Playwright + ffmpeg con 4 páginas en paralelo, JPEG para el vídeo y PNG para las
  fotos, desenfoque de movimiento por submuestras, borradores, tramos, varios formatos y finales versionados que
  nunca se sobrescriben. Mezcla de audio alineando el pico de cada sonido, normalizada a −14 LUFS.
- **Revisión** (`tools/revisar.mjs`): hojas de contactos con marcas de tiempo exactas, prueba de móvil, tiras de
  fotogramas, detección de saltos de un fotograma y comprobación del bucle.
- **Herramientas:** `capturar` (capturas reales), `referencia` (estilo de un vídeo, también de posts de X),
  `medir-audio` + `beats.py` (picos, BPM, pulsos, subida), `nuevo-proyecto`, `vista-previa`, `doctor`,
  `instalar-agentes` y la prueba de humo `smoke`.
- **Agentes:** skill `/youtubeman` (director con 4 puntos de control) y subagentes explorador, animador y crítico,
  versionados en `claude/` e instalables con `npm run instalar-agentes`.
- **Reglas, plantillas y documentación:** `REGLAS.md`, plantillas de proyecto, escena y montaje,
  `docs/CONTRATO-ESCENA.md`, `docs/RUNBOOK.md` y 4 ADR.
- **Ejemplo** completo en `ejemplos/demo` ("Ruta", app ficticia) en los cuatro formatos.
- **Tests:** 579 (533 unitarios y 46 de integración con ffmpeg y Chromium), cobertura del 97,5 % de líneas.

### Corregido durante el desarrollo

- La hoja de contactos usaba el redondeo por defecto de ffmpeg y sus marcas de tiempo se desviaban hasta 0,25 s.
- Un render que fallaba a mitad dejaba ffmpeg esperando fotogramas y el proceso colgado.
- Con interlineados apretados, la máscara de texto dejaba asomar tildes y cortaba descendentes.
- Validación de opciones (`--hasta`, `--fps`, `--escala`, `--hilos`, `--crf`, `--fotos`, `--umbral`, `--bpm`,
  `--tiras`), formatos duplicados, `--salida x.mp4` con varios formatos, renders parciales tratados como finales,
  proyectos en la raíz de una unidad, archivos que empiezan por `..`, formatos con nombres heredados de `Object`,
  `bpm` o `pulsosPorCompas` no válidos, y errores de argumentos traducidos al español.
- Prettier convertía los marcadores `__NOMBRE__` de las plantillas en negrita: las plantillas quedan excluidas y
  un test lo vigila.
