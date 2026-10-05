// Montaje: une escenas en una sola línea de tiempo con un solo reloj.
// Una secuencia cumple el mismo contrato que una escena (duracion, montar, dibujar, sonidos...),
// así que puede renderizarse, revisarse o meterse dentro de otra secuencia.

/** Resuelve valores que pueden ser fijos o depender del contexto (p. ej. de los pulsos). */
export const valor = (x, ctx) => (typeof x === 'function' ? x(ctx) : x);

/**
 * Normaliza las entradas y calcula tiempos. entradas: [[escena, inicio], ...] o
 * [{ escena, inicio }, ...]; inicio puede ser número o función(ctx).
 */
export function planificar(entradas, ctx = {}) {
  if (!entradas.length) throw new Error('La secuencia no tiene escenas.');
  const items = entradas.map((e, i) => {
    const [escena, inicio] = Array.isArray(e) ? e : [e.escena, e.inicio];
    if (!escena || typeof escena.dibujar !== 'function') {
      throw new Error(`La entrada ${i} de la secuencia no es una escena válida (falta dibujar).`);
    }
    const ini = valor(inicio ?? 0, ctx);
    const dur = valor(escena.duracion, ctx);
    if (!(dur > 0)) throw new Error(`La escena "${escena.nombre ?? i}" necesita duracion > 0.`);
    return { escena, indice: i, inicio: ini, fin: ini + dur, duracion: dur };
  });
  const duracion = Math.max(...items.map((it) => it.fin));
  return { items, duracion };
}

/**
 * Escenas visibles en t. Las que se solapan se ven a la vez (traspasos con forma compartida).
 * En el último instante sigue visible lo que acaba justo ahí, para que t = duracion pinte algo.
 */
export function activasEn(plan, t) {
  return plan.items.filter((it) => t >= it.inicio && (t < it.fin || (t === plan.duracion && it.fin === plan.duracion)));
}

/** Sonidos de todas las escenas desplazados a su inicio, ordenados por tiempo. */
export function sonidosDe(plan, ctx = {}) {
  return plan.items
    .flatMap((it) => (valor(it.escena.sonidos, ctx) ?? []).map((s) => ({ ...s, t: s.t + it.inicio })))
    .sort((a, b) => a.t - b.t);
}

/** Une las fuentes de varias escenas sin duplicados. */
export function unirFuentes(escenas) {
  const vistas = new Map();
  for (const e of escenas) {
    for (const f of e.fuentes ?? []) vistas.set(`${f.familia}|${f.peso ?? 400}|${f.estilo ?? 'normal'}|${f.url}`, f);
  }
  return [...vistas.values()];
}

/** Une los mapas de imágenes con claves prefijadas por escena, para cargarlas todas de una vez. */
export function unirImagenes(escenas) {
  const out = {};
  escenas.forEach((e, i) => {
    for (const [k, url] of Object.entries(e.imagenes ?? {})) out[`${i}:${k}`] = url;
  });
  return out;
}

/** Mapa nombre → imagen cargada para una escena concreta, a partir de la caché por URL. */
export function imagenesDe(escena, cache) {
  const out = {};
  for (const [k, url] of Object.entries(escena.imagenes ?? {})) out[k] = cache.get(url);
  return out;
}

/**
 * Crea una película a partir de escenas con inicio explícito.
 *   secuencia([[gancho, 0], [demo, (c) => c.tempo.beat(12)]], { musica: {...} })
 */
export function secuencia(entradas, { nombre = 'pelicula', fondo, musica = null, sonidos = [] } = {}) {
  const escenas = entradas.map((e) => (Array.isArray(e) ? e[0] : e.escena));
  let capas = [];
  return {
    nombre,
    fondo,
    musica,
    fuentes: unirFuentes(escenas),
    imagenes: unirImagenes(escenas),
    duracion: (ctx) => planificar(entradas, ctx).duracion,
    sonidos: (ctx) => [...sonidosDe(planificar(entradas, ctx), ctx), ...valor(sonidos, ctx)].sort((a, b) => a.t - b.t),
    async montar(escenario, ctx) {
      const plan = planificar(entradas, ctx);
      capas = [];
      for (const it of plan.items) {
        const capa = document.createElement('div');
        capa.dataset.escena = it.escena.nombre ?? String(it.indice);
        Object.assign(capa.style, { position: 'absolute', inset: '0', overflow: 'hidden', zIndex: String(it.indice) });
        if (it.escena.fondo) capa.style.background = it.escena.fondo;
        escenario.appendChild(capa);
        const ctxHijo = { ...ctx, img: imagenesDe(it.escena, ctx.cache ?? new Map()), inicioGlobal: it.inicio };
        await it.escena.montar?.(capa, ctxHijo);
        capas.push({ it, capa, ctxHijo });
      }
    },
    dibujar(t, ctx) {
      const plan = planificar(entradas, ctx);
      const activas = new Set(activasEn(plan, t).map((it) => it.indice));
      for (const { it, capa, ctxHijo } of capas) {
        const visible = activas.has(it.indice);
        capa.style.display = visible ? 'block' : 'none';
        if (visible) it.escena.dibujar(t - it.inicio, ctxHijo);
      }
    },
  };
}

/** Atajo: escenas una detrás de otra, con un solape opcional (segundos) para los traspasos. */
export function encadenar(escenas, opciones = {}) {
  const { solape = 0, ...resto } = opciones;
  const entradas = escenas.map((escena, i) => [escena, (ctx) => inicioEncadenado(escenas, i, solape, ctx)]);
  return secuencia(entradas, resto);
}

/** Inicio de la escena i cuando cada una empieza `solape` segundos antes de que acabe la anterior. */
export function inicioEncadenado(escenas, i, solape, ctx) {
  let t = 0;
  for (let j = 0; j < i; j++) t += valor(escenas[j].duracion, ctx) - solape;
  return t;
}
