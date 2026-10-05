// Piezas comunes de las escenas de la demo de Ruta (app ficticia): colores y fuentes del LOOK, lectura de
// las capturas reales, geometría de los traspasos y la maquetación de titulares en máscara.
// El gancho y el cierre construyen la frase final con la MISMA función (crearTitular + CLAIM): así el último
// fotograma de la película es idéntico al primero y el bucle no se nota.
import { clamp, lerp, spring } from '/estudio/engine/motion.js';
import { encajar } from '/estudio/engine/layout.js';
import { aplicar, crear, palabrasEnMascara } from '/estudio/engine/tecnicas.js';

// ---------- LOOK (ver LOOK.md) ----------

export const COLOR = {
  fondo: '#121418', // asfalto de noche: la interfaz clara de la app destaca sin brillos
  tinta: '#F3F4F6', // el gris claro de fondo de la app: la tarjeta aplastada sigue siendo "la app"
  suave: '#8D95A1',
  acento: '#FF5B2E', // el naranja real de la app (kit/app/index.html)
  pista: '#2A2E36', // carril vacío de la barra de distancia
};

const TITULAR = "'Manrope', system-ui, sans-serif";
const ACENTO = "'Instrument Serif', Georgia, serif";

export const FUENTES = [
  { familia: 'Manrope', url: '/kit/fuentes/manrope/Manrope-800.ttf', peso: 800 },
  { familia: 'Manrope', url: '/kit/fuentes/manrope/Manrope-600.ttf', peso: 600 },
  { familia: 'Instrument Serif', url: '/kit/fuentes/instrument-serif/InstrumentSerif-Italic.ttf', estilo: 'italic' },
];

/** La frase de marca: primer y último fotograma de la película (y miniatura del feed). */
export const CLAIM = [
  { texto: 'Reparte' },
  { texto: 'sin', junto: true },
  { texto: 'dar', junto: true },
  { texto: 'vueltas', acento: true },
];

/** Estilos de la palabra de acento: otra fuente y el color de la marca. */
export const ESTILO_ACENTO = {
  fontFamily: ACENTO,
  fontStyle: 'italic',
  fontWeight: '400',
  color: COLOR.acento,
  letterSpacing: '0',
};

/** Fuente de los números grandes: cifras de ancho fijo para que el contador no baile al cambiar. */
export const ESTILO_CIFRAS = {
  fontFamily: TITULAR,
  fontWeight: '800',
  color: COLOR.tinta,
  letterSpacing: '-0.03em',
  fontVariantNumeric: 'tabular-nums',
};

// ---------- Capturas reales ----------

let indice = null;

/**
 * Lee kit/capturas/capturas.json (lo genera kit/app/capturar.mjs): datos que enseña la app y dónde está
 * cada zona de cada captura. Una sola petición por página aunque lo pidan varias escenas.
 */
export function cargarCapturas() {
  indice ??= fetch('/kit/capturas/capturas.json').then((r) => {
    if (!r.ok) throw new Error('Faltan las capturas: ejecuta node ejemplos/demo/kit/app/capturar.mjs');
    return r.json();
  });
  return indice;
}

/** Imágenes de la demo para declarar en `imagenes`: el runtime las carga y decodifica antes de montar(). */
export const IMAGENES_CAPTURAS = {
  'escritorio-entrada': '/kit/capturas/escritorio-entrada.png',
  'escritorio-optimizada': '/kit/capturas/escritorio-optimizada.png',
  'movil-entrada': '/kit/capturas/movil-entrada.png',
  'movil-optimizada': '/kit/capturas/movil-optimizada.png',
};

/**
 * Captura que mejor llena la zona segura de este formato: escritorio en 16:9 y 1:1, móvil en 9:16 y 4:5.
 * Reencuadrar es elegir la versión de la interfaz que mejor se lee, no recortar la de escritorio.
 */
export function elegirDispositivo(datos, ctx) {
  let mejor = null;
  for (const [nombre, d] of Object.entries(datos.dispositivos)) {
    const r = encajar(ctx.zona, { w: d.ancho, h: d.alto });
    const llenado = (r.w * r.h) / (ctx.zona.w * ctx.zona.h);
    if (!mejor || llenado > mejor.llenado) mejor = { nombre, ...d, llenado };
  }
  return mejor;
}

/** Rectángulo de la tarjeta con la captura (centrado en la zona segura) y escala captura → lienzo. */
export const rectTarjeta = (ctx, disp) => encajar(ctx.zona, { w: disp.ancho, h: disp.alto });

