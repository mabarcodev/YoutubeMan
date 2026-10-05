# Contrato de escena · referencia del motor

Todo lo que necesita quien escribe una escena o una película. Modelo completo que funciona:
`ejemplos/demo/`. Reglas que se aplican siempre: `REGLAS.md`.

## 1. El módulo de una escena

Cada escena es un módulo ES (`escenas/NN-nombre/escena.js`) que exporta por defecto un objeto:

```js
export default {
  nombre: '01-gancho', // para logs y nombres de archivo
  duracion: 6, // segundos, o función (ctx) => ctx.tempo.pulsos(12)
  fondo: '#121418', // color del escenario
  fuentes: [{ familia: 'Manrope', url: '/kit/fuentes/Manrope-800.ttf', peso: 800, estilo: 'normal' }],
  imagenes: { panel: '/kit/capturas/panel.png' }, // se cargan y decodifican antes de montar → ctx.img.panel
  sonidos: [
    { t: 1.5, tipo: 'click' },
    { t: 3, archivo: '/kit/audio/whoosh.wav', volumen: 0.8 },
  ], // o (ctx) => [...]
  musica: { archivo: '/kit/audio/tema.wav', desde: 12.5, inicio: 0, volumen: 0.9, fundido: 1 }, // o null
  async montar(escenario, ctx) {
    /* crea los elementos UNA vez */
  },
  dibujar(t, ctx) {
    /* coloca todo en el instante t (función pura) */
  },
};
```

- **`montar(escenario, ctx)`** se llama una vez (puede ser `async`, p. ej. para leer un JSON del kit con `fetch`).
  `escenario` es un `div` de `ctx.W × ctx.H` px con `overflow: hidden`.
- **`dibujar(t, ctx)`** pinta el instante `t` (segundos desde el inicio de la escena). Mismo `t` → mismo fotograma,
  en cualquier orden. Solo asigna estilos y posiciones calculados a partir de `t`.
- **Sonidos:** `t` es el segundo en el que debe caer el **pico** del sonido (el render adelanta el archivo según su
  pico medido; con `picoMs` lo fijas a mano). `tipo` usa un sonido sintetizado (`click`, `tick`, `pop`, `thump`,
  `whoosh`, `ding`, `beep`): solo para borradores o pruebas; en proyectos reales, `archivo` de `kit/audio/`.
- **Música:** `desde` = segundo de la pista por el que empieza; `inicio` = segundo del vídeo en el que entra;
  `fundido` = segundos de fundido de salida al final del vídeo. La mezcla se normaliza a −14 LUFS.

## 2. El contexto `ctx`

| Campo          | Qué es                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `W`, `H`       | Tamaño del lienzo en px (1920×1080, 1080×1920, 1080×1080 o 1080×1350)                          |
| `formato`      | `'16:9'`, `'9:16'`, `'1:1'` o `'4:5'`                                                          |
| `orientacion`  | `'horizontal'`, `'vertical'` o `'cuadrado'`                                                    |
| `u`            | Unidad de escala: 1 cuando el lado corto mide 1080. Escribe tamaños como `48 * ctx.u`          |
| `zona`         | Zona segura: `{ x, y, w, h, arriba, derecha, abajo, izquierda }` (el texto importante, dentro) |
| `tempo`        | Reloj musical de `proyecto.json` (ver §4)                                                      |
| `proyecto`     | El `proyecto.json` leído (o `null`)                                                            |
| `img`          | Imágenes de `imagenes`, ya decodificadas: `ctx.img.panel` (un `HTMLImageElement`)              |
| `render`       | `true` al renderizar, `false` en la vista previa                                               |
| `cache`        | Caché interna de imágenes por URL (la usa el montaje)                                          |
| `inicioGlobal` | Solo dentro de una película: segundo de la película en el que empieza esta escena              |

## 3. Rutas

El servidor local sirve **`/estudio/…`** desde `_estudio/` y **`/…`** desde la carpeta del proyecto:

