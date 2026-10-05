# Guion · Ruta (demo)

> 120 BPM: 1 pulso = 0,5 s. Tiempos de la película (cada escena detalla los suyos en su cabecera).

## La pieza en una línea

Doce paradas desordenadas se convierten, con un clic, en una ruta un 36 % más corta.

## Escenas

### 01 · Gancho · pulsos 0–8 (0–4 s)

- **Objetivo:** que la miniatura diga la promesa y en 2 s se entienda el problema.
- **Se ve:** "Reparte sin dar *vueltas*●" (primer fotograma = miniatura = último fotograma).
- **Movimiento:** la frase sale por arriba; "vueltas●" se queda y entra "12 paradas, demasiadas" palabra a palabra.
- **Texto en pantalla:** "Reparte sin dar _vueltas_" → "12 paradas, demasiadas _vueltas_".
- **Sonido:** `tick` en cada palabra; `whoosh` cuando el punto salta al centro.
- **Traspaso:** el punto final de la frase salta al centro y crece.

### 02 · Demo · pulsos 7–16 (3,5–8 s)

- **Objetivo:** enseñar la función con la interfaz real.
- **Se ve:** el punto crece hasta ser la tarjeta con la captura; el naranja se recoge en el botón "Optimizar ruta".
- **Movimiento:** entra el cursor, la cámara se acerca, clic, la captura optimizada se abre en círculo desde el
  clic y la cámara se aleja para enseñar la ruta naranja entera.
- **Texto en pantalla:** el de la propia app (32,4 km → 20,7 km, "−11,7 km · −36 %").
- **Sonido:** `whoosh` al crecer, `click` en el clic.
- **Traspaso:** la tarjeta se aplasta hasta ser la barra de distancia.

### 03 · Cierre · pulsos 15–24 (7,5–12 s)

- **Objetivo:** la prueba con el dato real y la frase de marca.
- **Se ve:** "32,4 km" sobre la barra; la barra encoge y el contador baja con ella hasta "20,7 km −36 %".
- **Movimiento:** la prueba se queda quieta un segundo (para leerla y capturarla); la barra se recoge en el punto
  y la frase sube palabra a palabra con el punto saltando tras cada una.
- **Texto en pantalla:** "32,4 km" → "20,7 km _−36 %_" → "Reparte sin dar _vueltas_".
- **Sonido:** `pop` al aparecer, `ding` en la prueba, `tick` por palabra.
- **Traspaso:** el último fotograma es el primero: bucle.

## Momento clave

Pulso 18 (9 s): "20,7 km −36 %" con el `ding`.

## Cierre

Último fotograma = primero (comprobado por `revisar.mjs`: diferencia del bucle 0,02).
