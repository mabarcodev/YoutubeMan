#!/usr/bin/env node
// Prepara un vídeo de referencia para copiar su ESTILO, nunca su contenido: lo descarga (o lo copia), saca un
// fotograma cada --cada segundos, una hoja de contactos con la marca de tiempo y unas medidas aproximadas
// (paleta y cortes de plano), para que estilo.md se escriba sobre datos y no de memoria.
//
//   node tools/referencia.mjs https://x.com/<usuario>/status/<id> --salida "<proyecto>\kit\referencias\<nombre>"
//   node tools/referencia.mjs "D:\Descargas\anuncio.mp4" --salida … --cada 0.25
//
// Deja en la carpeta: video.mp4 · fotogramas/f_0001.png… · contacto.png · info.json

import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { leerArgs } from './lib/args.mjs';
import { ffmpeg, info } from './lib/ffmpeg.mjs';
import { diferenciaMedia } from './lib/saltos.mjs';
import { esPrincipal } from './lib/rutas.mjs';
import { filtroMarcaTiempo, filas } from './revisar.mjs';
import { aNumero, tamanoPNG, traducirErrorArgs } from './capturar.mjs';

export const AYUDA = `Uso: node tools/referencia.mjs <archivo|url> --salida <carpeta> [--cada 0.5] [--ancho 960]

Prepara un vídeo de referencia para copiar su ESTILO (nunca su contenido).

  <archivo|url>     vídeo local, URL directa a un .mp4 o post de X/Twitter (x.com/<usuario>/status/<id>)
  --salida <dir>    carpeta de trabajo (se crea). Deja video.mp4, fotogramas/f_0001.png…, contacto.png
                    (hoja de contactos con la marca de tiempo) e info.json (medidas, paleta y cortes)
  --cada 0.5        segundos entre fotogramas: f_0001 es el segundo 0 y f_000N, el (N-1)·cada
  --ancho 960       ancho de los fotogramas en px (un vídeo más pequeño no se amplía)
  --video 1         qué vídeo del post, si tiene varios
  --ayuda           esta ayuda`;

export const API_FXTWITTER = 'https://api.fxtwitter.com/status/';
const AGENTE = 'youtubeman-estudio/0.1 (referencias de estilo)';
const LIMITE_API = 30_000;
const LIMITE_DESCARGA = 10 * 60_000;
// Más fotogramas que esto es casi siempre un --cada equivocado (a 960 px serían más de 1 GB de PNG).
const MAX_FOTOGRAMAS = 2000;
// Con más miniaturas, la hoja de contactos deja de leerse de un vistazo: se espacian.
const MAX_MINIATURAS = 48;
const FOTOGRAMA = /^f_\d+\.png$/;
const HOSTS_X = /^(?:www\.|mobile\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx|fixvx)\.com$/i;
const EXT_VIDEO = /\.(mp4|m4v|mov|webm|mkv)$/i;

const redondear = (v, decimales = 3) => Math.round(v * 10 ** decimales) / 10 ** decimales;
const mcd = (a, b) => (b ? mcd(b, a % b) : a);

export function leerOpciones(argv) {
  let leidos;
  try {
    leidos = leerArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        salida: { type: 'string', short: 'o' },
        cada: { type: 'string' },
        ancho: { type: 'string' },
        video: { type: 'string' },
        ayuda: { type: 'boolean', short: 'h' },
      },
    });
  } catch (e) {
    throw new Error(`${traducirErrorArgs(e)} Usa --ayuda para ver las opciones.`, { cause: e });
  }
  const { values: v, positionals } = leidos;
  if (v.ayuda) return { ayuda: true };
  if (!positionals.length) {
    throw new Error('Falta el vídeo: un archivo, una URL directa a un .mp4 o un post de X. Usa --ayuda.');
  }
  if (positionals.length > 1) {
    throw new Error(
      `Sobran argumentos: ${positionals.slice(1).join(' ')}. Si una ruta lleva espacios, ponla entre comillas.`,
    );
  }
  if (!v.salida) throw new Error('Falta --salida <carpeta> (por ejemplo, <proyecto>\\kit\\referencias\\<nombre>).');
  const cada = aNumero(v.cada ?? 0.5);
  if (!Number.isFinite(cada) || cada < 0.01 || cada > 60) {
    throw new Error(`--cada son los segundos entre fotogramas, entre 0.01 y 60 (me llega "${v.cada}").`);
  }
  const ancho = aNumero(v.ancho ?? 960);
  if (!Number.isInteger(ancho) || ancho < 64 || ancho > 7680) {
    throw new Error(`--ancho es un entero de píxeles entre 64 y 7680 (me llega "${v.ancho}").`);
  }
  const video = aNumero(v.video ?? 1);
  if (!Number.isInteger(video) || video < 1) {
    throw new Error(`--video es el número del vídeo dentro del post: 1, 2… (me llega "${v.video}").`);
  }
  return { entrada: positionals[0], salida: path.resolve(v.salida), cada, ancho, video };
}