- Motor: `import { spring } from '/estudio/engine/motion.js';`
- Material: `/kit/capturas/panel.png`, `/kit/fuentes/…`, `/kit/audio/…`; el proyecto: `/proyecto.json`.
- Entre escenas del mismo proyecto, rutas relativas: `import { COLOR } from '../comun.js';`

## 4. API del motor

### `motion.js` (movimiento; todo es función pura de `t`)

| Función                                                                       | Ejemplo                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `spring(t, muelle)` → 0…1 (con rebote según preset)                           | `const s = spring(t - 0.5, 'rapido');`                                         |
| `springTo(t, de, a, inicio = 0, muelle)`                                      | `const x = springTo(t, -200, 0, 1.0, 'normal');`                               |
| `track(t, [[t, v], …], muelle)`                                               | `const x = track(t, [[0, 100], [1, 400], [2.5, 250]]);` (un muelle por cambio) |
| `trackN(t, [[t, [x, y]], …], muelle)`                                         | `const [x, y] = trackN(t, puntos, 'rapido');`                                  |
| `logZoom(t, [[t, zoom], …], muelle)`                                          | `const zoom = logZoom(t, [[0, 1], [1.5, 2.4]]);`                               |
| `indicador(t, [[t, x], …])` → `{ izq, der }`                                  | pestaña que se estira: borde delantero más rígido que el trasero               |
| `swapAlpha(t, tIn, tOut, { retraso, entrada, salida })`                       | opacidad del contenido dentro de una forma que se transforma                   |
| `loopT(t, dur)`, `stagger(i, paso = 0.05, inicio = 0)`                        | `spring(t - stagger(i, 0.08, 1.0))`                                            |
| `rng(semilla)` → función, `hash01(semilla, i)`, `ruido(semilla, x)`           | aleatorio determinista: **nunca** `Math.random`                                |
| `clamp(x, a = 0, b = 1)`, `lerp(a, b, p)`, `progreso(t, desde, hasta)`        | utilidades                                                                     |
| `ease.{lineal, inOutCubic, outExpo, outCubic}`, `keyframes(t, claves, curva)` | solo para cosas sin masa (barras lineales)                                     |

`MUELLES`: `rapido` (botones, cursor; rebote ~1 %), `normal` (tarjetas, cámara), `pesado` (tipografía grande,
logos, cifras), `jugueton` (mascotas, stickers; rebote visible). También vale `{ k, d }` propio.

### `layout.js` (formatos)

`FORMATOS`, `normalizarFormato('reels') → '9:16'`, `formato('16:9') → { clave, w, h, nombre, usos }`,
`orientacion({ w, h })`, `unidad({ w, h })`, `zonaSegura('9:16')`, `encajar(contenedor, caja, 'contain' | 'cover')
→ { x, y, w, h, escala }`, `TEXTO_MINIMO` (28 px).

### `tempo.js` (`ctx.tempo`)

`pulso` (segundos de un pulso), `beat(n)` → segundo del pulso `n` (admite fracciones), `aBeat(t)`, `compas(n)`,
`pulsos(n)` → duración de `n` pulsos. Ejemplo: `spring(t - ctx.tempo.beat(4), 'rapido')`.

### `tecnicas.js` (DOM)

| Función                                                                                | Para qué                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `crear(tag, estilos, padre, { texto, html, …attrs })`                                  | Elemento en posición absoluta                                     |
| `aplicar(el, { x, y, escala, escalaX, escalaY, rot, opacidad })` / `transformar({…})`  | Transform en un paso (redondeado)                                 |
| `palabrasEnMascara(padre, texto, estilos, { claseAcento, acentos, holgura })` → spans  | Texto que sube desde una línea, palabra a palabra                 |
| `subirDesdeMascara(span, p)`                                                           | `p = 0` escondida, `p = 1` en su sitio (con muelle puede pasarse) |
| `crearCursor(padre, { tam })`, `colocarCursor(c, x, y, { escala, pulsado, opacidad })` | Cursor; la punta está en (x, y)                                   |
| `pulsoClic(t, tClic, dur = 0.16)` → 0…1…0                                              | Encoger el cursor al hacer clic: `{ pulsado: pulsoClic(t, 3) }`   |
| `camara(contenedor, { x, y, zoom }, ctx)` / `transformCamara(…)`                       | Centra el punto (x, y) del contenido con ese zoom                 |
| `formatearNumero(v, { decimales, moneda, locale, prefijo, sufijo })`                   | Contadores sin "−0"; `{ moneda: 'EUR' }`                          |

