#!/usr/bin/env node
// Mide el kit de sonido para sincronizar al milisegundo: duración, dónde cae el pico (picoMs) y volumen
// de cada audio y, en la música, BPM, pulsos, compases, golpes y subida (tools/beats.py con librosa).
//
//   node tools/medir-audio.mjs <archivo|carpeta> [--json <ruta>] [--ritmo] [--convertir]
//
// Con una carpeta escribe <carpeta>/AUDIO.json y, si ya existe, lo fusiona: lo que escribió una persona
// (licencia, fuente, notas o cualquier otro campo que la herramienta no genera) se conserva siempre.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leerArgs } from './lib/args.mjs';
import { medirArchivo } from './lib/audio.mjs';
import { ffmpeg, ejecutar } from './lib/ffmpeg.mjs';
import { ESTUDIO, esPrincipal } from './lib/rutas.mjs';

export const AYUDA = `Uso: node tools/medir-audio.mjs <archivo|carpeta> [opciones]
  --ritmo        BPM, pulsos, compases, golpes y subida (automático si el audio dura más de 12 s)
  --convertir    convierte MP3, OGG, M4A, AAC y FLAC a WAV 48 kHz junto al original y mide el WAV
  --json <ruta>  archivo (o carpeta) donde escribir el resultado; al medir una carpeta, por defecto
                 <carpeta>/AUDIO.json. Un archivo suelto sin --json solo se mide (no se guarda)
  --ayuda        esta ayuda

Formatos: wav, mp3, ogg, m4a, aac, flac. Una carpeta se recorre con sus subcarpetas.
Si el JSON ya existe se fusiona: licencia, fuente, notas y cualquier campo escrito a mano se conservan.
El ritmo usa el Python del estudio (.venv, con librosa) y tarda unos segundos por pista.`;

export const EXTENSIONES = ['.wav', '.mp3', '.ogg', '.m4a', '.aac', '.flac'];
/** A partir de esta duración un audio se trata como música y se le mide el ritmo aunque no se pida. */
export const UMBRAL_RITMO_MS = 12_000;
export const NOMBRE_JSON = 'AUDIO.json';
export const BEATS = path.join(ESTUDIO, 'tools', 'beats.py');

const CAMPOS_PERSONA = ['licencia', 'fuente', 'notas'];
const CAMPOS_RITMO = ['bpm', 'primerPulso', 'subida', 'subidaDb', 'pulsos', 'compases', 'golpes'];
/** Lo que escribe la herramienta; todo lo demás de una entrada lo escribió una persona. */
const GENERADOS = new Set([
  'archivo',
  'original',
  'duracionMs',
  'picoMs',
  'picoDb',
  'rmsDb',
  'aviso',
  'falta',
  ...CAMPOS_RITMO,
]);

const LEEME =
  'Medición del kit de sonido (node tools/medir-audio.mjs del estudio). Cada clave es la ruta del audio desde ' +
  'este archivo; "archivo" es la ruta desde el proyecto, la que va en sonidos[].archivo o musica.archivo. ' +
  'duracionMs y picoMs en milisegundos (picoMs = dónde cae el golpe; el render adelanta el sonido solo). ' +
  'bpm, primerPulso (primer tiempo fuerte), subida, pulsos, compases y golpes en segundos desde el inicio ' +
  'del audio. licencia, fuente y notas los rellena una persona y se conservan al volver a medir.';

export function leerOpciones(argv) {
  const { values, positionals } = leerArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: 'string' },
      ritmo: { type: 'boolean', default: false },
      convertir: { type: 'boolean', default: false },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.ayuda) return { ayuda: true };
  if (positionals.length !== 1) {
    throw new Error(
      'Indica un archivo de audio o una carpeta. Ejemplo: node tools/medir-audio.mjs kit/audio --ritmo --convertir',
    );
  }
  return {
    entrada: path.resolve(positionals[0]),
    json: values.json ? path.resolve(values.json) : null,
    ritmo: values.ritmo,
    convertir: values.convertir,
  };
}