/** Rectángulo de una zona de la captura (px CSS de la app) en coordenadas del lienzo. */
export const zonaEnTarjeta = (rect, z) => ({
  x: rect.x + z.x * rect.escala,
  y: rect.y + z.y * rect.escala,
  w: z.w * rect.escala,
  h: z.h * rect.escala,
});

/** Centro de un rectángulo. */
export const centro = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// ---------- Geometría compartida entre escenas (los traspasos dependen de ella) ----------

/** Centro de la zona segura: donde el punto del gancho se convierte en la tarjeta de la demo. */
export const centroZona = ({ zona }) => centro(zona);

/** Diámetro del punto cuando espera en el centro para convertirse en tarjeta. */
export const diametroCentro = (ctx) => 64 * ctx.u;

/** Radio de las esquinas de la tarjeta con la captura. */
export const radioTarjeta = (ctx) => 22 * ctx.u;

/** La barra de distancia del cierre: la tarjeta de la demo se aplasta hasta ser exactamente esto. */
export function geometriaBarra(ctx) {
  const { zona, u } = ctx;
  const w = Math.round(Math.min(zona.w * 0.86, 1400 * u));
  const h = Math.round(30 * u);
  return { x: Math.round(zona.x + (zona.w - w) / 2), y: Math.round(zona.y + zona.h * 0.6 - h / 2), w, h };
}

// ---------- Cámara ----------

/**
 * Vista de cámara { x, y, zoom } que encuadra `foco` (rectángulo del contenido) en el centro de la zona segura,
 * pero sin enseñar más fondo del necesario: en cada eje, si la tarjeta `rect` ampliada cubre la zona segura,
 * se corre lo justo para que su borde no entre en la zona; si no la cubre, la tarjeta queda centrada en ella.
 * Así el zoom "mira" donde trabaja el cursor y el foco nunca cae bajo la interfaz de Reels o TikTok.
 */
export function vistaFoco(foco, zoom, rect, { W, H, zona }) {
  const eje = (f, ini, largo, zIni, zLargo, mitad) => {
    // Punto del contenido que debe ir al centro del lienzo para que `valor` caiga en la posición `pantalla`.
    const centrar = (valor, pantalla) => valor - (pantalla - mitad) / zoom;
    if (largo * zoom <= zLargo) return centrar(ini + largo / 2, zIni + zLargo / 2);
    const ideal = centrar(f, zIni + zLargo / 2);
    const minimo = centrar(ini, zIni); // el borde inicial de la tarjeta, justo en el borde de la zona
    const maximo = centrar(ini + largo, zIni + zLargo);
    return clamp(ideal, minimo, maximo);
  };
  const c = centro(foco);
  return {
    x: eje(c.x, rect.x, rect.w, zona.x, zona.w, W / 2),
    y: eje(c.y, rect.y, rect.h, zona.y, zona.h, H / 2),
    zoom,
  };
}

/** Dónde cae en pantalla un punto del contenido con la cámara en `vista`. */
export const aPantalla = (p, vista, { W, H }) => ({
  x: W / 2 + (p.x - vista.x) * vista.zoom,
  y: H / 2 + (p.y - vista.y) * vista.zoom,
});

// ---------- El punto de la marca (el de "ruta●") ----------

// Se dibuja a un tamaño fijo y se escala: el círculo sigue nítido y no hay que maquetar en cada fotograma.
const BASE_PUNTO = 100;

/** El punto naranja de la marca: hilo conductor de las tres escenas. */
export const crearPunto = (padre) =>
  crear(
    'div',
    {
      left: '0',
      top: '0',
      width: `${BASE_PUNTO}px`,
      height: `${BASE_PUNTO}px`,
      borderRadius: '50%',
      background: COLOR.acento,
    },
    padre,
  );

/** Coloca el punto con su centro en (x, y) y diámetro d (0 = oculto). */
export function colocarPunto(el, { x, y }, d) {
  el.style.visibility = d > 0 ? 'visible' : 'hidden';
  aplicar(el, { x: x - BASE_PUNTO / 2, y: y - BASE_PUNTO / 2, escala: Math.max(0, d) / BASE_PUNTO });
}

/** Interpola dos puntos { x, y }. */
export const mezclar = (a, b, p) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

/** Interpola dos cajas { x, y, w, h, r } (r = radio de las esquinas): así se transforma una forma en otra. */
export const mezclarCaja = (a, b, p) => ({
  x: lerp(a.x, b.x, p),
  y: lerp(a.y, b.y, p),
  w: lerp(a.w, b.w, p),
  h: lerp(a.h, b.h, p),
  r: lerp(a.r, b.r, p),
});