// ---------- Entrada: archivo, URL directa o post de X ----------

/**
 * Usuario e id de un post de X/Twitter (x.com, twitter.com, mobile., fxtwitter…, con o sin https://,
 * con ?s=20 o /video/1 detrás). null si no es un post. Los enlaces /i/status/<id> no dicen el usuario.
 */
export function idTweet(url) {
  let u;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(String(url)) ? String(url) : `https://${url}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || !HOSTS_X.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/(?:i(?:\/web)?|([A-Za-z0-9_]{1,15}))\/status(?:es)?\/(\d{1,25})(?:\/|$)/);
  return m ? { usuario: m[1] ?? null, id: m[2] } : null;
}

/** true si la URL apunta directamente a un archivo de vídeo (…/clip.mp4?tag=12), no a una página. */
export function esURLVideoDirecto(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return /^https?:$/.test(u.protocol) && !idTweet(url) && EXT_VIDEO.test(u.pathname);
}

/**
 * Qué es lo que ha pasado el usuario: { tipo: 'tweet', usuario, id } · { tipo: 'url', url } (vídeo directo) ·
 * { tipo: 'web', url } (otra URL: se comprobará que responde con un vídeo) · { tipo: 'archivo', ruta }.
 */
export function clasificarEntrada(entrada, { base = process.cwd(), existe = fs.existsSync } = {}) {
  const e = String(entrada ?? '').trim();
  if (!e) throw new Error('Falta el vídeo: un archivo, una URL directa a un .mp4 o un post de X.');
  const tweet = idTweet(e);
  if (tweet) return { tipo: 'tweet', ...tweet };
  if (/^https?:\/\//i.test(e)) return { tipo: esURLVideoDirecto(e) ? 'url' : 'web', url: e };
  const ruta = path.resolve(base, e);
  if (!existe(ruta)) throw new Error(`No existe el archivo ${ruta}.`);
  return { tipo: 'archivo', ruta };
}

/** Medios de vídeo o GIF animado de tweet.media (fxtwitter), de una lista de medios o de un solo medio. */
export function videosDe(media) {
  if (!media || typeof media !== 'object') return [];
  const lista = Array.isArray(media)
    ? media
    : (media.all ?? media.videos ?? (media.url || media.variants ? [media] : []));
  return lista.filter(
    (m) => m && (m.type === 'video' || m.type === 'gif' || (!m.type && (m.variants || m.formats || m.url))),
  );
}

/** Tamaño que X escribe en la ruta de cada variante (…/vid/avc1/1280x720/…). */
export function tamanoEnURL(url) {
  const m = String(url ?? '').match(/\/(\d{2,5})x(\d{2,5})\//);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * URL del MP4 de mayor resolución (a igualdad, más bitrate) del vídeo número `indice` (0 = el primero).
 * fxtwitter da las variantes en `variants` (content_type) y en `formats` (container), más `url` (la mejor);
 * las listas HLS (.m3u8) se descartan porque no son un archivo descargable de una vez.
 */
export function elegirVariante(media, indice = 0) {
  const item = videosDe(media)[indice];
  if (!item) return null;
  const candidatos = [];
  const anadir = (url, { tipo, w, h, bitrate }) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
    if (!(tipo ? /mp4/i.test(tipo) : /\.mp4(?:$|[?#])/i.test(url))) return;
    const [aw, ah] = tamanoEnURL(url) ?? [w, h];
    candidatos.push({ url, px: (Number(aw) || 0) * (Number(ah) || 0), bitrate: Number(bitrate) || 0 });
  };
  const tam = (v) => ({ w: v.width ?? item.width, h: v.height ?? item.height, bitrate: v.bitrate });
  for (const v of item.variants ?? []) anadir(v.url, { tipo: v.content_type ?? v.contentType, ...tam(v) });
  for (const f of item.formats ?? []) anadir(f.url, { tipo: f.container, ...tam(f) });
  anadir(item.url, { tipo: item.format, w: item.width, h: item.height });
  candidatos.sort((a, b) => b.px - a.px || b.bitrate - a.bitrate);
  return candidatos[0]?.url ?? null;
}

// ---------- Fotogramas y hoja de contactos ----------

/** 1/cada como fracción exacta para ffmpeg: 0.5 → "2", 0.3 → "10/3", 2 → "1/2" (3.3333 fps acumularía deriva). */
export function tasaDeCada(cada) {
  for (let q = 1; q <= 1000; q++) {
    const p = Math.round(cada * q);
    if (p > 0 && Math.abs(cada * q - p) < 1e-9) {
      const d = mcd(p, q);
      return p / d === 1 ? String(q / d) : `${q / d}/${p / d}`;
    }
  }
  return String(1 / cada);
}

/** Filtro de ffmpeg que saca un fotograma cada `cada` segundos a `ancho` px como máximo. */
export function filtroFotogramas(cada, ancho) {
  // setpts: el primer fotograma cuenta como segundo 0 aunque el archivo empiece un poco después (pasa con
  // vídeos de redes). round=up: cada fotograma es el de su instante exacto o el inmediatamente anterior (con
  // el redondeo por defecto sería el último de una ventana de ±cada/2; ver revisar.mjs).
  return `setpts=PTS-STARTPTS,fps=fps=${tasaDeCada(cada)}:round=up,scale='min(${ancho},iw)':-2`;
}

/** Cuadrícula de la hoja de contactos: cada cuántos fotogramas una miniatura, columnas, filas y ancho. */
export function planHoja(n, { w, h }, max = MAX_MINIATURAS) {
  const paso = Math.max(1, Math.ceil(n / max));
  const miniaturas = Math.ceil(n / paso);
  const anchoMiniatura = h > w ? 240 : 320;
  // Columnas para que la hoja salga apaisada (~16:10), que es como se mira en una pantalla.
  const proporcion = w > 0 && h > 0 ? h / w : 9 / 16;
  const columnas = Math.min(8, miniaturas, Math.max(1, Math.round(Math.sqrt(1.6 * miniaturas * proporcion))));
  return { paso, miniaturas, columnas, filas: filas(miniaturas, columnas), anchoMiniatura };
}

/**
 * Filtro de la hoja a partir de la secuencia de fotogramas leída a 1/cada fps: así el pts de cada imagen es
 * su instante en el vídeo, y la marca de tiempo (filtroMarcaTiempo de revisar.mjs) dice lo que se ve.
 */
export function filtroHoja({ paso, columnas, filas: nFilas, anchoMiniatura }, marca = filtroMarcaTiempo(0)) {
  return [
    paso > 1 && `select=not(mod(n\\,${paso}))`,
    `scale=${anchoMiniatura}:-2`,
    marca,
    `tile=${columnas}x${nFilas}:padding=4:margin=4:color=white`,
  ]
    .filter(Boolean)
    .join(',');
}

// ---------- Medidas: paleta y cortes ----------

/**
 * Colores dominantes de una lista de píxeles RGB (rgb24) → [{ hex, peso }] de más a menos abundante.
 * Primero un histograma de 32 niveles por canal (agrupa el ruido de compresión); después cada cubo se suma
 * al color dominante que tenga a menos de `distancia`, para que los bordes suavizados y los degradados cuenten
 * como su color y no salgan como colores propios.
 */
export function paletaDominante(rgb, { n = 8, distancia = 40, minimo = 0.003 } = {}) {
  const total = Math.floor(rgb.length / 3);
  if (!total) return [];
  const cuenta = new Uint32Array(32768);
  const suma = new Float64Array(32768 * 3);
  for (let i = 0; i < total * 3; i += 3) {
    const k = ((rgb[i] >> 3) << 10) | ((rgb[i + 1] >> 3) << 5) | (rgb[i + 2] >> 3);
    cuenta[k]++;
    suma[k * 3] += rgb[i];
    suma[k * 3 + 1] += rgb[i + 1];
    suma[k * 3 + 2] += rgb[i + 2];
  }
  const cubos = [];
  for (let k = 0; k < cuenta.length; k++) {
    const c = cuenta[k];
    if (c) cubos.push({ c, r: suma[k * 3] / c, g: suma[k * 3 + 1] / c, b: suma[k * 3 + 2] / c });
  }
  cubos.sort((a, b) => b.c - a.c);
  const grupos = [];
  for (const cubo of cubos) {
    const g = grupos.find((x) => Math.hypot(x.r - cubo.r, x.g - cubo.g, x.b - cubo.b) <= distancia);
    if (g) g.c += cubo.c;
    else grupos.push({ ...cubo });
  }
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  return grupos
    .filter((g) => g.c / total >= minimo)
    .sort((a, b) => b.c - a.c)
    .slice(0, n)
    .map((g) => ({ hex: `#${hex(g.r)}${hex(g.g)}${hex(g.b)}`, peso: redondear(g.c / total, 3) }));
}

