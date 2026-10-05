# Plantillas de encargo para los subagentes

Los subagentes empiezan sin memoria y **no pueden preguntar al usuario**: todo lo que necesiten va en el encargo.
Sustituye lo que está entre `<>`. Usa siempre rutas absolutas.

## Explorador · kit inicial

```text
Proyecto: <Proyecto> · carpeta del proyecto: {{VIDEOS}}/<Proyecto>
Repo del producto (SOLO LECTURA): <ruta del repo>
Web o app para capturas: <URL pública | "arrancar en local: PERMITIDO con <comando>" | "NO arrancar nada">
Instalar dependencias en el repo: <NO | PERMITIDO: <comando exacto>>
Qué vamos a hacer: <tipo de pieza, duración, formatos>
Funciones que probablemente se enseñen: <lista o "decídelo por el repo y propónmelo">
Referencias de estilo: <archivos o enlaces, o "ninguna">
Audio: <"busca música y efectos reales con licencia comercial (Mixkit) y mídelos" | "sintetizado" | "ninguno">

Prepara el kit (marca, capturas reales, referencias, audio) y escribe kit/INVENTARIO.md.
```

## Explorador · capturas que faltan (después del guion)

```text
Proyecto: {{VIDEOS}}/<Proyecto> · repo (solo lectura): <ruta>
Permisos: <igual que antes / cambios>
El guion aprobado (guion.md) necesita estos estados reales que no tenemos:
- <escena 02: el interruptor "Recordatorios" APAGADO y la línea de tiempo vacía>
- <elemento "botón Nueva factura" recortado con fondo transparente para transformarlo>
Captúralos y actualiza kit/INVENTARIO.md.
```

## Animador · una escena

```text
Proyecto: {{VIDEOS}}/<Proyecto>
Tu escena: <NN-nombre> → escribe SOLO en escenas/<NN-nombre>/
Lee antes: _estudio/REGLAS.md, _estudio/docs/CONTRATO-ESCENA.md, LOOK.md, brief.md, guion.md (tu escena: "<título>"),
kit/INVENTARIO.md, kit/AUDIO.json (si existe) y el ejemplo _estudio/ejemplos/demo/.
Formatos que deben funcionar: <16:9, 9:16>
Traspasos: entra desde <forma con la que acaba la escena anterior>; sale hacia <forma con la que empieza la siguiente>.
Construye la escena, renderiza fotos y borrador, mira tus propios fotogramas y púlela hasta que cumpla.
Devuélveme: archivos, puntuaciones propias, problemas abiertos y "lo que aún cambiaría".
```

## Animador · arreglos tras el crítico o las notas del usuario

```text
Proyecto: {{VIDEOS}}/<Proyecto> · escena: escenas/<NN-nombre>/escena.js
Informe a resolver: <ruta a revision/<NN-nombre>/ronda-N.md o las notas del usuario como "problema → resultado deseado">
Arregla SOLO eso. Mantén tiempos, sonidos y todo lo demás. Comprueba cada arreglo con --desde/--hasta y con fotos
antes y después del momento. Devuélveme qué cambiaste (3 líneas) y las nuevas fotos.
```

## Animador · montaje

```text
Proyecto: {{VIDEOS}}/<Proyecto>
Monta pelicula.js con las escenas <01-gancho, 02-demo, …> en este orden. Reutiliza su código, no lo redibujes.
Traspasos: <forma compartida entre cada par>. Música: <archivo de kit/audio y su subida según AUDIO.json>; la subida
debe caer en <el momento de la prueba>. Recorta escenas solo por pulsos enteros; nunca estires el tiempo.
Texto nunca por debajo de 28 px; la interfaz en foco ocupa al menos la mitad del ancho.
Renderiza borrador del 16:9, revisa y devuélveme el mapa de pulsos con la subida marcada.
```

## Crítico · una escena o el vídeo final

```text
Proyecto: {{VIDEOS}}/<Proyecto>
Qué revisar: <escenas/<NN-nombre>/escena.js (renderiza tú el borrador) | ruta al MP4>
Ronda: <N> · formatos a comprobar: <16:9, 9:16>
Momentos rápidos para tiras: <segundos, si los sabes>
Escribe revision/<NN-nombre|pelicula>/ronda-<N>.md y devuélveme puntuaciones, si aprueba (todo ≥ 8) y los 3 peores
problemas con su segundo y el resultado deseado.
```
