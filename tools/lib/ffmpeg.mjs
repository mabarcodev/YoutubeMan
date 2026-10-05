import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const cache = new Map();

/**
 * Localiza ffmpeg/ffprobe. Orden: variable de entorno (FFMPEG_PATH / FFPROBE_PATH),
 * PATH, y la carpeta de paquetes de winget (por si el PATH de esta consola aún no se ha refrescado).
 */
export function resolverBinario(nombre, { entorno = process.env, buscarWinget = true } = {}) {
  const clave = `${nombre}|${entorno[`${nombre.toUpperCase()}_PATH`] ?? ''}`;
  if (cache.has(clave)) return cache.get(clave);
  const candidatos = [];
  const delEntorno = entorno[`${nombre.toUpperCase()}_PATH`];
  if (delEntorno) candidatos.push(delEntorno);
  candidatos.push(nombre);
  if (buscarWinget) candidatos.push(...rutasWinget(nombre, entorno));
  for (const c of candidatos) {
    const r = spawnSync(c, ['-version'], { stdio: 'ignore', windowsHide: true });
    if (r.status === 0) {
      cache.set(clave, c);
      return c;
    }
  }
  throw new Error(
    `No encuentro ${nombre}. Instálalo con: winget install --id Gyan.FFmpeg -e --source winget ` +
      `(o define ${nombre.toUpperCase()}_PATH con la ruta al ejecutable).`,
  );
}

function rutasWinget(nombre, entorno) {
  const base = entorno.LOCALAPPDATA && path.join(entorno.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
  if (!base || !fs.existsSync(base)) return [];
  const out = [];
  for (const pkg of fs.readdirSync(base).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
    const dirPkg = path.join(base, pkg);
    for (const sub of fs.readdirSync(dirPkg)) {
      const exe = path.join(dirPkg, sub, 'bin', `${nombre}.exe`);
      if (fs.existsSync(exe)) out.push(exe);
    }
  }
  return out;
}

/** Ejecuta un binario y devuelve { codigo, stdout (Buffer), stderr (texto) }. */
export function ejecutar(bin, args, { entrada } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (codigo) => resolve({ codigo, stdout: Buffer.concat(out), stderr: err }));
    if (entrada) p.stdin.end(entrada);
    else p.stdin.end();
  });
}

/** Ejecuta ffmpeg y lanza un error legible si falla. */
export async function ffmpeg(args, opciones) {
  const r = await ejecutar(resolverBinario('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', ...args], opciones);
  if (r.codigo !== 0)
    throw new Error(`ffmpeg falló (código ${r.codigo}):\n${r.stderr.trim()}\nArgumentos: ${args.join(' ')}`);
  return r;
}

/** Información básica de un vídeo o audio: duración, tamaño y fps. */
export async function info(archivo) {
  const r = await ejecutar(resolverBinario('ffprobe'), [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,width,height,r_frame_rate',
    '-of',
    'json',
    archivo,
  ]);
  if (r.codigo !== 0) throw new Error(`ffprobe no pudo leer ${archivo}: ${r.stderr.trim()}`);
  const j = JSON.parse(r.stdout.toString());
  const v = (j.streams ?? []).find((s) => s.codec_type === 'video');
  const [num, den] = (v?.r_frame_rate ?? '0/1').split('/').map(Number);
  return {
    duracion: Number(j.format?.duration ?? 0),
    w: v?.width ?? null,
    h: v?.height ?? null,
    fps: v && den ? num / den : null, // sin pista de vídeo (un audio) no hay fps, igual que no hay w ni h
    tieneAudio: (j.streams ?? []).some((s) => s.codec_type === 'audio'),
  };
}

/** Decodifica el audio a PCM mono float32 (para medir picos). */
export async function decodificarPCM(archivo, sr = 48000) {
  const r = await ffmpeg(['-i', archivo, '-vn', '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-']);
  const buf = r.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

/** Decodifica fotogramas en gris a baja resolución (para detectar saltos y comparar bucles). */
export async function decodificarFotogramasGris(archivo, { w = 160, h = 90 } = {}) {
  const r = await ffmpeg(['-i', archivo, '-vf', `scale=${w}:${h}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-']);
  const tam = w * h;
  const n = Math.floor(r.stdout.length / tam);
  return Array.from({ length: n }, (_, i) => r.stdout.subarray(i * tam, (i + 1) * tam));
}