/** Diferencia media (0–255) de cada fotograma con el anterior; difs[0] = 0. */
export function diferenciasSeguidas(gris, tam) {
  const n = Math.floor(gris.length / tam);
  const difs = n ? [0] : [];
  for (let i = 1; i < n; i++) {
    difs.push(diferenciaMedia(gris.subarray((i - 1) * tam, i * tam), gris.subarray(i * tam, (i + 1) * tam)));
  }
  return difs;
}

const mediana = (xs) => {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/**
 * Instantes (s) de los cortes de plano. Un corte es un pico aislado de diferencia entre dos fotogramas
 * seguidos: supera `umbral` y es `factor` veces mayor que el movimiento normal de alrededor. Un barrido
 * rápido de cámara da muchas diferencias altas seguidas y no cuenta; un fundido tampoco, porque se reparte.
 */
export function detectarCortes(difs, fps, { umbral = 14, factor = 3, ventana = 8, separacion = 0.25 } = {}) {
  const cortes = [];
  for (let i = 1; i < difs.length; i++) {
    const d = difs[i];
    if (!(d >= umbral)) continue;
    const vecinos = [];
    for (let j = Math.max(1, i - ventana); j <= Math.min(difs.length - 1, i + ventana); j++) {
      if (j !== i) vecinos.push(difs[j]);
    }
    if (d < factor * Math.max(mediana(vecinos), 1)) continue;
    const t = i / fps;
    const previo = cortes.at(-1);
    // Un corte entre dos fotogramas mezclados da dos picos seguidos: cuenta como uno, el más fuerte.
    if (previo && t - previo.t < separacion) {
      if (d > previo.d) Object.assign(previo, { t, d });
      continue;
    }
    cortes.push({ t, d });
  }
  return cortes.map((c) => redondear(c.t, 2));
}

/** Cuántos planos hay y cuánto duran (s) a partir de los cortes. */
export function resumenPlanos(cortes, duracion) {
  const bordes = [0, ...cortes.filter((t) => t > 0 && t < duracion), duracion];
  const duraciones = bordes.slice(1).map((b, i) => b - bordes[i]);
  return {
    n: duraciones.length,
    media: redondear(duraciones.reduce((s, d) => s + d, 0) / duraciones.length, 2),
    min: redondear(Math.min(...duraciones), 2),
    max: redondear(Math.max(...duraciones), 2),
  };
}

// ---------- Textos ----------

export function siguientePaso(carpeta) {
  return [
    `Siguiente paso: escribe ${path.join(carpeta, 'estilo.md')} mirando contacto.png y los fotogramas:`,
    '  · paleta en hex: fondo, texto y acento (info.json → paleta es una medida aproximada para empezar)',
    '  · tipografías: familia parecida, peso, mayúsculas, interletrado',
    '  · duración de los planos y ritmo (info.json → cortes y planos)',
    '  · transiciones: corte, transformación, máscara, barrido…',
    '  · cámara: zoom, paneo, cuántos movimientos a la vez',
    '  · textura: grano, sombras, desenfoque, ruido',
    '  · cómo entra y sale el texto',
    'Toma la GRAMÁTICA, nunca el contenido: ni sus textos, ni sus logos, ni sus personajes.',
  ].join('\n');
}

export function resumenReferencia(r) {
  const lineas = [
    `✅ ${r.carpeta}`,
    `   video.mp4 · ${r.duracion.toFixed(1)} s · ${r.w}x${r.h}${r.fps ? ` · ${redondear(r.fps, 2)} fps` : ''}` +
      (r.autor ? ` · de ${r.autor}` : ''),
    `   fotogramas/ · ${r.n} (uno cada ${r.cada} s, ${r.fotogramas.w}x${r.fotogramas.h} px)`,
    `   contacto.png · ${r.contacto.miniaturas} miniaturas` +
      (r.contacto.cada !== r.cada ? ` (una cada ${r.contacto.cada} s)` : ''),
  ];
  if (r.paleta?.length) {
    const pct = (peso) => (peso < 0.01 ? '<1' : Math.round(peso * 100));
    lineas.push(`   paleta aprox.: ${r.paleta.map((c) => `${c.hex} ${pct(c.peso)} %`).join(' · ')}`);
  }
  if (r.cortes) {
    lineas.push(
      r.cortes.length
        ? `   cortes aprox.: ${r.cortes.length} (${r.cortes.slice(0, 12).join(', ')}${r.cortes.length > 12 ? '…' : ''} s)` +
            ` · plano medio de ${r.planos.media} s`
        : '   cortes aprox.: ninguno detectado (un solo plano que se transforma, o fundidos)',
    );
  }
  return lineas.join('\n');
}

// ---------- Descarga y preparación (E/S) ----------

/** Motivo legible de un fallo de fetch: Node esconde el real (ENOTFOUND, ECONNRESET…) en e.cause. */
export function causaRed(e) {
  if (e?.name === 'TimeoutError') return 'no respondió a tiempo';
  return e?.cause?.code ?? e?.cause?.message ?? e?.message ?? String(e);
}

async function consultarTweet(id, api = API_FXTWITTER) {
  let r;
  try {
    r = await fetch(`${api}${id}`, {
      headers: { 'User-Agent': AGENTE, Accept: 'application/json' },
      signal: AbortSignal.timeout(LIMITE_API),
    });
  } catch (e) {
    throw new Error(`No pude consultar el post en api.fxtwitter.com (${causaRed(e)}). ¿Hay conexión a internet?`, {
      cause: e,
    });
  }
  const j = await r.json().catch(() => null);
  if (r.status === 404 || j?.code === 404) {
    throw new Error('No encuentro ese post: puede ser privado, estar borrado o la URL estar mal copiada.');
  }
  if (!r.ok || !j?.tweet) {
    throw new Error(
      `api.fxtwitter.com respondió ${r.status}${j?.message ? ` (${j.message})` : ''}: prueba en un rato.`,
    );
  }
  return j.tweet;
}

/** Descarga a `destino` pasando por un .parcial: si se corta, no queda un vídeo a medias con el nombre bueno. */
async function descargar(url, destino, { exigirVideo = false } = {}) {
  let r;
  try {
    r = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(LIMITE_DESCARGA) });
  } catch (e) {
    throw new Error(`No pude descargar ${url} (${causaRed(e)}). ¿Hay conexión a internet?`, { cause: e });
  }
  if (!r.ok) throw new Error(`La descarga de ${url} falló: HTTP ${r.status}.`);
  const tipo = r.headers.get('content-type') ?? '';
  if (exigirVideo && !/^video\//i.test(tipo)) {
    await r.body?.cancel();
    throw new Error(
      `${url} no es un vídeo (responde ${tipo || 'sin tipo'}). Si es una página (YouTube, Instagram…), ` +
        'descarga el vídeo y pásame el archivo, o usa la dirección directa del .mp4.',
    );
  }
  const parcial = `${destino}.parcial`;
  try {
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(parcial));
    fs.renameSync(parcial, destino);
  } catch (e) {
    fs.rmSync(parcial, { force: true });
    throw new Error(`La descarga de ${url} se cortó (${causaRed(e)}).`, { cause: e });
  }
  return { tipo };
}

