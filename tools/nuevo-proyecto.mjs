#!/usr/bin/env node
// Crea la carpeta de un proyecto de vídeo a partir de templates/proyecto (proyecto.json, brief.md, LOOK.md,
// guion.md, README.md…) y las carpetas de trabajo (kit/…, escenas, revision, salida).
//
//   node tools/nuevo-proyecto.mjs <carpeta> [--nombre X] [--repo ruta] [--url https://...]
//
// Nunca sobrescribe: lo que ya existe se queda como está y se dice. Así se puede volver a ejecutar sobre un
// proyecto a medias para completar lo que falte sin perder nada.

import fs from 'node:fs';
import path from 'node:path';
import { leerArgs } from './lib/args.mjs';
import { ESTUDIO, VIDEOS, esPrincipal } from './lib/rutas.mjs';
import { jsonLegible } from './medir-audio.mjs';

export const AYUDA = `Uso: node tools/nuevo-proyecto.mjs <carpeta> [opciones]
  --nombre X     nombre del producto (por defecto, el de la carpeta)
  --repo ruta    repo del producto (solo lectura; queda anotado en proyecto.json y brief.md)
  --url https:…  web o app de la que sacar capturas reales
  --ayuda        esta ayuda

<carpeta> sin barras (p. ej. MiProducto) se crea dentro de ${VIDEOS}.
Nunca sobrescribe archivos: si ya existen los deja como están.`;

export const PLANTILLAS = path.join(ESTUDIO, 'templates', 'proyecto');
export const CARPETAS = [
  'kit/capturas',
  'kit/audio',
  'kit/fuentes',
  'kit/marca',
  'kit/referencias',
  'escenas',
  'revision',
  'salida',
];
/** Lo que se escribe en los textos cuando un dato no se ha dado (en el JSON queda null). */
export const VACIOS = { REPO: '(sin repo)', URL: '(sin URL)' };
const EXT_TEXTO = new Set(['.md', '.json', '.js', '.mjs', '.txt', '.html', '.css', '.svg']);
const MARCADOR = /__([A-Z][A-Z0-9_]*)__/g;

export function leerOpciones(argv) {
  const { values, positionals } = leerArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      nombre: { type: 'string' },
      repo: { type: 'string' },
      url: { type: 'string' },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.ayuda) return { ayuda: true };
  if (positionals.length !== 1)
    throw new Error('Indica la carpeta del proyecto. Ejemplo: node tools/nuevo-proyecto.mjs MiApp');
  return { carpeta: positionals[0], nombre: values.nombre, repo: values.repo, url: values.url };
}

/**
 * Carpeta del proyecto. Un nombre suelto ("MiProducto") va a la carpeta de vídeos (videos/), que es donde viven
 * los proyectos; si no, al ejecutarlo desde la raíz del estudio el proyecto acabaría mezclado con el código.
 */
export function resolverCarpeta(arg, { cwd = process.cwd(), videos = VIDEOS } = {}) {
  const texto = String(arg).trim();
  if (!texto) throw new Error('La carpeta del proyecto está vacía.');
  const suelto = !/[\\/]/.test(texto) && !path.isAbsolute(texto) && texto !== '.' && texto !== '..';
  return suelto ? path.join(videos, texto) : path.resolve(cwd, texto);
}

