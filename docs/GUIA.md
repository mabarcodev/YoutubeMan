# Guía · Tu primer vídeo con youtubeman

> [English version](GUIDE.en.md) · Instalación: [README](../README.md)

## 1. Las carpetas

```
Videos/
├── _estudio/        el estudio (este repo): no se toca para hacer vídeos
├── MiProducto/      un proyecto: su material (kit/), sus escenas y sus vídeos (salida/)
└── OtroProducto/
```

- Abre tu IA en **`Videos`** o en la carpeta del proyecto. **Nunca en el repo de tu producto**: el repo solo se lee
  (le das la ruta y youtubeman lo consulta sin tocarlo).
- Los vídeos terminados salen en `Videos/<Proyecto>/salida/`, versionados (`-v1`, `-v2`…). Nunca se borra una
  versión anterior.

## 2. Pídelo

En Claude Code escribe `/youtubeman` y lo que quieres. Cuanto más concreto, mejor:

```
/youtubeman Quiero un vídeo de lanzamiento de 20 segundos de MiProducto.
Repo: C:\ruta\a\mi-producto
Carpeta: MiProducto
Formatos: 16:9 y 9:16
Para: X y la web
Estilo: como este vídeo → https://x.com/usuario/status/123…
Música: sí
```

Si falta algo, te lo pregunta todo junto en un solo mensaje: qué es la pieza, la ruta del repo, la carpeta, la
duración, los formatos, dónde se publica, las referencias y la música.

**Cómo verá tu producto.** Necesita ver la interfaz de verdad para capturarla:

- **Web pública:** dale la URL.
- **App que se arranca en local o app instalada:** te pregunta antes de abrir nada, y nunca instala nada en tu repo
  sin permiso.
- **Datos:** si tu app tiene datos reales (clientes, ventas…), déjala en un estado limpio o de demo antes. Lo que
  salga en las capturas, sale en el vídeo.

## 3. Aprueba en cada paso

youtubeman se para cuatro veces y espera tu «sí»:

1. **Historia y estilo:** el problema, las funciones que se enseñan, el dato que lo demuestra, la frase final y la
   ficha de estilo (`LOOK.md`).
2. **Guion:** qué pasa en cada momento, al ritmo de la música.
3. **Escenas:** te enseña las hojas de contactos y una vista previa.
4. **Vídeo final:** míralo **y escúchalo**. La IA no oye: el sonido lo validas tú.

**Cómo pedir cambios:** di qué falla y qué quieres, no cómo arreglarlo. Por ejemplo: «a los 9 s no se lee el precio
→ que se lea en el móvil». Junta todas tus notas en un solo mensaje: cada ronda de cambios gasta tokens.

## 4. Referencias de estilo

Una referencia es un vídeo cuyo **estilo** te gusta. youtubeman copia su gramática (ritmo, tipografía, color,
transiciones, cómo entra el texto), **nunca** su contenido, sus logos ni sus personajes.

**Cómo dárselas:**

- Un enlace a un post de X (`https://x.com/<usuario>/status/<id>`), una URL directa a un `.mp4` o un archivo de vídeo.
- De YouTube, Instagram, TikTok u otras webs no se descarga solo: baja el vídeo tú y pasa el archivo.
- Capturas o imágenes, si no hay vídeo.
- Pégalas en tu petición o cuando te pregunte por el estilo.

**Cómo deben ser para que sirvan:**

- **De 1 a 3.** Más referencias diluyen el estilo.
- **Del mismo tipo de pieza** que quieres: si haces una demo de producto de 20 s, otra demo de producto, no un
  videoclip.
- **Cortas y con un estilo claro:** 10–60 s, con una idea visual reconocible (tipografía grande, cámara que entra en
  la interfaz, colores planos…).
- **Que sepas qué te gusta de cada una:** «el ritmo», «cómo aparece el texto», «los colores». Díselo y lo prioriza.

**Qué hace con ellas:** `tools/referencia.mjs` descarga el vídeo y saca fotogramas y una hoja de contactos en
`<Proyecto>/kit/referencias/<nombre>/`. A partir de ahí se escribe un `estilo.md` (paleta, tipografías, duración de
planos, transiciones, cámara, textura y entrada del texto) y eso se lleva a tu `LOOK.md`, que apruebas tú.

Sin referencias también funciona: propone un estilo a partir de la marca real de tu producto.

## 5. Música y sonido

- Por defecto busca **música y efectos reales con licencia comercial** (por ejemplo Mixkit), los mide (BPM, golpes y
  subida) y coloca el momento clave del vídeo en la subida de la música.
- Si tienes tu propia pista con licencia, ponla en `<Proyecto>/kit/audio/` y díselo.
- La licencia de cada pista queda anotada en el inventario del proyecto.

## 6. Formatos

| Formato  | Tamaño      | Para                                             |
| -------- | ----------- | ------------------------------------------------ |
| **16:9** | 1920 × 1080 | YouTube, X, LinkedIn, tu web                     |
| **9:16** | 1080 × 1920 | Instagram Reels, Stories, TikTok, YouTube Shorts |
| **1:1**  | 1080 × 1080 | Feed de Instagram, X, LinkedIn, Facebook         |
| **4:5**  | 1080 × 1350 | Posts de Instagram (imagen, carrusel o vídeo)    |

Con **16:9 + 9:16** cubres casi todo. Cada formato se reencuadra, no se recorta.

**Imágenes y carruseles:**

```
/youtubeman Quiero un carrusel de 5 imágenes en 4:5 para Instagram sobre <tema>. Carpeta: MiProducto
```

## 7. Al publicar

- El **primer fotograma es la miniatura**: tiene que decir el gancho con palabras.
- Funciona **sin sonido**: lo importante va escrito en pantalla.
- El texto del post gira alrededor de **la prueba** (lo que tu producto hace mejor), no de «presentamos X 1.0».
- El enlace a tu web, en la primera respuesta, no dentro del vídeo.

## 8. Consumo y cómo gastar menos

Un vídeo de unos 30 s, de principio a fin, gasta aproximadamente **entre 1 y 1,5 millones de tokens** en Claude
Code. Para gastar menos:

- **Escenas:** en vídeos cortos, pide un solo animador para todo el vídeo en lugar de uno por escena.
- **Cambios:** junta todas tus notas en una sola ronda.
- **Retoques pequeños** (un tamaño, un color, un tiempo): pide que los haga el director directamente, sin relanzar
  al animador.
- **Calidad:** usa los borradores para revisar y deja el render final para el final.

## 9. Sin Claude Code

El estudio no depende de ninguna IA. Con otra (Codex, Gemini, Cursor…), dale como instrucciones:

- `claude/skills/youtubeman/SKILL.md`: el proceso completo y los puntos de control.
- `claude/skills/youtubeman/encargos.md` y `claude/agents/*.md`: qué hace cada especialista (explorador, animador,
  crítico).
- `REGLAS.md` y `docs/CONTRATO-ESCENA.md`: las reglas de los vídeos y cómo se escribe una escena.

En esos documentos, `{{ESTUDIO}}` es la ruta de tu carpeta `_estudio` y `{{VIDEOS}}`, la de tu carpeta `Videos`.
El proyecto de ejemplo `ejemplos/demo` sirve de modelo.

## 10. Si algo falla

Primero, siempre: `npm run doctor` dentro de `_estudio` (o pídeselo a tu IA). Dice qué falta y cómo arreglarlo. Más
soluciones: [RUNBOOK.md](RUNBOOK.md).