`holgura` (em, por defecto `HOLGURA_MASCARA` = 0.35) deja sitio a tildes y descendentes; si hay algo justo debajo
del texto (una barra) pide menos o mide la máscara y sepárala (ver `ejemplos/demo/escenas/03-cierre`).

### `composicion.js` (montaje)

- `encadenar([a, b, c], { solape: 0.5, fondo, musica, nombre })`: escenas seguidas; con `solape`, cada una empieza
  antes de que acabe la anterior y durante ese tiempo se ven las dos (traspaso con forma compartida).
- `secuencia([[a, 0], [b, (ctx) => ctx.tempo.beat(12)]], opciones)`: inicios explícitos (número o función).
- Una película cumple el mismo contrato que una escena: se renderiza, se revisa y se puede anidar.
- La escena que entra **encima** de otra durante un solape suele ir sin fondo propio (`{ ...escena, fondo: undefined }`).

## 5. Publicaciones

- **Imagen:** una escena (o un instante de una película) → `render.mjs --fotos 2.5 --formato 4:5`.
- **Carrusel:** `duracion` = nº de diapositivas, cada diapositiva completa en su segundo entero →
  `--fotos 0,1,2,3 --formato 4:5`. Los PNG van sin pérdida; con `--escala 2`, al doble de resolución.

## 6. Previsualizar, renderizar y revisar

```bash
node tools/vista-previa.mjs --proyecto <dir> --modulo <escena.js|pelicula.js> [--formato 9:16] --abrir
node tools/render.mjs --proyecto <dir> --modulo <ruta> --fotos 0,1.5,3          # fotos clave
node tools/render.mjs --proyecto <dir> --modulo <ruta> --borrador               # 30 fps, rápido
node tools/render.mjs --proyecto <dir> --modulo <ruta> --desde 4 --hasta 6      # un tramo
node tools/render.mjs --proyecto <dir> --modulo pelicula.js --formato 16:9,9:16 # final → salida/
node tools/revisar.mjs <video.mp4> --bpm 120 --tiras 4.2                        # hojas, móvil, saltos, bucle
```

En la vista previa: espacio = reproducir, ← → = fotograma a fotograma, `?t=4.5` en la URL abre en ese instante.

## 7. Trampas frecuentes

- **Nada de transiciones ni animaciones CSS, temporizadores, `requestAnimationFrame`, `Date.now` ni `Math.random`**
  en las escenas: rompen el determinismo (`npm run smoke` lo detecta en el motor; `revisar.mjs` marca saltos).
- **Fuentes:** decláralas en `fuentes` (si no, el render puede capturar antes de que carguen) y descárgalas a `kit/fuentes/`.
- **Tamaños sin `ctx.u`** se ven enormes en vertical o diminutos en horizontal. Texto ≥ 28 px y dentro de `ctx.zona`.
- **`transform-origin`:** `crear()` no lo cambia (centro por defecto); la cámara usa `0 0`.
- **Máscaras de texto:** usa `palabrasEnMascara` (no recortes a mano) y respeta su `holgura`.
- **Orden de capas:** lo que se crea después queda encima; usa `zIndex` si un traspaso lo necesita.
- **Imágenes grandes:** capturas a escala 2 sí (zoom nítido), pero no 8K: cada página de Chromium las decodifica.
- **`will-change`** en lo que escala la cámara deja el texto borroso.
- **Formatos:** si una escena solo funciona en 16:9, no está terminada: prueba con `--fotos` en cada formato.