const dentroDe = (padre, hijo) => {
  const rel = path.relative(path.resolve(padre), path.resolve(hijo));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** AAAA-MM-DD en hora local (la fecha que ve el usuario, no la de UTC). */
export function fechaISO(fecha = new Date()) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** Valores de los marcadores. REPO y URL quedan null si no se dan (los textos ponen VACIOS). */
export function valoresProyecto({ carpeta, nombre, repo, url, fecha = new Date(), cwd = process.cwd() }) {
  const limpio = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const rutaRepo = limpio(repo);
  return {
    NOMBRE: limpio(nombre) ?? path.basename(path.resolve(carpeta)),
    REPO: rutaRepo ? path.resolve(cwd, rutaRepo) : null,
    URL: limpio(url),
    FECHA: fechaISO(fecha),
  };
}

/**
 * Sustituye __CLAVE__ por su valor. Un valor null se escribe como VACIOS[CLAVE]; los marcadores que no
 * están en `valores` se dejan tal cual (pueden ser de una plantilla nueva que esta herramienta no conoce).
 */
export function rellenarPlantilla(texto, valores) {
  // Con función de reemplazo: un valor con "$&" o "$1" (rutas, URLs) se copia literal.
  return String(texto).replace(MARCADOR, (marca, clave) => {
    if (!Object.hasOwn(valores, clave)) return marca;
    return String(valores[clave] ?? VACIOS[clave] ?? '');
  });
}

/**
 * Rellena un objeto JSON (sin modificarlo). Una cadena que es exactamente un marcador sin valor pasa a null
 * (así "repo": null es JSON válido y se distingue de una ruta); dentro de un texto más largo se usa VACIOS.
 */
export function rellenarProyecto(obj, valores) {
  if (typeof obj === 'string') {
    const exacto = /^__([A-Z][A-Z0-9_]*)__$/.exec(obj);
    if (exacto && Object.hasOwn(valores, exacto[1]) && valores[exacto[1]] == null) return null;
    return rellenarPlantilla(obj, valores);
  }
  if (Array.isArray(obj)) return obj.map((v) => rellenarProyecto(v, valores));
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, rellenarProyecto(v, valores)]));
  }
  return obj;
}

/** Archivos de la plantilla (rutas relativas con /), incluidas subcarpetas. */
export function listarPlantillas(dir) {
  const out = [];
  const visitar = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) visitar(r);
      else if (e.isFile()) out.push(r);
    }
  };
  visitar('');
  return out.sort();
}

/** Contenido final de un archivo de plantilla: JSON rellenado como objeto, texto con marcadores, binario tal cual. */
export function contenidoRellenado(rel, datos, valores) {
  const ext = path.extname(rel).toLowerCase();
  if (!EXT_TEXTO.has(ext)) return datos;
  const texto = datos.toString('utf8');
  if (ext === '.json') {
    try {
      // jsonLegible deja "formatos": ["16:9", "9:16"] en una línea, como la plantilla (y como lo deja Prettier).
      return `${jsonLegible(rellenarProyecto(JSON.parse(texto), valores))}\n`;
    } catch {
      // Plantilla JSON rota: se rellena como texto y crearProyecto avisa de que el resultado no es JSON válido.
    }
  }
  return rellenarPlantilla(texto, valores);
}

/**
 * Crea (o completa) un proyecto. Devuelve { carpeta, valores, archivos, carpetas, avisos } donde cada
 * archivo y carpeta lleva estado 'creado' / 'ya existía'.
 */
