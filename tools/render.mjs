#!/usr/bin/env node
// Renderiza una escena o película a MP4 (o a PNG con --fotos).
//
//   node tools/render.mjs --proyecto videos/MiProducto --modulo pelicula.js --formato 16:9,9:16
//   node tools/render.mjs --proyecto ... --modulo escenas/01-gancho/escena.js --borrador
//   node tools/render.mjs --proyecto ... --modulo escenas/01-gancho/escena.js --fotos 0,1.5,3
//
// Ver AYUDA más abajo (o --ayuda) para todas las opciones.

import { leerArgs } from './lib/args.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { abrirEscena, fotograma } from './lib/navegador.mjs';
import { resolverBinario } from './lib/ffmpeg.mjs';
import { mezclar } from './lib/audio.mjs';
import { slug, esPrincipal } from './lib/rutas.mjs';
import { normalizarFormato } from '../engine/layout.js';

export const AYUDA = `Uso: node tools/render.mjs --proyecto <carpeta> --modulo <escena.js|pelicula.js> [opciones]
  --formato 16:9,9:16   formatos a renderizar (16:9, 9:16, 1:1, 4:5)
  --fps 60 --sub 4      fotogramas por segundo y submuestras por fotograma (desenfoque de movimiento)
  --desde 0 --hasta 5   renderiza solo ese tramo (para revisar arreglos)
  --borrador            rápido: 30 fps, sin desenfoque, mitad de resolución
  --fotos 0,1.5,3       exporta PNG de esos instantes en lugar de vídeo (publicaciones, revisión)
  --escala 1            densidad de píxeles (2 = PNG al doble de resolución)
  --salida <ruta>       archivo .mp4 o carpeta para las fotos
  --sin-audio           no mezcla sonido
  --crf 16              calidad H.264 (menos = mejor)
  --hilos 4             páginas de Chromium capturando en paralelo`;