/** Coloca un div absoluto en la caja { x, y, w, h, r } (en px del padre). */
export function colocarCaja(el, { x, y, w, h, r }) {
  Object.assign(el.style, {
    left: `${x}px`,
    top: `${y}px`,
    width: `${Math.max(0, w)}px`,
    height: `${Math.max(0, h)}px`,
    borderRadius: `${Math.max(0, r)}px`,
  });
}

// ---------- Movimiento ----------

/**
 * Altura de un salto en arco (0 → alto → 0) que acompaña a un muelle que arranca en `inicio`.
 * Usa el mismo muelle que el desplazamiento, así la cima cae justo a mitad de camino.
 */
export function salto(t, inicio, alto, muelle = 'normal') {
  const q = clamp(spring(t - inicio, muelle));
  return 4 * alto * q * (1 - q);
}

// ---------- Titulares ----------

const ALTO_LINEA = 1.18;

/**
 * Un solo bloque de texto en máscara (no se parte en palabras): para cifras que cambian en cada fotograma.
 * Devuelve el span interior; cambia su textContent en dibujar() y anímalo con subirDesdeMascara().
 */
export function textoEnMascara(padre, texto, estilos, opciones = {}) {
  // palabrasEnMascara parte por espacios (incluidos los de no separación): se crea con una palabra y luego
  // se pone el texto entero.
  const [span] = palabrasEnMascara(padre, 'x', { lineHeight: String(ALTO_LINEA), ...estilos }, opciones);
  span.textContent = texto;
  return span;
}

function estilosLinea(tam) {
  return {
    left: '0',
    top: '0',
    font: `800 ${tam}px ${TITULAR}`,
    color: COLOR.tinta,
    letterSpacing: '-0.025em',
    lineHeight: String(ALTO_LINEA),
  };
}

/**
 * Posición de `el` dentro de `ancestro` sumando la cadena de offsetParent. offset* mide el layout sin
 * transformaciones (vale con las palabras escondidas bajo su máscara y con la vista previa escalada), pero cada
 * medida es relativa a su offsetParent, que cambia según qué elementos estén posicionados: sumar offsetLeft de
 * elementos con el mismo offsetParent cuenta dos veces el mismo desplazamiento.
 */
