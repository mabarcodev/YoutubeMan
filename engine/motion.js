// Librería de movimiento del estudio. Todo es función pura del tiempo:
// misma t => mismo valor, sin estado entre fotogramas. Así seek(t) puede pintar
// el fotograma 812 sin simular los 811 anteriores, y el render es idéntico en cada ejecución.
// Funciona igual en el navegador (escenas) y en Node (tests).

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, p) => a + (b - a) * p;

/** Progreso 0→1 de t dentro de la ventana [desde, hasta]. */
export const progreso = (t, desde, hasta) =>
  hasta === desde ? (t >= hasta ? 1 : 0) : clamp((t - desde) / (hasta - desde));

// Presets de muelle (rigidez k, amortiguación d). El ratio z = d / (2·√k) decide el carácter:
// z < 1 rebota, z ≈ 1 llega justo sin pasarse, z > 1 llega lento.
export const MUELLES = {
  rapido: { k: 320, d: 30 }, // botones, toggles, bordes que lideran (z≈0.84, rebote ~1 %)
  normal: { k: 170, d: 26 }, // tarjetas, contenedores, cámara (z≈1)
  pesado: { k: 90, d: 19 }, // tipografía grande, logos, objetos 3D (z≈1, más lento)
  jugueton: { k: 200, d: 12 }, // mascotas, stickers (z≈0.42, rebote visible ~23 %)
};

function resolverMuelle(muelle) {
  if (!muelle) return MUELLES.normal;
  if (typeof muelle === 'string') {
    const m = MUELLES[muelle];
    if (!m) throw new Error(`Muelle desconocido: "${muelle}". Usa ${Object.keys(MUELLES).join(', ')} o {k, d}.`);
    return m;
  }
  return muelle;
}

/**
 * Muelle amortiguado en forma cerrada, de 0 a 1, para t segundos desde su inicio.
 * Con t <= 0 devuelve 0. Acepta un preset ('rapido', 'normal'...) o {k, d}.
 */
export function spring(t, muelle) {
  if (t <= 0) return 0;
  const { k, d } = resolverMuelle(muelle);
  const w0 = Math.sqrt(k);
  const z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  if (z === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  // Sobreamortiguado: dos raíces reales negativas.
  const s = Math.sqrt(z * z - 1);
  const r1 = -w0 * (z - s);
  const r2 = -w0 * (z + s);
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

/** Valor que va de `de` a `a` con un muelle que arranca en `inicio`. */
export const springTo = (t, de, a, inicio = 0, muelle) => de + (a - de) * spring(t - inicio, muelle);

/**
 * Valor con varios destinos en el tiempo. keys: [[tiempo, valor], ...] ordenadas por tiempo.
 * Truco clave: no se reinicia el muelle en cada cambio, se SUMA un muelle por cambio.
 * El movimiento es continuo y sigue siendo función pura de t.
 */
export function track(t, keys, muelle) {
  if (!keys.length) throw new Error('track() necesita al menos una clave [tiempo, valor].');
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], muelle);
  return v;
}

/** Como track() pero para [x, y] o cualquier tupla numérica. */
export function trackN(t, keys, muelle) {
  if (!keys.length) throw new Error('trackN() necesita al menos una clave [tiempo, [valores]].');
  const n = keys[0][1].length;
  const out = new Array(n);
  for (let j = 0; j < n; j++)
    out[j] = track(
      t,
      keys.map(([tk, v]) => [tk, v[j]]),
      muelle,
    );
  return out;
}

/**
 * Zoom interpolado en espacio logarítmico: ir de 1x a 2x se siente igual de rápido que de 2x a 4x.
 * keys: [[tiempo, zoom], ...] con zoom > 0.
 */
export function logZoom(t, keys, muelle) {
  return Math.exp(
    track(
      t,
      keys.map(([tk, z]) => [tk, Math.log(z)]),
      muelle,
    ),
  );
}

/**
 * Indicador que se estira (pestañas, subrayados): el borde delantero usa un muelle más rígido
 * que el trasero. stops: [[tiempo, x], ...]. Devuelve {izq, der} sin contar el ancho propio.
 */
export function indicador(t, stops) {
  const delante = track(t, stops, { k: 320, d: 30 });
  const detras = track(t, stops, { k: 140, d: 22 });
  return { izq: Math.min(delante, detras), der: Math.max(delante, detras) };
}

/**
 * Opacidad del contenido dentro de una forma que se transforma: entra un poco después
 * de que empiece la transformación y sale antes de la siguiente.
 */
export function swapAlpha(t, tIn, tOut, { retraso = 0.08, entrada = 0.12, salida = 0.1 } = {}) {
  return Math.min(clamp((t - tIn - retraso) / entrada), clamp((tOut - salida - t) / salida));
}

/** Tiempo en bucle: loopT(t, dur) siempre en [0, dur). */
export const loopT = (t, dur) => ((t % dur) + dur) % dur;

/** Retardo escalonado para el elemento i de una serie. */
export const stagger = (i, paso = 0.05, inicio = 0) => inicio + i * paso;

/** Generador pseudoaleatorio con semilla (mulberry32). Nunca Math.random: rompe el determinismo. */
export function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Valor fijo en [0, 1) para (semilla, índice). Útil para dar variación estable a cada elemento. */
export function hash01(seed, i = 0) {
  return rng((seed * 374761393 + i * 668265263) | 0)();
}

/** Ruido de valor 1D suave en [-1, 1], determinista. Para temblores y derivas sutiles. */
export function ruido(seed, x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash01(seed, i) * 2 - 1, hash01(seed, i + 1) * 2 - 1, u);
}

// Curvas de respaldo. Las reglas prefieren muelles; úsalas solo para cosas sin masa
// (barras de progreso lineales, fundidos de audio, opacidades técnicas).
export const ease = {
  lineal: (p) => p,
  inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  outExpo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  outCubic: (p) => 1 - Math.pow(1 - p, 3),
};

/** Interpola keyframes con curva (no muelle): keys [[t, v], ...], devuelve el valor en t. */
export function keyframes(t, keys, curva = ease.inOutCubic) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t < t1) return lerp(v0, v1, curva(progreso(t, t0, t1)));
  }
  return keys[keys.length - 1][1];
}
