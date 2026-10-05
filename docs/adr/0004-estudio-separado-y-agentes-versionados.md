# ADR 0004 · Taller en `Videos/_estudio` y agentes versionados aquí

- **Fecha:** 2026-10-02
- **Estado:** aceptada

## Contexto

El estudio se organiza así: `<carpeta-de-vídeos>` es la carpeta principal y cada producto tiene una
subcarpeta para **sus vídeos y su material** (nunca el repo, que vive en otro sitio y solo se lee). Los agentes de
Claude Code viven en `~/.claude`, fuera de cualquier repositorio.

## Decisión

- El código compartido (motor, herramientas, plantillas, reglas, ejemplo) vive en `<carpeta-de-vídeos>/_estudio`,
  un repo git con sus dependencias (Playwright, venv de Python). Los proyectos lo usan sin copiarlo: el servidor
  local sirve `/estudio/*` desde aquí y `/*` desde la carpeta del proyecto.
- Las fichas de los subagentes y la skill tienen su **copia de referencia** en `_estudio/claude/` (versionada) y se
  instalan en `~/.claude` con `npm run instalar-agentes`, que solo crea o actualiza archivos, guarda copia `.bak` de lo
  que sustituye y nunca toca otros agentes o skills.

## Consecuencias

- Los cambios en los agentes quedan en el historial de git y se pueden revisar o deshacer.
- Si alguien edita a mano los agentes en `~/.claude`, `npm run instalar-agentes -- --comprobar` lo detecta.
- ~~Mover la carpeta de vídeos obliga a actualizar las rutas absolutas de la skill y de los agentes.~~ Resuelto en la
  ADR 0005: la skill y los agentes llevan marcadores que `instalar-agentes` sustituye por las rutas de cada ordenador.
