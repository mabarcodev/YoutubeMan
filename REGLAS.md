# Reglas del estudio

Se aplican a **todos** los vídeos y publicaciones, además del `LOOK.md` de cada proyecto. Si una regla choca
con el brief, gana el brief, pero se dice en el informe. Vienen de lo que separa los vídeos buenos hechos con
código de los genéricos: el prompt es el 10 %; estas reglas, el material real y el bucle de crítica son el 90 %.

## 1. Contrato del render

- Cada pieza es una **función pura del tiempo**: `dibujar(t, ctx)` pinta exactamente el instante `t`.
  Mismo `t`, mismo fotograma, en cualquier orden y en cualquier ejecución.
- **Prohibido en escenas:** `Math.random` (usa `rng`, `hash01` o `ruido` de `motion.js`), `Date.now`,
  `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`, transiciones y animaciones CSS
  (`transition`, `animation`, `@keyframes`), vídeos que se reproducen solos y cualquier estado que dependa del
  fotograma anterior.
- `montar()` crea los elementos una vez; `dibujar()` solo asigna posiciones y estilos calculados a partir de `t`.
- Movimiento con **muelles en forma cerrada** (`spring`, `springTo`, `track` de `motion.js`). Un valor que cambia
  de destino varias veces usa `track()` (un muelle por cambio), nunca un muelle que se reinicia.
- **Cámara:** un único contenedor con `camara()`; un movimiento cada vez; zoom con `logZoom()`.
- Nada de `will-change` en lo que escala la cámara (deja el texto borroso).
- Todos los tiempos en **pulsos** (`ctx.tempo.beat(n)`), para que imagen y sonido lean el mismo reloj.
- Fuentes descargadas en `kit/fuentes/` e imágenes en `kit/`: el render no depende de internet.

## 2. Verdad del producto

- **Nunca se redibuja la interfaz del producto.** Solo capturas reales (`kit/capturas/`). Si falta un estado
  (un interruptor apagado, una lista vacía), se captura de la app real o de una copia local; nunca se inventa.
- **Ningún dato inventado:** ni números, ni nombres, ni precios, ni moneda. Solo lo que existe en el producto o
  en el brief. Si los datos reales no cuentan una historia limpia, se dice; no se maquillan.
- Logo, colores y tipografías **reales** del producto.
- El repo del producto es de **solo lectura**. Nunca se modifica, ni se instala nada en él, sin permiso explícito.

## 3. Look: lo que delata un vídeo genérico

- **Prohibido por defecto:** texto centrado sobre un degradado · todo apareciendo con un fundido · etiquetas en
  las esquinas y marcos · brillos (glow) en la interfaz · explosiones de partículas genéricas · degradados sobre
  la interfaz · 3D gratuito · numeración tipo "01 · CREATE" · fondo crema por defecto · pantalla oscura con
  brillo verde por defecto · rebotes exagerados.
- Una tipografía de titulares y una de interfaz. Un color de acento, salvo que `LOOK.md` diga otra cosa.
- **Cada 2–4 segundos pasa algo nuevo.** Ningún plano muerto.
- **Transformar en vez de cortar:** un punto crece hasta ser un botón, un botón se estira hasta ser una tarjeta.
  Si se puede señalar un momento en que algo desaparece y otra cosa aparece, es un corte.
- Texto legible en móvil: nunca menos de 28 px en un lienzo de 1080 de lado corto, y siempre dentro de
  `ctx.zona` (la zona segura de cada formato).
- Rebote pequeño en interfaz; ninguno en tipografía grande.

## 4. Formatos

- Las escenas se escriben con `ctx.W`, `ctx.H`, `ctx.u` y `ctx.zona`: cada formato se **reencuadra**, nunca se
  recorta de otro.
- 16:9 para X, YouTube y web · 9:16 para Reels, Shorts y TikTok · 1:1 para feeds · 4:5 para posts.
- **El primer fotograma es la miniatura** del feed: tiene que decir el gancho con palabras.
- Pensado para verse **sin sonido**: cada momento importante funciona como texto en pantalla.
- Si el vídeo hace bucle, el último fotograma es igual al primero.

## 5. Sonido

- Preferencia: **grabaciones reales** con licencia comercial (p. ej. Mixkit) en `kit/audio/`, medidas con
  `medir-audio.mjs` (pico, duración; BPM, pulsos y subida de la música) y con su licencia anotada.
- Los sonidos sintetizados (`tipo: 'click'`…) son para borradores, pruebas o si el usuario lo pide.
- Cada efecto se coloca para que **su pico** caiga en su evento: el estudio adelanta el sonido según `picoMs`.
- Los MP3 se convierten a WAV (pueden esconder un pequeño retardo).
- La música empieza en un tiempo fuerte y el momento clave cae en la subida.
- Mezcla final a −14 LUFS (automático en el render).
- **Claude no oye:** el usuario valida siempre el audio.

## 6. Bucle de calidad (antes de enseñar nada al usuario)

1. Fotos de 3–5 instantes clave (`render.mjs --fotos`) y mirarlas.
2. Borrador (`--borrador`) y `revisar.mjs`: hojas de contactos, móvil, tiras de las acciones rápidas, saltos de
   un fotograma y cierre del bucle.
3. El crítico puntúa de 1 a 10: gancho en 2 s · legibilidad en móvil · calidad del movimiento · variedad ·
   composición · fidelidad a la marca · sincronía del sonido · pulido.
4. Se arreglan los **3 peores problemas** y se re-renderiza solo el tramo afectado (`--desde/--hasta`).
5. Se repite hasta que todo puntúe **8 o más**. Si tras 3 rondas no se llega, se consulta al usuario.
6. Solo entonces, render final en todos los formatos.

## 7. Entregas

- Finales en `salida/`, versionados (`-v1`, `-v2`…); nunca se sobrescribe un final anterior.
- Material de trabajo y revisión en `revision/`.
- Cada entrega dice qué se arregló y **qué se cambiaría todavía**.
- Claves de API en `.env`; nunca en prompts, documentos ni capturas.
