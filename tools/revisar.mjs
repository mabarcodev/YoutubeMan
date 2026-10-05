#!/usr/bin/env node
// Revisión automática de un vídeo renderizado. Genera el material que mira el crítico:
//   contacto-N.png  hoja de contactos (2 fotogramas/s o uno por pulso con --bpm), por tramos de 30 s
//   movil.png       cómo se lee a 360 px de ancho (pantalla de móvil)
//   primero.png / ultimo.png   miniatura del feed y cierre del bucle
//   tira-<t>.png    12 fotogramas seguidos alrededor de una acción rápida (--tiras 4.2,7.1)
//   resumen.json / resumen.md  saltos de un fotograma, diferencia del bucle y rutas
//
//   node tools/revisar.mjs <video.mp4> [--salida carpeta] [--bpm 120] [--tiras 4.2,7.1] [--umbral 10]

import { leerArgs } from './lib/args.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, info, decodificarFotogramasGris } from './lib/ffmpeg.mjs';
import { detectarSaltos, diferenciaMedia } from './lib/saltos.mjs';
import { esPrincipal } from './lib/rutas.mjs';

const TRAMO = 30; // segundos por hoja de contactos, para que cada imagen siga siendo legible

export const AYUDA = `Uso: node tools/revisar.mjs <video.mp4> [opciones]
  --salida <carpeta>   dónde dejar las imágenes (por defecto revision-<video> junto al vídeo)
  --bpm 120            una miniatura por pulso en la hoja de contactos (por defecto, 2 por segundo)
  --tiras 4.2,7.1      tiras de 12 fotogramas seguidos alrededor de esos segundos (acciones rápidas)
  --umbral 10          sensibilidad para detectar saltos de un fotograma (más bajo = más sensible)`;

/** Tramos [inicio, duración] en los que se parte un vídeo largo. */
export function tramos(duracion, tam = TRAMO) {
  const out = [];
  for (let ini = 0; ini < duracion - 1e-6; ini += tam) out.push([ini, Math.min(tam, duracion - ini)]);
  return out.length ? out : [[0, duracion]];
}

/**
 * Número de una opción de la línea de comandos, o undefined si no se ha dado. Un valor que no es número
 * se rechaza con un mensaje claro: "--umbral abc" desactivaría en silencio la detección de saltos.
 */
export function numeroOpcion(nombre, valor, { minimo, mayorQue } = {}) {
  if (valor === undefined) return undefined;
  const n = Number(valor);
  const valido =
    String(valor).trim() !== '' &&
    Number.isFinite(n) &&
    (minimo === undefined || n >= minimo) &&
    (mayorQue === undefined || n > mayorQue);
  if (!valido) {
    const limite = mayorQue !== undefined ? ` mayor que ${mayorQue}` : minimo !== undefined ? ` desde ${minimo}` : '';
    throw new Error(`${nombre} debe ser un número${limite} (recibido: "${valor}").`);
  }
  return n;
}

/** Filas necesarias para `n` miniaturas en una cuadrícula de `columnas`. */
export const filas = (n, columnas) => Math.max(1, Math.ceil(n / columnas));