export function leerOpciones(argv) {
  const { values } = leerArgs({
    args: argv,
    options: {
      proyecto: { type: 'string' },
      modulo: { type: 'string' },
      formato: { type: 'string', default: '16:9' },
      fps: { type: 'string' },
      sub: { type: 'string' },
      desde: { type: 'string' },
      hasta: { type: 'string' },
      borrador: { type: 'boolean', default: false },
      fotos: { type: 'string' },
      escala: { type: 'string' },
      salida: { type: 'string' },
      'sin-audio': { type: 'boolean', default: false },
      crf: { type: 'string', default: '16' },
      hilos: { type: 'string', default: '4' },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  if (values.ayuda) return { ayuda: true };
  const proyecto = path.resolve(values.proyecto ?? process.cwd());
  const modulo = values.modulo ?? (fs.existsSync(path.join(proyecto, 'pelicula.js')) ? 'pelicula.js' : null);
  if (!modulo) throw new Error('Falta --modulo (ruta a escena.js o pelicula.js).');
  const borrador = values.borrador;
  const num = (v, def) => (v === undefined ? def : Number(v));
  const op = {
    proyecto,
    modulo,
    // Sin duplicados: "9:16,reels" es el mismo formato y se renderizaría dos veces (v1 y v2).
    formatos: [...new Set(values.formato.split(',').map((f) => normalizarFormato(f)))],
    fps: num(values.fps, borrador ? 30 : 60),
    sub: num(values.sub, borrador ? 1 : 4),
    escala: num(values.escala, borrador ? 0.5 : 1),
    desde: num(values.desde, 0),
    hasta: values.hasta === undefined ? null : Number(values.hasta),
    borrador,
    // Los huecos ("1,,3" o una coma al final) se ignoran: Number("") es 0 y saldría una foto que nadie pidió.
    fotos:
      values.fotos === undefined
        ? null
        : values.fotos
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map(Number),
    salida: values.salida ? path.resolve(values.salida) : null,
    sinAudio: values['sin-audio'],
    crf: Number(values.crf),
    hilos: Number(values.hilos),
  };
  // Validar aquí evita abrir Chromium para fallar minutos después con un error críptico de ffmpeg.
  for (const [k, v] of Object.entries({
    fps: op.fps,
    sub: op.sub,
    escala: op.escala,
    desde: op.desde,
    ...(op.hasta === null ? {} : { hasta: op.hasta }),
    crf: op.crf,
    hilos: op.hilos,
  })) {
    if (!Number.isFinite(v)) throw new Error(`--${k} debe ser un número.`);
  }
  if (!(op.fps > 0)) throw new Error('--fps debe ser mayor que 0.');
  if (!(op.escala > 0)) throw new Error('--escala debe ser mayor que 0.');
  if (op.desde < 0) throw new Error('--desde debe ser 0 o más.');
  if (op.hasta !== null && op.hasta <= op.desde) throw new Error('--hasta debe ser mayor que --desde.');
  if (op.fotos && (!op.fotos.length || op.fotos.some((t) => !Number.isFinite(t))))
    throw new Error('--fotos debe ser una lista de segundos: 0,1.5,3');
  if (op.sub < 1 || !Number.isInteger(op.sub)) throw new Error('--sub debe ser un entero >= 1.');
  if (op.hilos < 1 || !Number.isInteger(op.hilos)) throw new Error('--hilos debe ser un entero >= 1.');
  if (op.crf < 0 || op.crf > 51) throw new Error('--crf debe ser un número entre 0 y 51.');
  return op;
}

/**
 * Nombre corto del módulo: carpeta de la escena (01-gancho) o nombre del archivo (pelicula).
 * La ruta se resuelve contra el proyecto, no contra la carpeta desde la que se lanza el comando.
 */
export function nombreModulo(modulo, proyecto = process.cwd()) {
  const base = path.basename(modulo, path.extname(modulo));
  return base === 'escena' || base === 'index' ? path.basename(path.dirname(path.resolve(proyecto, modulo))) : base;
}

/** true si el render no cubre la pieza entera (tramo para revisar un arreglo). */
export const esParcial = (op) => op.desde > 0 || op.hasta !== null;

/** Primera ruta libre añadiendo -v1, -v2... para no pisar nunca un vídeo final anterior. */
export function rutaVersionada(dir, base, ext = '.mp4') {
  for (let v = 1; ; v++) {
    const p = path.join(dir, `${base}-v${v}${ext}`);
    if (!fs.existsSync(p)) return p;
  }
}

/** Ruta de salida por defecto: películas a salida/ (versionadas), escenas a revision/<escena>/. */
export function rutaSalida(op, formato) {
  const nombre = nombreModulo(op.modulo, op.proyecto);
  const tramo = !esParcial(op) ? null : op.hasta === null ? `${op.desde}s-fin` : `${op.desde}-${op.hasta}s`;
  const sufijo = [slug(formato.replace(':', 'x')), op.borrador && 'borrador', tramo].filter(Boolean).join('-');
  if (op.salida && op.salida.toLowerCase().endsWith('.mp4')) {
    if (op.formatos.length === 1) return op.salida;
    // Un nombre de archivo y varios formatos: uno por formato junto a él (nunca una carpeta llamada "x.mp4").
    const base = path.basename(op.salida, path.extname(op.salida));
    return path.join(path.dirname(op.salida), `${base}-${sufijo}.mp4`);
  }
  if (op.salida) return path.join(op.salida, `${nombre}-${sufijo}.mp4`);
  // Solo una película completa y con calidad final es un "final": va a salida/ y se versiona.
  if (nombre === 'pelicula' && !op.borrador && !esParcial(op)) {
    return rutaVersionada(path.join(op.proyecto, 'salida'), `${slug(path.basename(op.proyecto))}-${sufijo}`);
  }
  return path.join(op.proyecto, 'revision', nombre, `${nombre}-${sufijo}.mp4`);
}

/** Muestras a capturar y su instante. La muestra i·sub cierra el fotograma i (obturador hacia atrás). */
export function planMuestras({ desde, hasta, fps, sub }) {
  const fotogramas = Math.max(1, Math.round((hasta - desde) * fps));
  const total = (fotogramas - 1) * sub + 1;
  return { fotogramas, total, tiempo: (i) => desde + i / (fps * sub) };
}

/** Desplaza sonidos y música al tramo [desde, hasta] de un render parcial. */
export function recortarAudio({ sonidos = [], musica = null }, desde, hasta) {
  const s = sonidos.filter((x) => x.t >= desde && x.t <= hasta).map((x) => ({ ...x, t: x.t - desde }));
  let m = null;
  if (musica) {
    const inicio = musica.inicio ?? 0;
    m = { ...musica, desde: (musica.desde ?? 0) + Math.max(0, desde - inicio), inicio: Math.max(0, inicio - desde) };
  }
  return { sonidos: s, musica: m };
}

function filtroVideo(sub) {
  // tmix promedia las últimas `sub` muestras (desenfoque); framestep se queda con una de cada `sub`.
  // El escalado a par evita fallos de libx264 con tamaños impares (p. ej. 4:5 a media resolución).
  const partes = sub > 1 ? [`tmix=frames=${sub}`, `framestep=${sub}`] : [];
  partes.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  return partes.join(',');
}

/**
 * Captura las muestras con varias páginas en paralelo y las entrega a `escribir` en orden.
 * Cada página es un proceso de Chromium distinto; como seek(t) es puro, da igual qué página pinte qué muestra.
 */
export async function capturarEnOrden({ paginas, total, tiempo, capturar = fotograma, escribir, progreso = () => {} }) {
  let siguiente = 0;
  let toca = 0;
  const listas = new Map();
  const volcar = async () => {
    while (listas.has(toca)) {
      const dato = listas.get(toca);
      listas.delete(toca);
      toca++;
      progreso(toca);
      await escribir(dato);
    }
  };
  // Si una página falla, las demás dejan de capturar en su siguiente vuelta en vez de seguir trabajando para nada.
  let fallo = null;
  await Promise.all(
    paginas.map(async (p) => {
      while (!fallo) {
        const i = siguiente++;
        if (i >= total) return;
        try {
          listas.set(i, await capturar(p, tiempo(i)));
          await volcar();
        } catch (e) {
          fallo ??= e;
          throw e;
        }
      }
    }),
  );
  await volcar();
}

async function renderVideo({ escenas, op, formato, salida, log }) {
  const { meta } = escenas[0];
  const hasta = op.hasta ?? meta.duracion;
  if (!(hasta > op.desde)) throw new Error(`Tramo vacío: desde ${op.desde} hasta ${hasta}.`);
  const plan = planMuestras({ desde: op.desde, hasta, fps: op.fps, sub: op.sub });
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const mudo = salida.replace(/\.mp4$/i, '.mudo.tmp.mp4');
  const ff = spawn(
    resolverBinario('ffmpeg'),
    [
      ...['-hide_banner', '-loglevel', 'error', '-y'],
      ...['-f', 'image2pipe', '-framerate', String(op.fps * op.sub), '-c:v', 'mjpeg', '-i', '-'],
      ...['-vf', filtroVideo(op.sub), '-r', String(op.fps)],
      ...['-c:v', 'libx264', '-preset', 'medium', '-crf', String(op.crf), '-pix_fmt', 'yuv420p'],
      ...['-movflags', '+faststart', mudo],
    ],
    { stdio: ['pipe', 'inherit', 'pipe'], windowsHide: true },
  );
  let errFF = '';
  ff.stderr.on('data', (d) => (errFF += d));
  ff.stdin.on('error', () => {}); // si ffmpeg muere, el error real llega por su código de salida
  const cerrado = new Promise((ok) => ff.on('close', ok));
  const tmpFinal = salida.replace(/\.mp4$/i, '.audio.tmp.mp4');

  const t0 = Date.now();
  const porSegundo = op.fps * op.sub;
  try {
    await capturarEnOrden({
      paginas: escenas.map((e) => e.pagina),
      total: plan.total,
      tiempo: plan.tiempo,
      capturar: (pagina, t) => fotograma(pagina, t, { tipo: 'jpeg' }),
      escribir: async (img) => {
        if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r));
      },
      progreso: (n) =>
        n % porSegundo === 0 &&
        log(`  ${formato}: ${(n / porSegundo).toFixed(0)} s de ${(hasta - op.desde).toFixed(1)} s`),
    });
  } catch (e) {
    // Sin esto ffmpeg se queda esperando fotogramas y retiene el proceso: render() no terminaría nunca.
    ff.stdin.destroy();
    ff.kill();
    await cerrado;
    fs.rmSync(mudo, { force: true });
    throw e;
  }
  ff.stdin.end();
  const codigo = await cerrado;
  if (codigo !== 0) {
    fs.rmSync(mudo, { force: true });
    throw new Error(`ffmpeg falló al codificar (código ${codigo}):\n${errFF}`);
  }

  const audio = recortarAudio(meta, op.desde, hasta);
  let conAudio = false;
  try {
    if (!op.sinAudio && (audio.sonidos.length || audio.musica)) {
      const r = await mezclar({
        video: mudo,
        salida: tmpFinal,
        duracion: hasta - op.desde,
        ...audio,
        proyecto: op.proyecto,
        tmp: path.join(op.proyecto, '.render-tmp'),
      });
      conAudio = r.conAudio;
      fs.renameSync(tmpFinal, salida);
    } else {
      fs.renameSync(mudo, salida); // render por etapas: el final solo aparece si todo ha ido bien
    }
  } finally {
    // Nunca quedan temporales a medias junto a los vídeos, haya ido bien o mal la mezcla.
    fs.rmSync(mudo, { force: true });
    fs.rmSync(tmpFinal, { force: true });
  }
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  return { salida, fotogramas: plan.fotogramas, segundos: hasta - op.desde, conAudio, tiempoRender: seg };
}

async function renderFotos({ escena, op, formato, log }) {
  const nombre = nombreModulo(op.modulo, op.proyecto);
  const dir = op.salida ?? path.join(op.proyecto, 'revision', nombre);
  fs.mkdirSync(dir, { recursive: true });
  const salidas = [];
  for (const t of op.fotos) {
    const archivo = path.join(
      dir,
      `${nombre}-${slug(formato.replace(':', 'x'))}-${t.toFixed(2).replace('.', '_')}s.png`,
    );
    fs.writeFileSync(archivo, await fotograma(escena.pagina, t));
    salidas.push(archivo);
    log(`  foto ${t}s → ${archivo}`);
  }
  return { salidas };
}

export async function render(op, log = console.log) {
  const navegador = await chromium.launch();
  const resultados = [];
  const hilos = op.fotos ? 1 : Math.max(1, op.hilos ?? 4);
  try {
    for (const formato of op.formatos) {
      const escenas = [];
      try {
        for (let i = 0; i < hilos; i++) {
          escenas.push(
            await abrirEscena({ proyecto: op.proyecto, modulo: op.modulo, formato, escala: op.escala, navegador }),
          );
        }
        const [escena] = escenas;
        log(`▶ ${escena.meta.nombre} · ${formato} · ${escena.meta.duracion.toFixed(2)} s`);
        if (op.fotos) resultados.push({ formato, ...(await renderFotos({ escena, op, formato, log })) });
        else
          resultados.push({
            formato,
            ...(await renderVideo({ escenas, op, formato, salida: rutaSalida(op, formato), log })),
          });
        const errores = [...new Set(escenas.flatMap((e) => e.errores))];
        if (errores.length) log(`  ⚠ errores de la página:\n  - ${errores.join('\n  - ')}`);
      } finally {
        for (const e of escenas) await e.cerrar();
      }
    }
  } finally {
    await navegador.close();
  }
  return resultados;
}

if (esPrincipal(import.meta.url)) {
  try {
    const op = leerOpciones(process.argv.slice(2));
    if (op.ayuda) console.log(AYUDA);
    else {
      for (const r of await render(op)) {
        if (r.salida)
          console.log(
            `✅ ${r.formato}: ${r.salida} (${r.fotogramas} fotogramas, audio: ${r.conAudio ? 'sí' : 'no'}, ${r.tiempoRender} s)`,
          );
        else console.log(`✅ ${r.formato}: ${r.salidas.length} fotos`);
      }
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
