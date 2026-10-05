# ADR 0002 · El director es una skill y el equipo son tres subagentes

- **Fecha:** 2026-10-02
- **Estado:** aceptada

## Contexto

El autor quería "un agente superpotente" llamado youtubeman que genere vídeos y publicaciones a partir de sus
proyectos. La investigación muestra que lo que separa un buen resultado de uno genérico es el **proceso**: material
real, reglas, guion aprobado y un bucle de crítica, y que conviene trabajar por escenas en paralelo. Además, el
usuario tiene que aprobar cada paso: no se hace nada sin su permiso.

En Claude Code un subagente **no puede lanzar otros subagentes**.

## Decisión

- **`/youtubeman` es una skill** (el director): se ejecuta en la conversación principal, habla con el usuario, para en
  4 puntos de control y lanza a los especialistas.
- **Tres subagentes** con su ficha guardada (`claude/agents/`):
  - `youtubeman-explorador`: kit real a partir del repo (solo lectura).
  - `youtubeman-animador`: una escena o el montaje (varios en paralelo).
  - `youtubeman-critico`: separado del animador porque nadie critica bien su propio trabajo.
- Los tres usan `model: opus` (la calidad manda) y `omitClaudeMd: true`: su proceso es el del estudio, no el de
  desarrollo de software del `CLAUDE.md` global. Sus descripciones dicen "solo cuando lo pida el director" para que
  no se activen por su cuenta en otras conversaciones.
- Las plantillas de encargo (`claude/skills/youtubeman/encargos.md`) existen porque los subagentes empiezan sin
  memoria y no pueden preguntar al usuario.

## Consecuencias

- El usuario conserva el control en cada fase; el trabajo pesado corre en paralelo y fuera de la conversación.
- Si Claude Code permite algún día subagentes anidados, el director podría pasar a ser un subagente sin cambiar
  las fichas del equipo.