const FUENTES_SISTEMA = [
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

/**
 * Filtro drawtext con la marca de tiempo de cada miniatura. En Windows ffmpeg no trae
 * fontconfig, así que hay que darle un archivo de fuente; si no hay ninguno, sin marca.
 */
export function filtroMarcaTiempo(inicio, existe = fs.existsSync) {
  const fuente = FUENTES_SISTEMA.find((f) => existe(f));
  if (!fuente) return null;
  const ruta = fuente.replace(':', '\\:');
  return (
    `drawtext=fontfile='${ruta}':text='%{pts\\:hms\\:${inicio.toFixed(3)}}':x=8:y=8:fontsize=18:` +
    `fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4`
  );
}

export async function revisar(video, { salida, bpm, tiras = [], umbral = 10 } = {}) {
  if (!fs.existsSync(video)) throw new Error(`No existe el vídeo: ${video}`);
  const dir = salida ?? path.join(path.dirname(video), `revision-${path.basename(video, path.extname(video))}`);
  fs.mkdirSync(dir, { recursive: true });
  const meta = await info(video);
  const fpsHoja = bpm ? bpm / 60 : 2;
  const archivos = {};

  archivos.contacto = [];
  for (const [i, [ini, dur]] of tramos(meta.duracion).entries()) {
    const n = Math.ceil(dur * fpsHoja);
    const destino = path.join(dir, `contacto-${i + 1}.png`);
    // round=up: cada miniatura es el fotograma del instante exacto (o el inmediatamente anterior).
    // Con el redondeo por defecto ffmpeg coge el último fotograma de una ventana de ±0,25 s
    // y la marca de tiempo no coincide con lo que se ve.
    const filtros = [
      `fps=fps=${fpsHoja}:round=up`,
      'scale=384:-2',
      filtroMarcaTiempo(ini),
      `tile=5x${filas(n, 5)}:padding=4:color=white`,
    ];
    await ffmpeg([
      ...['-ss', ini.toFixed(3), '-t', dur.toFixed(3), '-i', video],
      ...['-vf', filtros.filter(Boolean).join(','), '-frames:v', '1', destino],
    ]);
    archivos.contacto.push(destino);
  }

  archivos.movil = path.join(dir, 'movil.png');
  const nMovil = Math.ceil(Math.min(meta.duracion, 35));
  await ffmpeg([
    '-t',
    '35',
    '-i',
    video,
    '-vf',
    `fps=fps=1:round=up,scale=360:-2,tile=5x${filas(nMovil, 5)}:padding=4:color=white`,
    '-frames:v',
    '1',
    archivos.movil,
  ]);

  archivos.primero = path.join(dir, 'primero.png');
  archivos.ultimo = path.join(dir, 'ultimo.png');
  await ffmpeg(['-i', video, '-frames:v', '1', archivos.primero]);
  await ffmpeg(['-sseof', '-0.1', '-i', video, '-update', '1', '-q:v', '1', archivos.ultimo]);

  archivos.tiras = [];
  for (const t of tiras) {
    const destino = path.join(dir, `tira-${String(t).replace('.', '_')}s.png`);
    await ffmpeg([
      '-ss',
      Math.max(0, t - 0.1).toFixed(3),
      '-i',
      video,
      '-vf',
      'scale=320:-2,tile=12x1:padding=2',
      '-frames:v',
      '1',
      destino,
    ]);
    archivos.tiras.push(destino);
  }

  const grises = await decodificarFotogramasGris(video);
  const saltos = detectarSaltos(grises, { umbral }).map((s) => ({
    ...s,
    segundo: Number((s.indice / (meta.fps || 60)).toFixed(3)),
  }));
  const bucle = grises.length > 1 ? Number(diferenciaMedia(grises[0], grises[grises.length - 1]).toFixed(2)) : null;

  const resumen = {
    video,
    duracion: meta.duracion,
    tamano: `${meta.w}x${meta.h}`,
    fps: meta.fps,
    audio: meta.tieneAudio,
    saltos,
    diferenciaBucle: bucle,
    bucleLimpio: bucle !== null && bucle < 2,
    archivos,
  };
  fs.writeFileSync(path.join(dir, 'resumen.json'), JSON.stringify(resumen, null, 2));
  fs.writeFileSync(path.join(dir, 'resumen.md'), resumenMarkdown(resumen));
  return resumen;
}

export function resumenMarkdown(r) {
  const lineas = [
    `# Revisión automática`,
    ``,
    `- Vídeo: \`${r.video}\``,
    `- ${r.duracion.toFixed(2)} s · ${r.tamano} · ${r.fps?.toFixed(2)} fps · audio: ${r.audio ? 'sí' : 'no'}`,
    `- Bucle: diferencia primer/último fotograma = ${r.diferenciaBucle} (${r.bucleLimpio ? 'limpio' : 'se nota el corte si el vídeo hace bucle'})`,
    `- Saltos de un fotograma: ${r.saltos.length ? r.saltos.map((s) => `${s.segundo} s (fotograma ${s.indice}, ${s.puntuacion})`).join(', ') : 'ninguno'}`,
    ``,
    `## Imágenes para revisar`,
    ...r.archivos.contacto.map((c) => `- Hoja de contactos: ${c}`),
    `- Móvil (360 px): ${r.archivos.movil}`,
    `- Primer fotograma (miniatura del feed): ${r.archivos.primero}`,
    `- Último fotograma: ${r.archivos.ultimo}`,
    ...r.archivos.tiras.map((t) => `- Tira: ${t}`),
  ];
  return lineas.join('\n') + '\n';
}

if (esPrincipal(import.meta.url)) {
  try {
    const { values, positionals } = leerArgs({
      allowPositionals: true,
      options: {
        salida: { type: 'string' },
        bpm: { type: 'string' },
        tiras: { type: 'string' },
        umbral: { type: 'string' },
        ayuda: { type: 'boolean', short: 'h', default: false },
      },
    });
    if (values.ayuda) {
      console.log(AYUDA);
      process.exit(0);
    }
    if (!positionals[0]) throw new Error(AYUDA);
    const r = await revisar(path.resolve(positionals[0]), {
      salida: values.salida && path.resolve(values.salida),
      bpm: numeroOpcion('--bpm', values.bpm, { mayorQue: 0 }),
      tiras: (values.tiras ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => numeroOpcion('--tiras', s, { minimo: 0 })),
      umbral: numeroOpcion('--umbral', values.umbral, { minimo: 0 }),
    });
    console.log(resumenMarkdown(r));
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
