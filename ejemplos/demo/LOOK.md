# Look · Ruta (demo)

- **Lienzo:** `#121418` (asfalto de noche): oscuro y neutro, para que la interfaz clara de la app destaque sin brillos.
- **Tipografía de titulares:** Manrope 800 (`kit/fuentes/manrope/`, OFL), interletrado ligeramente cerrado.
- **Tipografía de interfaz o secundaria:** la de las capturas reales; las cifras del cierre en Manrope.
- **Palabra de acento:** una por titular, en Instrument Serif cursiva (`kit/fuentes/instrument-serif/`, OFL) y
  en el naranja de la app.
- **Colores con significado:** `#F3F4F6` tinta · `#8D95A1` texto secundario · `#FF5B2E` naranja de la app
  (acción, la ruta optimizada, el punto) · `#2A2E36` carril vacío de la barra de distancia.
- **Interfaz:** solo capturas reales (`kit/capturas/`), escritorio para 16:9 y 1:1, móvil para 9:16 y 4:5.
- **Cómo entra y sale el texto:** sube desde una línea de máscara, una palabra por pulso; sale hacia arriba.
- **Transiciones:** forma compartida: el punto final de la frase crece hasta ser la tarjeta de la app, la
  tarjeta se aplasta hasta ser la barra de distancia, la barra se recoge en el punto.
- **Cámara:** un único contenedor; zoom en escala logarítmica hacia donde trabaja el cursor.
- **Muelles:** `rapido` en interfaz y cursor, `pesado` en las cifras (sin rebote: son datos), `normal` en el resto.
- **Sonido:** `tick` por palabra, `whoosh` en los traspasos, `click` en el clic, `pop`/`ding` en la prueba.
- **Prohibido en este proyecto:** cualquier dato que no salga de la app (`capturas.json`).
