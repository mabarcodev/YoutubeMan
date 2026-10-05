// Técnicas reutilizables para escenas en DOM. Cada función que pinta recibe ya el valor
// calculado para el instante t (progreso, posición...), nunca guarda estado entre fotogramas.

/** Crea un elemento posicionado en absoluto con estilos y lo añade al padre. */
export function crear(tag, estilos = {}, padre = null, attrs = {}) {
  const el = document.createElement(tag);
  Object.assign(el.style, { position: 'absolute', ...estilos });
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'texto') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  if (padre) padre.appendChild(el);
  return el;
}

/** Cadena CSS transform a partir de valores sueltos. Orden fijo: mover, rotar, escalar. */
export function transformar({ x = 0, y = 0, escala = 1, escalaX, escalaY, rot = 0 } = {}) {
  const sx = escalaX ?? escala;
  const sy = escalaY ?? escala;
  return `translate(${redondear(x)}px, ${redondear(y)}px) rotate(${redondear(rot)}deg) scale(${redondear(sx)}, ${redondear(sy)})`;
}

/** Aplica posición/escala/rotación/opacidad de una vez. */
export function aplicar(el, { opacidad, ...t } = {}) {
  el.style.transform = transformar(t);
  if (opacidad !== undefined) el.style.opacity = String(redondear(opacidad));
}

// Redondeo a 4 decimales: evita diferencias de coma flotante entre ejecuciones en el CSS.
const redondear = (v) => Math.round(v * 1e4) / 1e4;

/**
 * Texto que sube desde una línea invisible (máscara), palabra a palabra.
 * Devuelve los spans interiores: anima cada uno con subirDesdeMascara(span, progreso).
 */
export function palabrasEnMascara(
  padre,
  texto,
  estilos = {},
  { claseAcento, acentos = [], holgura = HOLGURA_MASCARA } = {},
) {
  const linea = crear('div', { whiteSpace: 'nowrap', ...estilos }, padre);
  const palabras = texto.split(/\s+/).filter(Boolean);
  return palabras.map((palabra, i) => {
    const mascara = document.createElement('span');
    // Hueco de `holgura` em por arriba (tildes de las mayúsculas) y por abajo (descendentes: g, p, y),
    // compensado con márgenes negativos para que la línea no crezca. Sin él, con interlineados apretados
    // (1 o 0.9, habituales en titulares) la máscara corta las letras.
    Object.assign(mascara.style, {
      display: 'inline-block',
      overflow: 'hidden',
      verticalAlign: 'bottom',
      paddingTop: `${holgura}em`,
      marginTop: `-${holgura}em`,
      paddingBottom: `${holgura}em`,
      marginBottom: `-${holgura}em`,
    });
    const interior = document.createElement('span');
    interior.textContent = palabra;
    Object.assign(interior.style, { display: 'inline-block' });
    HOLGURAS.set(interior, holgura);
    subirDesdeMascara(interior, 0);
    if (acentos.includes(i) && claseAcento) interior.className = claseAcento;
    mascara.appendChild(interior);
    linea.appendChild(mascara);
    if (i < palabras.length - 1) linea.appendChild(document.createTextNode(' '));
    return interior;
  });
}

// Holgura de la máscara (em) por encima y por debajo de la línea. 0.35 deja sitio a tildes y descendentes
// con cualquier interlineado; una escena con algo justo debajo del texto (una barra) puede pedir menos para
// que la palabra no se vea pasar por encima. Cada palabra recuerda la suya para saber cuánto bajar.
export const HOLGURA_MASCARA = 0.35;
const HOLGURAS = new WeakMap();

/**
 * p = 0 escondida bajo la línea, p = 1 en su sitio (con muelle puede pasarse un poco).
 * Baja su propio alto más dos holguras y un poco: así ni las tildes que sobresalen por arriba
 * asoman por el hueco de abajo de la máscara.
 */
export function subirDesdeMascara(span, p) {
  const q = 1 - p;
  const holgura = HOLGURAS.get(span) ?? HOLGURA_MASCARA;
  span.style.transform = `translateY(calc(${redondear(q * 100)}% + ${redondear(q * (2 * holgura + 0.05))}em))`;
}

const FLECHA_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%">' +
  '<path d="M4 2.5 L4 19.5 L8.6 15.2 L11.6 21.6 L14.6 20.2 L11.7 13.9 L18 13.9 Z" ' +
  'fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/** Cursor de ratón (flecha). La punta está en la esquina superior izquierda del elemento. */
export function crearCursor(padre, { tam = 44 } = {}) {
  return crear(
    'div',
    {
      left: '0',
      top: '0',
      width: `${tam}px`,
      height: `${tam}px`,
      transformOrigin: '0 0',
      zIndex: '1000',
      filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.25))',
    },
    padre,
    {
      html: FLECHA_SVG,
    },
  );
}

/** Coloca el cursor. pulsado (0..1) lo encoge un poco, como al hacer clic. */
export function colocarCursor(cursor, x, y, { escala = 1, pulsado = 0, opacidad = 1 } = {}) {
  aplicar(cursor, { x, y, escala: escala * (1 - 0.14 * pulsado), opacidad });
}

/** Forma de un clic en el tiempo: 0 → 1 → 0 en `dur` segundos alrededor de tClic. */
export function pulsoClic(t, tClic, dur = 0.16) {
  const p = (t - tClic) / dur;
  if (p <= 0 || p >= 1) return 0;
  return Math.sin(Math.PI * p);
}

/**
 * Transform de cámara: centra el punto (x, y) del contenido en el lienzo con el zoom dado.
 * Úsalo en UN solo contenedor (con transform-origin 0 0) y anima x, y con track() y zoom con logZoom().
 */
export function transformCamara({ x, y, zoom = 1 }, { W, H }) {
  return `translate(${redondear(W / 2)}px, ${redondear(H / 2)}px) scale(${redondear(zoom)}) translate(${redondear(-x)}px, ${redondear(-y)}px)`;
}

export function camara(contenedor, vista, ctx) {
  contenedor.style.transformOrigin = '0 0';
  contenedor.style.transform = transformCamara(vista, ctx);
}

/**
 * Formatea números para contadores. Nunca muestra "-0" ni "-0,00" por culpa del redondeo.
 * opciones: { decimales, moneda: 'EUR', locale: 'es-ES', prefijo, sufijo }
 */
export function formatearNumero(v, { decimales = 0, moneda, locale = 'es-ES', prefijo = '', sufijo = '' } = {}) {
  const umbral = 0.5 * Math.pow(10, -decimales);
  const limpio = Math.abs(v) < umbral ? 0 : v;
  const fmt = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    ...(moneda ? { style: 'currency', currency: moneda } : {}),
  });
  return `${prefijo}${fmt.format(limpio)}${sufijo}`;
}