export function crearProyecto({
  carpeta,
  nombre,
  repo,
  url,
  fecha = new Date(),
  plantillas = PLANTILLAS,
  estudio = ESTUDIO,
  videos = path.join(estudio, 'videos'),
  cwd,
} = {}) {
  const destino = path.resolve(carpeta);
  // Dentro del estudio solo vale videos/<proyecto>: es la única carpeta que git ignora. En cualquier otro sitio del
  // estudio el proyecto se mezclaría con el código (y se subiría al repo); y nunca puede contener al estudio.
  const enVideos = dentroDe(videos, destino) && path.resolve(videos) !== destino;
  if (dentroDe(destino, estudio) || (dentroDe(estudio, destino) && !enVideos)) {
    throw new Error(
      `El proyecto no puede estar dentro del código del estudio ni contenerlo (${destino}). ` +
        `Usa videos/<nombre> (por ejemplo: node tools/nuevo-proyecto.mjs MiApp) o una carpeta fuera del estudio.`,
    );
  }
  if (fs.existsSync(destino) && !fs.statSync(destino).isDirectory()) {
    throw new Error(`${destino} existe y no es una carpeta.`);
  }
  if (!fs.existsSync(plantillas)) throw new Error(`No encuentro las plantillas en ${plantillas}.`);

  const valores = valoresProyecto({ carpeta: destino, nombre, repo, url, fecha, cwd });
  const avisos = [];
  const carpetas = [];
  const archivos = [];

  const crearCarpeta = (rel) => {
    const abs = rel ? path.join(destino, rel) : destino;
    const existia = fs.existsSync(abs);
    fs.mkdirSync(abs, { recursive: true });
    carpetas.push({ ruta: rel || '.', estado: existia ? 'ya existía' : 'creado' });
  };
  crearCarpeta('');

  for (const rel of listarPlantillas(plantillas)) {
    const abs = path.join(destino, ...rel.split('/'));
    const contenido = contenidoRellenado(rel, fs.readFileSync(path.join(plantillas, ...rel.split('/'))), valores);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    try {
      // 'wx' crea solo si no existe, en una única operación: nunca pisa un archivo, ni aunque aparezca a la vez.
      fs.writeFileSync(abs, contenido, { flag: 'wx' });
      archivos.push({ ruta: rel, estado: 'creado' });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      archivos.push({ ruta: rel, estado: 'ya existía' });
      continue;
    }
    if (typeof contenido !== 'string') continue;
    const restos = [...new Set(contenido.match(MARCADOR) ?? [])];
    if (restos.length) avisos.push(`${rel}: marcadores sin rellenar ${restos.join(', ')}.`);
    if (rel.toLowerCase().endsWith('.json')) {
      try {
        JSON.parse(contenido);
      } catch (e) {
        avisos.push(`${rel} no es JSON válido (${e.message}): revisa la plantilla.`);
      }
    }
  }

  for (const rel of CARPETAS) crearCarpeta(rel);

  if (valores.REPO && !fs.existsSync(valores.REPO)) {
    avisos.push(`El repo ${valores.REPO} no existe (¿ruta mal escrita?). Queda anotado; corrígelo en proyecto.json.`);
  }
  if (valores.URL && !/^https?:\/\//i.test(valores.URL)) {
    avisos.push(`La URL "${valores.URL}" no empieza por http:// o https://.`);
  }
  return { carpeta: destino, valores, archivos, carpetas, avisos };
}

/** Texto del resumen para la consola. */
export function resumen({ carpeta, valores, archivos, carpetas, avisos }, estudio = ESTUDIO) {
  const barras = (p) => p.split(path.sep).join('/');
  const herramienta = (n) => `node "${barras(path.join(estudio, 'tools', n))}"`;
  const dir = barras(carpeta);
  const nuevas = carpetas.filter((c) => c.estado === 'creado' && c.ruta !== '.').map((c) => c.ruta);
  const lineas = [
    `✅ Proyecto "${valores.NOMBRE}" en ${carpeta}`,
    ...archivos.map((a) => `   ${a.estado.padEnd(10)}  ${a.ruta}`),
    `   carpetas    ${nuevas.length ? `creadas: ${nuevas.join(', ')}` : 'ya existían todas'}`,
    `   repo: ${valores.REPO ?? VACIOS.REPO} · URL: ${valores.URL ?? VACIOS.URL} · fecha: ${valores.FECHA}`,
    ...avisos.map((a) => `⚠ ${a}`),
    '',
    'Siguientes pasos:',
    '  1. La historia: rellena brief.md con /youtubeman (o a mano). Nada de datos inventados.',
    '  2. Material real en kit/: capturas, logo (kit/marca), fuentes (kit/fuentes) y audio con licencia (kit/audio).',
    `  3. Mide el audio:  ${herramienta('medir-audio.mjs')} "${dir}/kit/audio" --ritmo --convertir`,
    `  4. Mira una escena: ${herramienta('vista-previa.mjs')} --proyecto "${dir}" --modulo escenas/01-gancho/escena.js --abrir`,
  ];
  return lineas.join('\n');
}

if (esPrincipal(import.meta.url)) {
  try {
    const op = leerOpciones(process.argv.slice(2));
    if (op.ayuda) console.log(AYUDA);
    else {
      const r = crearProyecto({ ...op, carpeta: resolverCarpeta(op.carpeta) });
      console.log(resumen(r));
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