/** .mov, .webm, .gif…: se pasan a H.264 para que el resto del estudio lea siempre el mismo formato. */
async function convertirAMP4(origen, destino) {
  const parcial = destino.replace(/\.mp4$/i, '.tmp.mp4');
  try {
    await ffmpeg([
      ...['-i', origen, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'],
      ...['-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p'],
      ...['-c:a', 'aac', '-movflags', '+faststart', parcial],
    ]);
    fs.renameSync(parcial, destino);
  } finally {
    fs.rmSync(parcial, { force: true });
  }
}

// En Windows las rutas no distinguen mayúsculas.
const mismaRuta = (a, b) => {
  const n = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  return n(a) === n(b);
};

/** Deja el vídeo en `destino` (video.mp4). Devuelve de dónde salió: { urlVideo, autor }. */
async function obtenerVideo(fuente, destino, { video = 1, log = console.log, api } = {}) {
  if (fuente.tipo === 'archivo') {
    if (mismaRuta(fuente.ruta, destino)) return {};
    if (/\.mp4$/i.test(fuente.ruta)) fs.copyFileSync(fuente.ruta, destino);
    else await convertirAMP4(fuente.ruta, destino);
    return {};
  }
  if (fuente.tipo === 'tweet') {
    const tweet = await consultarTweet(fuente.id, api);
    // Si el post no trae vídeo pero cita otro que sí, la referencia es ese (y su autor, el del post citado).
    const deCita = !videosDe(tweet.media).length;
    const conVideo = deCita ? tweet.quote : tweet;
    const media = conVideo?.media;
    const url = elegirVariante(media, video - 1);
    if (!url) {
      const n = videosDe(media).length;
      throw new Error(
        n
          ? `El post tiene ${n} vídeo${n > 1 ? 's' : ''}: no existe el --video ${video}.`
          : 'Ese post no tiene ningún vídeo (ni el post que cita).',
      );
    }
    const usuario = conVideo.author?.screen_name ?? (deCita ? null : fuente.usuario);
    const autor = usuario ? `@${usuario}` : null;
    log(`⬇ Descargando el vídeo${autor ? ` de ${autor}` : ''} (${tamanoEnURL(url)?.join('x') ?? 'mejor calidad'})…`);
    await descargar(url, destino);
    return { urlVideo: url, ...(autor && { autor }) };
  }
  log(`⬇ Descargando ${fuente.url}…`);
  const temporal = `${destino}.descarga`;
  try {
    const { tipo } = await descargar(fuente.url, temporal, { exigirVideo: fuente.tipo === 'web' });
    if (/\.mp4$/i.test(new URL(fuente.url).pathname) || /^video\/mp4/i.test(tipo)) fs.renameSync(temporal, destino);
    else await convertirAMP4(temporal, destino);
  } finally {
    fs.rmSync(temporal, { force: true });
  }
  return { urlVideo: fuente.url };
}

/** Patrón de ffmpeg para los fotogramas. Un % en la ruta se escribe %% para que no lo tome por el número. */
const patronFotogramas = (dir) => path.join(dir.replaceAll('%', '%%'), 'f_%04d.png');

/** Paleta y cortes aproximados (para estilo.md). Lee el vídeo a baja resolución: es rápido incluso si es largo. */
async function analizar(video, meta) {
  const { stdout: rgb } = await ffmpeg([
    ...['-i', video, '-vf', 'setpts=PTS-STARTPTS,fps=fps=2:round=up,scale=64:-2:flags=area'],
    ...['-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
  ]);
  // A 30 fps como mucho: un corte se ve igual y un vídeo de 60 fps pesa la mitad en memoria.
  const fps = Math.min(30, Math.round(meta.fps) || 30);
  const [w, h] = [64, 36];
  const { stdout: gris } = await ffmpeg([
    ...['-i', video, '-vf', `setpts=PTS-STARTPTS,fps=fps=${fps},scale=${w}:${h}:flags=area`],
    ...['-pix_fmt', 'gray', '-f', 'rawvideo', '-'],
  ]);
  const cortes = detectarCortes(diferenciasSeguidas(gris, w * h), fps);
  return { paleta: paletaDominante(rgb), cortes, planos: resumenPlanos(cortes, meta.duracion) };
}

/**
 * Prepara la carpeta de una referencia: video.mp4, fotogramas/, contacto.png e info.json.
 * Devuelve los datos de info.json más `carpeta`. `api` solo cambia en los tests (un servidor local hace de
 * api.fxtwitter.com para probar la descarga sin depender de la red).
 */
export async function prepararReferencia(
  { entrada, salida, cada = 0.5, ancho = 960, video = 1 },
  { log = console.log, api = API_FXTWITTER } = {},
) {
  const fuente = clasificarEntrada(entrada);
  fs.mkdirSync(salida, { recursive: true });
  const archivoVideo = path.join(salida, 'video.mp4');
  const origen = await obtenerVideo(fuente, archivoVideo, { video, log, api });
  const meta = await info(archivoVideo);
  if (!meta.w || !(meta.duracion > 0)) throw new Error(`${archivoVideo} no tiene imagen (¿es solo audio?).`);
  const previstos = Math.ceil(meta.duracion / cada);
  if (previstos > MAX_FOTOGRAMAS) {
    throw new Error(
      `Saldrían ${previstos} fotogramas: usa un --cada mayor (con --cada ${Math.ceil(meta.duracion / MAX_FOTOGRAMAS)} ` +
        `saldrían menos de ${MAX_FOTOGRAMAS}).`,
    );
  }

  // Una pasada anterior con otro --cada dejaría fotogramas que ya no tocan: se borran solo los f_NNNN.png.
  const dirFotos = path.join(salida, 'fotogramas');
  fs.mkdirSync(dirFotos, { recursive: true });
  for (const f of fs.readdirSync(dirFotos)) if (FOTOGRAMA.test(f)) fs.rmSync(path.join(dirFotos, f));
  // passthrough: el filtro fps ya deja un fotograma por instante; el muxer no debe duplicar ni tirar ninguno.
  await ffmpeg([
    ...['-i', archivoVideo, '-vf', filtroFotogramas(cada, ancho)],
    ...['-fps_mode', 'passthrough', '-start_number', '1', patronFotogramas(dirFotos)],
  ]);
  const fotos = fs
    .readdirSync(dirFotos)
    .filter((f) => FOTOGRAMA.test(f))
    .sort();
  if (!fotos.length) throw new Error('ffmpeg no sacó ningún fotograma del vídeo.');
  const tamFoto = tamanoPNG(fs.readFileSync(path.join(dirFotos, fotos[0])));

  // Con el tamaño de los fotogramas y no el de ffprobe: un vídeo de móvil girado por metadatos da w y h
  // cambiados, mientras que ffmpeg ya saca los fotogramas derechos.
  const hoja = planHoja(fotos.length, { w: tamFoto.ancho, h: tamFoto.alto });
  await ffmpeg([
    ...['-framerate', tasaDeCada(cada), '-start_number', '1', '-i', patronFotogramas(dirFotos)],
    ...['-vf', filtroHoja(hoja), '-frames:v', '1', path.join(salida, 'contacto.png')],
  ]);

  let medidas = {};
  try {
    medidas = await analizar(archivoVideo, meta);
  } catch (e) {
    log(`⚠ No pude medir la paleta ni los cortes: ${e.message.split('\n')[0]}`);
  }

  const datos = {
    fuente: fuente.tipo === 'archivo' ? fuente.ruta : String(entrada).trim(),
    ...origen,
    duracion: redondear(meta.duracion),
    w: meta.w,
    h: meta.h,
    fps: meta.fps ? redondear(meta.fps) : null,
    cada,
    n: fotos.length,
    fotogramas: {
      carpeta: 'fotogramas',
      w: tamFoto.ancho,
      h: tamFoto.alto,
      nota: 'f_0001.png es el segundo 0; f_000N, el segundo (N-1)·cada',
    },
    contacto: { archivo: 'contacto.png', cada: redondear(cada * hoja.paso), miniaturas: hoja.miniaturas },
    ...medidas,
  };
  fs.writeFileSync(path.join(salida, 'info.json'), `${JSON.stringify(datos, null, 2)}\n`);
  return { carpeta: salida, ...datos };
}

if (esPrincipal(import.meta.url)) {
  try {
    const op = leerOpciones(process.argv.slice(2));
    if (op.ayuda) console.log(AYUDA);
    else {
      const r = await prepararReferencia(op);
      console.log(resumenReferencia(r));
      console.log(`\n${siguientePaso(r.carpeta)}`);
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
