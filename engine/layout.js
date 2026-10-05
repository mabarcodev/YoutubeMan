// Formatos de salida y zonas seguras. Las escenas se escriben contra estas funciones,
// no contra píxeles fijos, para poder REENCUADRAR cada formato desde la misma línea de tiempo
// (nunca recortar un 16:9 para sacar un vertical).

export const FORMATOS = {
  '16:9': { w: 1920, h: 1080, nombre: 'horizontal', usos: 'X, YouTube, web' },
  '9:16': { w: 1080, h: 1920, nombre: 'vertical', usos: 'Reels, TikTok, Shorts, stories' },
  '1:1': { w: 1080, h: 1080, nombre: 'cuadrado', usos: 'feed de X, LinkedIn, Instagram' },
  '4:5': { w: 1080, h: 1350, nombre: 'post', usos: 'posts de Instagram/LinkedIn (imagen o carrusel)' },
};

const ALIAS = {
  horizontal: '16:9',
  youtube: '16:9',
  vertical: '9:16',
  reel: '9:16',
  reels: '9:16',
  short: '9:16',
  shorts: '9:16',
  tiktok: '9:16',
  cuadrado: '1:1',
  post: '4:5',
};

/** Acepta '16:9', '16x9', 'vertical', 'reels'... y devuelve la clave canónica ('16:9'). */
export function normalizarFormato(entrada = '16:9') {
  const s = String(entrada).trim().toLowerCase().replace('x', ':');
  // Object.hasOwn: "constructor" o "__proto__" existen en cualquier objeto y no son formatos.
  const clave = Object.hasOwn(FORMATOS, s) ? s : Object.hasOwn(ALIAS, s) ? ALIAS[s] : null;
  if (!clave) throw new Error(`Formato desconocido: "${entrada}". Usa ${Object.keys(FORMATOS).join(', ')}.`);
  return clave;
}

export function formato(entrada) {
  const clave = normalizarFormato(entrada);
  return { clave, ...FORMATOS[clave] };
}

export function orientacion({ w, h }) {
  if (w > h) return 'horizontal';
  if (h > w) return 'vertical';
  return 'cuadrado';
}

/**
 * Unidad de escala: 1 en un lienzo cuyo lado corto mide 1080 px.
 * Escribe tamaños como `48 * u` y el texto mantiene su peso en todos los formatos.
 */
export const unidad = ({ w, h }) => Math.min(w, h) / 1080;

/**
 * Márgenes que no debe pisar el texto importante. En vertical, la interfaz de Reels/TikTok
 * tapa la parte de abajo (descripción, botones) y el lateral derecho (iconos).
 */
export function zonaSegura(entrada) {
  const { clave, w, h } = formato(entrada);
  const m =
    clave === '9:16'
      ? { arriba: 200, derecha: 140, abajo: 380, izquierda: 64 }
      : clave === '16:9'
        ? { arriba: 80, derecha: 96, abajo: 80, izquierda: 96 }
        : { arriba: 72, derecha: 72, abajo: 72, izquierda: 72 };
  return { ...m, x: m.izquierda, y: m.arriba, w: w - m.izquierda - m.derecha, h: h - m.arriba - m.abajo };
}

/**
 * Encaja una caja (w×h) dentro de un contenedor, como object-fit.
 * modo 'contain' cabe entera; 'cover' llena el contenedor y recorta lo que sobre.
 */
export function encajar(cont, caja, modo = 'contain') {
  const sx = cont.w / caja.w;
  const sy = cont.h / caja.h;
  const s = modo === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  const w = caja.w * s;
  const h = caja.h * s;
  return { x: (cont.x ?? 0) + (cont.w - w) / 2, y: (cont.y ?? 0) + (cont.h - h) / 2, w, h, escala: s };
}

/** Tamaño mínimo de texto legible en móvil (px en lienzo de 1080 de lado corto). */
export const TEXTO_MINIMO = 28;