export const esAudio = (ruta) => EXTENSIONES.includes(path.extname(ruta).toLowerCase());
export const esWav = (ruta) => path.extname(ruta).toLowerCase() === '.wav';
const sinExtension = (ruta) => ruta.slice(0, ruta.length - path.extname(ruta).length);

/** Audios de una carpeta y sus subcarpetas, en orden estable. Se saltan las carpetas ocultas (.render-tmp…). */
export function buscarAudios(dir) {
  const out = [];
  const visitar = (d) => {
    const entradas = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entradas) {
      if (e.name.startsWith('.')) continue;
      const ruta = path.join(d, e.name);
      if (e.isDirectory()) visitar(ruta);
      else if (e.isFile() && esAudio(e.name)) out.push(ruta);
    }
  };
  visitar(dir);
  return out;
}

/**
 * Decide qué se mide. Un WAV con el mismo nombre que un MP3 (u otro formato) se toma como su conversión:
 * se mide el WAV y el original queda anotado, para no medir dos veces el mismo sonido. Con convertir, los
 * que no tienen WAV, o lo tienen más antiguo que el original, se convierten.
 * Devuelve [{ medir, original, convertir, aviso }] ordenado por ruta.
 */
export function planificarMedidas(
  archivos,
  { convertir = false, existe = fs.existsSync, mtime = (p) => fs.statSync(p).mtimeMs } = {},
) {
  const plan = [];
  // En Windows X.WAV y x.wav son el mismo archivo.
  const reclamados = new Set();
  const clave = (p) => p.toLowerCase();
  for (const original of archivos.filter((a) => !esWav(a))) {
    const wav = `${sinExtension(original)}.wav`;
    const formato = path.extname(original).slice(1).toUpperCase();
    if (reclamados.has(clave(wav))) {
      plan.push({
        medir: original,
        original: null,
        convertir: false,
        aviso: `Comparte nombre con otro audio: renómbralo para poder convertirlo a WAV.`,
      });
      continue;
    }
    const hayWav = existe(wav);
    if (!hayWav && !convertir) {
      plan.push({
        medir: original,
        original: null,
        convertir: false,
        aviso: `${formato} sin convertir: usa --convertir (puede esconder un retardo al principio).`,
      });
      continue;
    }
    reclamados.add(clave(wav));
    const anticuado = hayWav && mtime(wav) < mtime(original);
    plan.push({
      medir: wav,
      original,
      convertir: convertir && (!hayWav || anticuado),
      aviso: anticuado && !convertir ? `El WAV es más antiguo que ${path.basename(original)}: usa --convertir.` : null,
    });
  }
  for (const wav of archivos.filter(esWav)) {
    if (!reclamados.has(clave(wav))) plan.push({ medir: wav, original: null, convertir: false, aviso: null });
  }
  return plan.sort((a, b) => a.medir.localeCompare(b.medir));
}

