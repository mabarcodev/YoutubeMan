# ADR 0005 · Repo público: rutas por marcadores e instalación completa

- **Fecha:** 2026-10-05
- **Estado:** aceptada

## Contexto

El estudio se publica en GitHub para que cualquiera lo use y lo mejore. Hasta la v0.1.0 la skill y los agentes
llevaban escrita la ruta absoluta del estudio del autor, la documentación usaba rutas de su ordenador y Python con
librosa era opcional. Para un producto público eso falla dos veces: no funciona en otro ordenador sin editar a mano y
cada instalación puede quedar distinta (sin librosa la música no se sincroniza igual).

## Decisión

- **Marcadores de ruta.** Los `.md` de `claude/` usan `{{ESTUDIO}}` y `{{VIDEOS}}`. `tools/instalar-agentes.mjs`
  (antes `instalar-claude`) los sustituye al copiar por las rutas reales que calcula `tools/lib/rutas.mjs`, con
  barras `/` (valen en PowerShell, Bash y Markdown). La comparación de `--comprobar` se hace sobre el contenido ya
  sustituido.
- **Todo obligatorio y con versiones fijadas.** Python con librosa pasa a ser obligatorio en `doctor.mjs`.
  `requirements.txt` fija librosa y sus dependencias numéricas; `package-lock.json` fija Playwright y, con él, la
  versión de Chromium. `npm run preparar` (`tools/preparar.mjs`) instala el navegador, crea `.venv` con esas
  versiones y termina con el diagnóstico.
- **Sin instalador propio.** Node, Python y ffmpeg son programas del sistema: el README da el comando de cada
  sistema y la skill le dice al director que los detecte con `doctor.mjs` y los instale con el permiso del usuario.
- **La IA es libre.** El estudio funciona sin ninguna IA concreta. Claude Code es la vía recomendada porque la skill
  y los agentes ya vienen en su formato; con otra IA se usan los mismos documentos como instrucciones.

## Consecuencias

- Clonar en cualquier carpeta y ejecutar `npm install`, `npm run preparar` y `npm run instalar-agentes` deja el estudio
  igual que el del autor.
- Quien ya tenga los agentes instalados no tiene que hacer nada: sus copias siguen valiendo. Si vuelve a instalar,
  solo cambian las rutas por las suyas (con copia `.bak` de lo anterior).
- Mover la carpeta de vídeos ya no obliga a editar nada: basta con volver a ejecutar `npm run instalar-agentes`.
