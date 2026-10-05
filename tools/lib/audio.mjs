import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, decodificarPCM } from './ffmpeg.mjs';

export const SR = 48000;

// ---------- Síntesis (respaldo) ----------
// Las reglas prefieren grabaciones reales (kit/audio). Estas voces sintetizadas sirven para
// pruebas, borradores o cuando no hay kit. Todas son funciones puras con ruido de semilla fija.

function ruidoSemilla(semilla = 42) {
  let s = semilla >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
}

const env = (t, a) => Math.exp(-t * a);
const seno = (f, t) => Math.sin(2 * Math.PI * f * t);

/** [duración en s, función(t, ruido) → muestra] */
export const VOCES = {
  click: [0.05, (t) => seno(1800, t) * env(t, 90) * 0.5],
  tick: [0.03, (t) => seno(3200, t) * env(t, 160) * 0.35],
  pop: [0.15, (t) => Math.sin(2 * Math.PI * (600 + 900 * t) * t) * env(t, 30) * 0.4],
  thump: [0.5, (t) => Math.sin(2 * Math.PI * (90 - 60 * t) * t) * env(t, 9) * 0.9],
  whoosh: [0.35, (t, r) => r() * Math.sin(Math.PI * Math.min(1, t / 0.35)) * 0.25],
  ding: [0.9, (t) => (seno(1318.5, t) * 0.6 + seno(2637, t) * 0.25) * env(t, 5) * 0.5],
  // Pitido de prueba: ataque instantáneo, el pico cae en los primeros milisegundos.
  beep: [0.08, (t) => seno(1000, t) * (t < 0.07 ? 1 : Math.max(0, 1 - (t - 0.07) / 0.01)) * 0.8],
};

export function sintetizar(tipo, sr = SR) {
  const voz = VOCES[tipo];
  if (!voz)
    throw new Error(`Sonido sintetizado desconocido: "${tipo}". Disponibles: ${Object.keys(VOCES).join(', ')}.`);
  const [dur, fn] = voz;
  const r = ruidoSemilla(42);
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / sr, r);
  return out;
}

/** WAV PCM 16 bits mono. */
export function aWav(muestras, sr = SR) {
  const n = muestras.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, muestras[i])) * 32767), 44 + i * 2);
  return b;
}

// ---------- Medición ----------

/**
 * Dónde está el pico de un sonido. Importa porque muchos efectos tienen su golpe tarde
 * (un whoosh puede pegar a los 700 ms): hay que adelantarlos para que el golpe caiga en su momento.
 */
export function medirMuestras(muestras, sr = SR) {
  let max = 0;
  let idx = 0;
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) {
    const a = Math.abs(muestras[i]);
    suma += muestras[i] * muestras[i];
    if (a > max) {
      max = a;
      idx = i;
    }
  }
  const rms = Math.sqrt(suma / Math.max(1, muestras.length));
  return {
    duracionMs: round1((muestras.length / sr) * 1000),
    picoMs: round1((idx / sr) * 1000),
    picoDb: round1(20 * Math.log10(max || 1e-9)),
    rmsDb: round1(20 * Math.log10(rms || 1e-9)),
  };
}

const round1 = (v) => Math.round(v * 10) / 10;

export async function medirArchivo(archivo) {
  return medirMuestras(await decodificarPCM(archivo, SR), SR);
}

// ---------- Mezcla ----------

/**
 * Construye el filtro de ffmpeg (puro, sin tocar disco).
 *   pistas: [{ archivo, t, picoMs = 0, volumen = 1 }]  — t = segundo en el que debe caer el pico
 *   musica: { archivo, desde = 0, inicio = 0, volumen = 1, fundido = 1 } | null
 * Devuelve { entradas: [archivos en orden], filtro } o null si no hay nada que sonar.
 * La entrada 0 de ffmpeg es el vídeo; el audio empieza en la 1.
 */