function posicionEn(el, ancestro) {
  let x = 0;
  let y = 0;
  for (let n = el; n && n !== ancestro; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

// Sonda de 0×0 al final de `span`: su borde superior está en la línea base, así que da dónde acaba el texto
// (x) y la línea base (base), en coordenadas de `linea`.
function sondear(span, linea) {
  const s = crear('span', { position: 'static', display: 'inline-block', width: '0', height: '0' }, span);
  const r = posicionEn(s, linea);
  s.remove();
  return { x: r.x, base: r.y };
}

/**
 * Dónde acaba el texto (x) y dónde está su línea base (base) dentro de la línea que lo posiciona (el div que
 * crean palabrasEnMascara y textoEnMascara). Sirve para alinear por la línea base y no por la caja.
 */
export const medirEnLinea = (span) => sondear(span, span.parentElement.parentElement);

function construirLinea(padre, palabras, tam) {
  const spans = palabrasEnMascara(padre, palabras.map((p) => p.texto).join(' '), estilosLinea(tam));
  const linea = spans[0].parentElement.parentElement;
  palabras.forEach((p, i) => {
    if (!p.acento) return;
    Object.assign(spans[i].style, ESTILO_ACENTO);
    // La cursiva sobresale de su caja: margen interior para que la máscara no le corte las puntas.
    Object.assign(spans[i].parentElement.style, {
      paddingLeft: '0.08em',
      paddingRight: '0.08em',
      marginLeft: '-0.08em',
      marginRight: '-0.08em',
    });
  });
  // Cada fuente pone su línea base a una altura distinta dentro de la caja: se alinean con la primera
  // palabra normal desplazando (top relativo, no transform, que es de la animación) las de acento.
  const ref = Math.max(
    0,
    palabras.findIndex((p) => !p.acento),
  );
  const baseRef = sondear(spans[ref], linea).base;
  palabras.forEach((p, i) => {
    if (!p.acento) return;
    const d = baseRef - sondear(spans[i], linea).base;
    Object.assign(spans[i].style, { position: 'relative', top: `${d}px` });
  });
  return { linea, spans, baseRef };
}

// Todas las formas de partir n palabras en k líneas seguidas (n pequeño: titulares de 2–8 palabras).
function particiones(n, k) {
  if (k === 1) return [[n]];
  const out = [];
  for (let primera = 1; primera <= n - k + 1; primera++) {
    for (const resto of particiones(n - primera, k - 1)) out.push([primera, ...resto]);
  }
  return out;
}

// Hueco + punto tras la última palabra, en proporción al cuerpo: el punto también tiene que caber.
const PUNTO = 0.2;
const extraPunto = (tam) => Math.round(tam * PUNTO) * 1.35;

/**
 * Titular de palabras en máscara repartido en 1–3 líneas que caben en la zona segura, como bloque
 * centrado con las líneas alineadas a la izquierda. Mide en montar() (las fuentes ya están cargadas).
 *   palabras: [{ texto, acento, junto }]  ·  junto: true = nunca partir línea entre esta palabra y la siguiente
 *   tam: cuerpo deseado en unidades de ctx.u  ·  centroY: px del lienzo
 *   ancho: fracción de la zona segura que puede ocupar una línea (deja aire a los lados)
 * Devuelve { spans, mascaras, tam, cajas, finales, punto }:
 *   mascaras[i]  el elemento que recorta la palabra i (muévelo para desplazar la palabra entera)
 *   cajas[i]     { x, y, w, h } de esa máscara en el lienzo
 *   finales[i]   { x, y } del centro de un punto tipográfico tras la palabra i; punto = el de la última, con su d
 */
export function crearTitular(padre, palabras, ctx, { tam = 132, tamMax = Infinity, centroY, ancho = 0.88 } = {}) {
  const base = Math.min(tam * ctx.u, tamMax);
  const medida = construirLinea(padre, palabras, base);
  const izq = medida.spans.map((s) => posicionEn(s.parentElement, medida.linea).x);
  const der = medida.spans.map((s) => sondear(s, medida.linea).x);
  medida.linea.remove();

  const ultima = palabras.length - 1;
  const anchoGrupo = (i, j) => der[j] - izq[i] + (j === ultima ? extraPunto(base) : 0);
  let elegido = null;
  for (let k = 1; k <= Math.min(3, palabras.length); k++) {
    for (const p of particiones(palabras.length, k)) {
      let i = 0;
      let maximo = 0;
      let valida = true;
      for (const n of p) {
        maximo = Math.max(maximo, anchoGrupo(i, i + n - 1));
        i += n;
        if (i <= ultima && palabras[i - 1].junto) valida = false; // corte entre dos palabras que van juntas
      }
      if (!valida) continue;
      const escala = Math.min(1, (ctx.zona.w * ancho) / maximo, (ctx.zona.h * 0.8) / (k * base * ALTO_LINEA));
      // Menos líneas mientras el texto no tenga que encogerse más de un 8 %; si no, la que menos encoja.
      const mejor = !elegido || (escala > elegido.escala + 1e-9 && (elegido.escala < 0.92 || k === elegido.k));
      if (mejor) elegido = { k, p, escala };
    }
    if (elegido.escala >= 0.92) break;
  }

  const tamFinal = Math.round(base * elegido.escala * 2) / 2;
  const alto = tamFinal * ALTO_LINEA;
  const lineas = [];
  let i = 0;
  for (const n of elegido.p) {
    lineas.push(construirLinea(padre, palabras.slice(i, i + n), tamFinal));
    i += n;
  }
  // El punto final cuenta en el ancho del bloque: si no, el bloque se ve descentrado hacia la derecha.
  const anchos = lineas.map((l, n) => l.linea.offsetWidth + (n === lineas.length - 1 ? extraPunto(tamFinal) : 0));
  const anchoBloque = Math.max(...anchos);
  const x0 = Math.round(ctx.zona.x + (ctx.zona.w - anchoBloque) / 2);
  const cy = centroY ?? ctx.zona.y + ctx.zona.h / 2;
  const y0 = Math.round(cy - (lineas.length * alto) / 2);
  const d = Math.round(tamFinal * PUNTO);
  const spans = [];
  const mascaras = [];
  const cajas = [];
  const finales = [];
  lineas.forEach((l, n) => {
    const top = Math.round(y0 + n * alto);
    Object.assign(l.linea.style, { left: `${x0}px`, top: `${top}px` });
    l.spans.forEach((s) => {
      const m = s.parentElement;
      const pos = posicionEn(m, l.linea);
      cajas.push({ x: x0 + pos.x, y: top + pos.y, w: m.offsetWidth, h: m.offsetHeight });
      // El punto se apoya en la línea base, separado del final de la palabra lo que un punto tipográfico.
      const fin = sondear(s, l.linea).x;
      finales.push({ x: x0 + fin + d * 0.35 + d / 2, y: top + l.baseRef - d / 2 });
      spans.push(s);
      mascaras.push(m);
    });
  });
  return { spans, mascaras, tam: tamFinal, cajas, finales, punto: { ...finales[finales.length - 1], d } };
}
