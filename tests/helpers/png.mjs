// Lector mínimo de PNG para comprobar píxeles de las capturas sin dependencias externas.
// Cubre lo que generan Chromium y ffmpeg: 8 bits, sin entrelazado, en gris, gris+alfa, RGB o RGBA.

import zlib from 'node:zlib';

const FIRMA = '89504e470d0a1a0a';
const CANALES = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** Decodifica un PNG a { ancho, alto, canales, datos } (datos: bytes por fila, sin filtros). */
export function leerPNG(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== FIRMA) throw new Error('No es un PNG.');
  let pos = 8;
  let cabecera = null;
  const idat = [];
  while (pos + 8 <= buffer.length) {
    const largo = buffer.readUInt32BE(pos);
    const tipo = buffer.toString('ascii', pos + 4, pos + 8);
    const datos = buffer.subarray(pos + 8, pos + 8 + largo);
    if (tipo === 'IHDR') {
      cabecera = {
        ancho: datos.readUInt32BE(0),
        alto: datos.readUInt32BE(4),
        bits: datos[8],
        tipoColor: datos[9],
        entrelazado: datos[12],
      };
    } else if (tipo === 'IDAT') idat.push(datos);
    else if (tipo === 'IEND') break;
    pos += 12 + largo; // largo + tipo + datos + CRC
  }
  if (!cabecera) throw new Error('PNG sin cabecera IHDR.');
  const canales = CANALES[cabecera.tipoColor];
  if (cabecera.bits !== 8 || !canales || cabecera.entrelazado) {
    throw new Error(
      `PNG no soportado por el lector de tests (bits ${cabecera.bits}, color ${cabecera.tipoColor}, ` +
        `entrelazado ${cabecera.entrelazado}).`,
    );
  }
  const crudo = zlib.inflateSync(Buffer.concat(idat));
  const fila = cabecera.ancho * canales;
  const datos = new Uint8Array(fila * cabecera.alto);
  for (let y = 0; y < cabecera.alto; y++) {
    const filtro = crudo[y * (fila + 1)];
    const ini = y * (fila + 1) + 1;
    for (let x = 0; x < fila; x++) {
      const a = x >= canales ? datos[y * fila + x - canales] : 0;
      const b = y > 0 ? datos[(y - 1) * fila + x] : 0;
      const c = x >= canales && y > 0 ? datos[(y - 1) * fila + x - canales] : 0;
      datos[y * fila + x] = (crudo[ini + x] + prediccion(filtro, a, b, c)) & 0xff;
    }
  }
  return { ancho: cabecera.ancho, alto: cabecera.alto, canales, datos };
}

function prediccion(filtro, a, b, c) {
  switch (filtro) {
    case 0:
      return 0;
    case 1:
      return a;
    case 2:
      return b;
    case 3:
      return (a + b) >> 1;
    case 4: {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      if (pa <= pb && pa <= pc) return a;
      return pb <= pc ? b : c;
    }
    default:
      throw new Error(`Filtro de fila PNG desconocido: ${filtro}`);
  }
}

/** Color [r, g, b] del píxel (x, y). En gris repite el valor en los tres canales. */
export function colorEn(img, x, y) {
  const i = (y * img.ancho + x) * img.canales;
  const d = img.datos;
  return img.canales >= 3 ? [d[i], d[i + 1], d[i + 2]] : [d[i], d[i], d[i]];
}

/** '#0B8F63' → [11, 143, 99] */
export const hexARgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** true si dos colores [r, g, b] se parecen dentro de una tolerancia por canal. */
export const parecido = (a, b, tolerancia = 16) => a.every((v, k) => Math.abs(v - b[k]) <= tolerancia);

/** Cuántos píxeles de un rectángulo (por defecto, toda la imagen) se parecen a un color. */
export function contarColor(img, color, { tolerancia = 16, x0 = 0, y0 = 0, x1 = img.ancho, y1 = img.alto } = {}) {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (parecido(colorEn(img, x, y), color, tolerancia)) n++;
  return n;
}

/**
 * Caja que envuelve los píxeles de un rectángulo (por defecto, toda la imagen) que cumplen `cumple([r, g, b])`.
 * Devuelve { n, x0, y0, x1, y1 } con los bordes incluidos, o { n: 0 } si no hay ninguno.
 * Sirve para medir dónde ha quedado algo y de qué tamaño, no solo si está.
 */
export function caja(img, cumple, { x0 = 0, y0 = 0, x1 = img.ancho, y1 = img.alto } = {}) {
  const c = { n: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let y = Math.max(0, y0); y < Math.min(img.alto, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(img.ancho, x1); x++) {
      if (!cumple(colorEn(img, x, y))) continue;
      c.n++;
      c.x0 = Math.min(c.x0, x);
      c.y0 = Math.min(c.y0, y);
      c.x1 = Math.max(c.x1, x);
      c.y1 = Math.max(c.y1, y);
    }
  }
  return c.n ? c : { n: 0 };
}