/** Argumentos de ffmpeg para pasar un audio a WAV 48 kHz 16 bits (la frecuencia de la mezcla del render). */
export function argsConversion(origen, destino) {
  return ['-i', origen, '-vn', '-map_metadata', '-1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 'wav', destino];
}

/** Convierte por etapas: el WAV final solo aparece si ffmpeg termina bien (un WAV a medias parecería válido). */
export async function convertirAWav(origen, destino) {
  const tmp = `${destino}.tmp`;
  try {
    await ffmpeg(argsConversion(origen, tmp));
    fs.renameSync(tmp, destino);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return destino;
}

export const necesitaRitmo = (medida, { ritmo = false } = {}) => ritmo || medida.duracionMs > UMBRAL_RITMO_MS;

/** Python del entorno virtual del estudio (el que tiene librosa). */
export function rutaPython(estudio = ESTUDIO, plataforma = process.platform) {
  return plataforma === 'win32'
    ? path.join(estudio, '.venv', 'Scripts', 'python.exe')
    : path.join(estudio, '.venv', 'bin', 'python');
}

export const INSTRUCCIONES_VENV =
  'En la carpeta del estudio: npm run instalar (crea el entorno .venv e instala librosa con las versiones de ' +
  'requirements.txt).';

/**
 * Ritmo con tools/beats.py. Lo que no es WAV se decodifica antes con ffmpeg: así pulsos, picos y mezcla
 * salen del mismo decodificador (y librosa no lee M4A ni AAC).
 */
export async function analizarRitmo(archivo, { python = rutaPython(), script = BEATS, correr = ejecutar } = {}) {
  let tmpDir = null;
  let entrada = archivo;
  try {
    if (!esWav(archivo)) {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medir-audio-'));
      entrada = path.join(tmpDir, 'ritmo.wav');
      await ffmpeg(['-i', archivo, '-vn', '-ac', '1', '-ar', '22050', '-c:a', 'pcm_f32le', entrada]);
    }
    let r;
    try {
      r = await correr(python, [script, entrada]);
    } catch (e) {
      throw new Error(`No pude ejecutar ${python} (${e.message}). ${INSTRUCCIONES_VENV}`, { cause: e });
    }
    if (r.codigo !== 0) throw new Error(r.stderr.trim() || `beats.py terminó con código ${r.codigo}`);
    return JSON.parse(r.stdout.toString());
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Carpeta del proyecto (la que tiene proyecto.json) que contiene `dir`, o null. */
export function buscarProyecto(dir, existe = fs.existsSync) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (existe(path.join(d, 'proyecto.json'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

/** Ruta relativa con barras /, igual en Windows que en el resto (es la que se escribe en las escenas). */
export const rutaRelativa = (desde, hasta) => path.relative(desde, hasta).split(path.sep).join('/');

const tieneValor = (v) => v !== null && v !== undefined && v !== '';
const elegir = (obj, campos) =>
  Object.fromEntries(campos.filter((c) => obj?.[c] !== undefined).map((c) => [c, obj[c]]));
const dePersona = (entrada = {}) => Object.fromEntries(Object.entries(entrada).filter(([k]) => !GENERADOS.has(k)));
const tieneDatosDePersona = (entrada) => Object.values(dePersona(entrada)).some(tieneValor);

/** Campos de persona de varias entradas; un hueco vacío (null, "") nunca pisa un valor ya escrito. */
function combinarPersona(...entradas) {
  const out = {};
  for (const e of entradas) {
    for (const [k, v] of Object.entries(dePersona(e))) if (tieneValor(v) || !(k in out)) out[k] = v;
  }
  return out;
}

/**
 * Entrada de AUDIO.json para un audio recién medido.
 *   nueva: { clave, archivo?, original?, medida, ritmo?, aviso? }
 *   vieja: la entrada anterior de esa clave; heredada: la de su original (si se acaba de convertir).
 */
export function entradaAudio(nueva, vieja = {}, heredada = {}) {
  const { medida, ritmo } = nueva;
  // Si esta vez no se analizó el ritmo pero el archivo es el mismo (misma duración), el anterior sigue valiendo.
  const mismoArchivo = vieja.bpm !== undefined && Math.abs((vieja.duracionMs ?? -1e9) - medida.duracionMs) <= 1;
  const datosRitmo = ritmo ? elegir(ritmo, CAMPOS_RITMO) : mismoArchivo ? elegir(vieja, CAMPOS_RITMO) : {};
  const avisos = [nueva.aviso, ritmo?.aviso].filter(Boolean);
  const { pulsos, compases, golpes, ...escalares } = datosRitmo;
  return {
    archivo: nueva.archivo,
    original: nueva.original,
    ...combinarPersona(Object.fromEntries(CAMPOS_PERSONA.map((c) => [c, null])), heredada, vieja),
    duracionMs: medida.duracionMs,
    picoMs: medida.picoMs,
    picoDb: medida.picoDb,
    rmsDb: medida.rmsDb,
    ...escalares,
    aviso: avisos.length ? avisos.join(' ') : undefined,
    // Las listas largas al final: así lo que se lee de un vistazo queda arriba.
    pulsos,
    compases,
    golpes,
  };
}

/**
 * Fusiona la medición con el AUDIO.json anterior.
 *   - Campos generados (medida y ritmo): se reescriben. Cualquier otro (licencia, fuente, notas…) se conserva.
 *   - Un WAV recién convertido hereda lo escrito a mano en la entrada de su original, que desaparece.
 *   - completo (se midió la carpeta entera): los audios que ya no están se quitan, salvo que tengan algo
 *     escrito por una persona; esos se quedan marcados con "falta" para que nadie pierda una licencia.
 *   - conservar: claves que no se pudieron medir esta vez y se dejan como estaban.
 */
export function fusionarAudioJSON(
  anterior,
  nuevas,
  { fecha = new Date().toISOString(), completo = true, conservar = [] } = {},
) {
  const base = anterior && typeof anterior === 'object' && !Array.isArray(anterior) ? anterior : {};
  const viejas = base.archivos && typeof base.archivos === 'object' ? base.archivos : {};
  const archivos = {};
  const absorbidas = new Set(nuevas.map((n) => n.original).filter(Boolean));
  for (const n of nuevas) archivos[n.clave] = entradaAudio(n, viejas[n.clave], n.original ? viejas[n.original] : {});
  for (const [clave, entrada] of Object.entries(viejas)) {
    if (clave in archivos || absorbidas.has(clave)) continue;
    if (!completo || conservar.includes(clave)) archivos[clave] = entrada;
    else if (tieneDatosDePersona(entrada)) archivos[clave] = { ...entrada, falta: true };
  }
  const ordenadas = Object.fromEntries(
    Object.keys(archivos)
      .sort()
      .map((k) => [k, archivos[k]]),
  );
  return { ...base, leeme: LEEME, actualizado: fecha, archivos: ordenadas };
}

/** JSON con sangría de 2, pero cada lista de valores simples (pulsos, golpes…) en una sola línea. */
export function jsonLegible(valor, sangria = '') {
  if (valor && typeof valor.toJSON === 'function') return jsonLegible(valor.toJSON(), sangria);
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  const dentro = `${sangria}  `;
  if (Array.isArray(valor)) {
    if (valor.every((v) => v === null || typeof v !== 'object')) {
      return `[${valor.map((v) => JSON.stringify(v) ?? 'null').join(', ')}]`;
    }
    return `[\n${valor.map((v) => dentro + jsonLegible(v, dentro)).join(',\n')}\n${sangria}]`;
  }
  const claves = Object.keys(valor).filter((k) => valor[k] !== undefined && typeof valor[k] !== 'function');
  if (!claves.length) return '{}';
  const lineas = claves.map((k) => `${dentro}${JSON.stringify(k)}: ${jsonLegible(valor[k], dentro)}`);
  return `{\n${lineas.join(',\n')}\n${sangria}}`;
}

/** Lee un AUDIO.json existente. Si está roto se para: nunca se pisa a ciegas un archivo editado a mano. */
export function leerAudioJSON(ruta) {
  if (!fs.existsSync(ruta)) return null;
  const texto = fs.readFileSync(ruta, 'utf8').replace(/^\uFEFF/, ''); // el Bloc de notas añade BOM
  try {
    return JSON.parse(texto);
  } catch (e) {
    throw new Error(`${ruta} no es un JSON válido (${e.message}). Arréglalo o renómbralo y vuelve a medir.`, {
      cause: e,
    });
  }
}

function escribirAtomico(ruta, texto) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const tmp = `${ruta}.tmp`;
  fs.writeFileSync(tmp, texto);
  fs.renameSync(tmp, ruta);
}

const num = (v, dec) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(dec) : '');

/** Tabla de texto con una fila por audio. filas: [{ nombre, duracionMs, picoMs, picoDb, rmsDb, bpm, primerPulso, subida }] */
export function tablaMedidas(filas) {
  const columnas = [
    ['Archivo', (f) => f.nombre, 'izq'],
    ['Duración', (f) => (typeof f.duracionMs === 'number' ? `${num(f.duracionMs / 1000, 2)} s` : '')],
    ['Pico', (f) => (typeof f.picoMs === 'number' ? `${num(f.picoMs, 1)} ms` : '')],
    ['Pico dB', (f) => num(f.picoDb, 1)],
    ['RMS dB', (f) => num(f.rmsDb, 1)],
    ['BPM', (f) => (f.bpm ? num(f.bpm, 2) : '')],
    ['1.er pulso', (f) => (typeof f.primerPulso === 'number' ? `${num(f.primerPulso, 3)} s` : '')],
    ['Subida', (f) => (typeof f.subida === 'number' ? `${num(f.subida, 3)} s` : '')],
  ];
  const celdas = [columnas.map(([t]) => t), ...filas.map((f) => columnas.map(([, fn]) => String(fn(f))))];
  const anchos = columnas.map((_, i) => Math.max(...celdas.map((fila) => fila[i].length)));
  const linea = (fila) =>
    fila
      .map((c, i) => (columnas[i][2] === 'izq' ? c.padEnd(anchos[i]) : c.padStart(anchos[i])))
      .join('  ')
      .trimEnd();
  return [linea(celdas[0]), anchos.map((a) => '─'.repeat(a)).join('  '), ...celdas.slice(1).map(linea)].join('\n');
}

/**
 * Mide un archivo o una carpeta. Las dependencias con disco, ffmpeg y Python se pueden inyectar (tests).
 * Devuelve { filas, fallos, destinoJSON, resultado }.
 */
export async function medirAudio(
  entrada,
  {
    json = null,
    ritmo = false,
    convertir = false,
    log = console.log,
    medir = medirArchivo,
    analizar = analizarRitmo,
    convertirArchivo = convertirAWav,
    python = rutaPython(),
    fecha,
  } = {},
) {
  if (!fs.existsSync(entrada)) throw new Error(`No existe: ${entrada}`);
  const esCarpeta = fs.statSync(entrada).isDirectory();
  let archivos;
  if (esCarpeta) {
    archivos = buscarAudios(entrada);
    if (!archivos.length) throw new Error(`No hay audios (${EXTENSIONES.join(', ')}) en ${entrada}`);
  } else {
    if (!esAudio(entrada)) throw new Error(`${path.basename(entrada)} no es un audio (${EXTENSIONES.join(', ')}).`);
    archivos = [entrada];
  }
  // --json con una carpeta que ya existe: el AUDIO.json va dentro (escribir encima de una carpeta no puede ser).
  const jsonEnCarpeta = json && fs.existsSync(json) && fs.statSync(json).isDirectory();
  const destinoJSON = jsonEnCarpeta
    ? path.join(json, NOMBRE_JSON)
    : (json ?? (esCarpeta ? path.join(entrada, NOMBRE_JSON) : null));
  const dirClaves = destinoJSON ? path.dirname(destinoJSON) : esCarpeta ? entrada : path.dirname(entrada);
  // Se lee antes de medir: si está roto, mejor saberlo ahora que después de un minuto de análisis.
  const anterior = destinoJSON ? leerAudioJSON(destinoJSON) : null;
  const hayPython = fs.existsSync(python);
  if (ritmo && !hayPython) throw new Error(`Falta el Python del estudio (${python}). ${INSTRUCCIONES_VENV}`);
  // "archivo" es la ruta desde el proyecto que contiene los audios, se guarde donde se guarde el JSON.
  const proyecto = buscarProyecto(esCarpeta ? entrada : path.dirname(entrada));

  const plan = planificarMedidas(archivos, { convertir });
  const nuevas = [];
  const fallos = [];
  for (const item of plan) {
    const clave = rutaRelativa(dirClaves, item.medir);
    try {
      if (item.convertir) {
        log(`  convirtiendo ${rutaRelativa(dirClaves, item.original)} → ${clave}`);
        await convertirArchivo(item.original, item.medir);
      }
      const medida = await medir(item.medir);
      const avisos = [item.aviso];
      let datosRitmo = null;
      if (necesitaRitmo(medida, { ritmo })) {
        if (!hayPython) avisos.push('Sin ritmo: falta el Python del estudio (.venv con librosa).');
        else {
          log(`  analizando el ritmo de ${clave} (tarda unos segundos)…`);
          try {
            datosRitmo = await analizar(item.medir, { python });
          } catch (e) {
            avisos.push(`No se pudo medir el ritmo: ${e.message}`);
          }
        }
      }
      nuevas.push({
        clave,
        archivo: proyecto ? rutaRelativa(proyecto, item.medir) : undefined,
        original: item.original ? rutaRelativa(dirClaves, item.original) : undefined,
        medida,
        ritmo: datosRitmo,
        aviso: avisos.filter(Boolean).join(' ') || undefined,
      });
    } catch (e) {
      fallos.push({ clave, error: e.message });
    }
  }

  let resultado = null;
  let entradas;
  if (destinoJSON) {
    resultado = fusionarAudioJSON(anterior, nuevas, {
      fecha,
      completo: esCarpeta,
      conservar: fallos.map((f) => f.clave),
    });
    escribirAtomico(destinoJSON, `${jsonLegible(resultado)}\n`);
    entradas = resultado.archivos;
  } else {
    entradas = Object.fromEntries(nuevas.map((n) => [n.clave, entradaAudio(n)]));
  }
  // La tabla sale de las entradas finales: así enseña también el ritmo conservado de una medición anterior.
  const filas = nuevas.map((n) => ({ nombre: n.clave, ...entradas[n.clave] }));
  return { filas, fallos, destinoJSON, resultado };
}

/** Avisos y consejos que siguen a la tabla (licencias por rellenar, tempo para proyecto.json). */
export function consejos({ filas, fallos, resultado }) {
  const out = [];
  for (const f of filas) if (f.aviso) out.push(`⚠ ${f.nombre}: ${f.aviso}`);
  for (const f of fallos) out.push(`❌ ${f.clave}: ${f.error}`);
  if (resultado) {
    const entradas = Object.entries(resultado.archivos);
    const sinLicencia = entradas.filter(([, e]) => !e.falta && !tieneValor(e.licencia)).map(([k]) => k);
    if (sinLicencia.length) out.push(`⚠ Sin licencia anotada (rellena licencia y fuente): ${sinLicencia.join(', ')}`);
    const faltan = entradas.filter(([, e]) => e.falta).map(([k]) => k);
    if (faltan.length) {
      out.push(
        `⚠ Ya no están en la carpeta (se conservan por lo escrito a mano; bórralos si sobran): ${faltan.join(', ')}`,
      );
    }
  }
  for (const f of filas.filter((x) => x.bpm > 0 && typeof x.primerPulso === 'number')) {
    out.push(
      `♪ ${f.nombre}: tempo para proyecto.json si la música suena desde el segundo 0 del vídeo → ` +
        `"tempo": { "bpm": ${f.bpm}, "primerPulso": ${f.primerPulso} }` +
        (typeof f.subida === 'number' ? ` · subida en ${f.subida} s` : ''),
    );
  }
  return out;
}

if (esPrincipal(import.meta.url)) {
  try {
    const op = leerOpciones(process.argv.slice(2));
    if (op.ayuda) console.log(AYUDA);
    else {
      console.log(`Midiendo ${op.entrada}…`);
      const r = await medirAudio(op.entrada, op);
      if (r.filas.length) console.log(`\n${tablaMedidas(r.filas)}\n`);
      for (const linea of consejos(r)) console.log(linea);
      if (r.fallos.length) {
        console.error(`❌ ${r.fallos.length} audio(s) no se pudieron medir (ver arriba).`);
        process.exit(1);
      }
      const n = r.filas.length;
      console.log(
        r.destinoJSON
          ? `✅ ${n} audio(s) medidos → ${r.destinoJSON}`
          : `✅ ${n} audio(s) medidos (sin --json no se guarda).`,
      );
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