export function construirMezcla({ duracion, pistas = [], musica = null, lufs = -14 }) {
  const entradas = [];
  const partes = [];
  const etiquetas = [];
  const comun = 'aresample=48000,aformat=channel_layouts=stereo';
  pistas.forEach((p, i) => {
    const k = entradas.push(p.archivo);
    const inicioMs = p.t * 1000 - (p.picoMs ?? 0);
    // Si el pico cae antes del segundo 0, recortamos el principio del sonido en vez de retrasarlo.
    const recorte = inicioMs < 0 ? `,atrim=start=${(-inicioMs / 1000).toFixed(4)},asetpts=PTS-STARTPTS` : '';
    const retraso = Math.max(0, Math.round(inicioMs));
    partes.push(`[${k}:a]${comun}${recorte},volume=${p.volumen ?? 1},adelay=${retraso}:all=1[s${i}]`);
    etiquetas.push(`[s${i}]`);
  });
  if (musica) {
    const k = entradas.push(musica.archivo);
    const inicio = musica.inicio ?? 0;
    const fundido = musica.fundido ?? 1;
    const finFundido = Math.max(0, duracion - inicio - fundido);
    partes.push(
      `[${k}:a]${comun},atrim=start=${musica.desde ?? 0},asetpts=PTS-STARTPTS,volume=${musica.volumen ?? 1},` +
        `afade=t=out:st=${finFundido.toFixed(3)}:d=${fundido},adelay=${Math.round(inicio * 1000)}:all=1[mus]`,
    );
    etiquetas.push('[mus]');
  }
  if (!etiquetas.length) return null;
  const dur = duracion.toFixed(4);
  partes.push(
    `${etiquetas.join('')}amix=inputs=${etiquetas.length}:normalize=0:dropout_transition=0,` +
      `apad=whole_dur=${dur},atrim=0:${dur},loudnorm=I=${lufs}:TP=-1.5:LRA=11,aresample=48000[aout]`,
  );
  return { entradas, filtro: partes.join(';') };
}

/**
 * Resuelve los sonidos declarados por una escena a archivos reales (sintetizando los de `tipo`),
 * mide sus picos y mezcla todo sobre el vídeo mudo.
 */
export async function mezclar({ video, salida, duracion, sonidos = [], musica = null, proyecto, tmp, lufs }) {
  fs.mkdirSync(tmp, { recursive: true });
  const medidas = new Map();
  const medir = async (archivo) => {
    if (!medidas.has(archivo)) medidas.set(archivo, await medirArchivo(archivo));
    return medidas.get(archivo);
  };
  const resolverArchivo = (ruta) => path.resolve(proyecto, ruta.replace(/^\/+/, ''));
  const pistas = [];
  for (const s of sonidos) {
    let archivo;
    if (s.tipo) {
      archivo = path.join(tmp, `sfx-${s.tipo}.wav`);
      if (!fs.existsSync(archivo)) fs.writeFileSync(archivo, aWav(sintetizar(s.tipo)));
    } else if (s.archivo) {
      archivo = resolverArchivo(s.archivo);
      if (!fs.existsSync(archivo)) throw new Error(`Sonido no encontrado: ${s.archivo} (${archivo})`);
    } else {
      throw new Error(`Sonido sin "tipo" ni "archivo" en t=${s.t}`);
    }
    const picoMs = s.picoMs ?? (await medir(archivo)).picoMs;
    pistas.push({ archivo, t: s.t, picoMs, volumen: s.volumen ?? 1 });
  }
  let mus = null;
  if (musica?.archivo) {
    const archivo = resolverArchivo(musica.archivo);
    if (!fs.existsSync(archivo)) throw new Error(`Música no encontrada: ${musica.archivo} (${archivo})`);
    mus = { ...musica, archivo };
  }
  const mezcla = construirMezcla({ duracion, pistas, musica: mus, lufs });
  if (!mezcla) {
    fs.copyFileSync(video, salida);
    return { conAudio: false };
  }
  const args = ['-i', video];
  for (const e of mezcla.entradas) args.push('-i', e);
  args.push(
    '-filter_complex',
    mezcla.filtro,
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    salida,
  );
  await ffmpeg(args);
  return { conAudio: true, pistas: pistas.length, musica: !!mus };
}
