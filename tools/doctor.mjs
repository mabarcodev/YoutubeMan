#!/usr/bin/env node
// Diagnóstico del estudio: comprueba que está todo lo necesario para renderizar y dice cómo arreglar lo que
// falte. Lo primero que se ejecuta en una sesión de youtubeman (y si algo deja de funcionar).
//
//   node tools/doctor.mjs [--json] [--limite 30]
//
// Obligatorio: Node >= 22, ffmpeg y ffprobe (con libx264, aac, tmix y loudnorm), el Chromium de Playwright y el
// Python del estudio con librosa (ritmo de la música): sin él la música no se sincroniza igual y los vídeos no
// salen como deben. Opcional (⚠): git y una fuente del sistema para las marcas de tiempo de revisar.mjs. Sale con
// código 1 si falla algo obligatorio.
//
// Cada comprobación recibe sus dependencias (ejecutar, existe, lanzar…) para poder probarla sin el sistema real.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { leerArgs } from './lib/args.mjs';
import { resolverBinario } from './lib/ffmpeg.mjs';
import { ESTUDIO, esPrincipal } from './lib/rutas.mjs';
import { filtroMarcaTiempo } from './revisar.mjs';
import { rutaPython, INSTRUCCIONES_VENV } from './medir-audio.mjs';

export const AYUDA = `Uso: node tools/doctor.mjs [opciones]
  --json         resultado en JSON (para agentes)
  --limite 30    segundos máximos para que arranque Chromium
  --ayuda        esta ayuda

Sale con código 1 si falta algo obligatorio (Node, ffmpeg, ffprobe, Chromium, Python con librosa).`;

export const NODE_MINIMO = 22;
const INSTALAR_FFMPEG = 'winget install --id Gyan.FFmpeg -e --source winget (y abre una consola nueva)';
/** Lo que el render y la mezcla usan de ffmpeg: sin ello fallan a mitad de un render. */
export const REQUISITOS_FFMPEG = {
  encoders: ['libx264', 'aac'],
  filters: ['tmix', 'loudnorm', 'amix', 'adelay'],
};

const resultado = (id, nombre, obligatorio, estado, detalle, arreglo) => ({
  id,
  nombre,
  obligatorio,
  estado,
  detalle,
  ...(arreglo ? { arreglo } : {}),
});

/** Ejecuta un programa sin lanzar nunca: si no existe, codigo es null. */
export function ejecutarComando(bin, args, { timeout = 20_000 } = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout, windowsHide: true });
  return { codigo: r.status, salida: `${r.stdout ?? ''}${r.stderr ?? ''}`, error: r.error?.message ?? null };
}

export function comprobarNode(version = process.versions.node) {
  const mayor = Number(String(version).split('.')[0]);
  if (mayor >= NODE_MINIMO) return resultado('node', 'Node.js', true, 'ok', `v${version}`);
  return resultado(
    'node',
    'Node.js',
    true,
    'error',
    `v${version}; hace falta ${NODE_MINIMO} o más`,
    'Instala Node LTS: winget install OpenJS.NodeJS.LTS (o https://nodejs.org) y abre una consola nueva.',
  );
}

/** Lista de nombres de la tabla de `ffmpeg -encoders` o `-filters` (segunda columna). */
export function nombresTabla(salida) {
  const nombres = new Set();
  for (const linea of String(salida).split(/\r?\n/)) {
    const m = /^\s*[A-Z.|]{2,}\s+(\S+)/.exec(linea);
    if (m) nombres.add(m[1]);
  }
  return nombres;
}

/**
 * ffmpeg o ffprobe: que exista, su versión y (en ffmpeg) que traiga lo que usan el render y la mezcla.
 * Que esté fuera del PATH no es un fallo: tools/lib/ffmpeg.mjs lo busca también en la carpeta de winget.
 */
export function comprobarBinario(nombre, { resolver = resolverBinario, ejecutar = ejecutarComando, requisitos } = {}) {
  let bin;
  try {
    bin = resolver(nombre);
  } catch {
    return resultado(nombre, nombre, true, 'error', 'no encontrado', `Instálalo: ${INSTALAR_FFMPEG}.`);
  }
  const r = ejecutar(bin, ['-version']);
  const version = /version\s+(\S+)/.exec(r.salida)?.[1] ?? 'versión desconocida';
  const donde = bin === nombre ? '' : ` · ${bin} (fuera del PATH de esta consola; el estudio lo encuentra igual)`;
  if (requisitos) {
    const faltan = [];
    for (const [tipo, lista] of Object.entries(requisitos)) {
      const hay = nombresTabla(ejecutar(bin, ['-hide_banner', `-${tipo}`]).salida);
      faltan.push(...lista.filter((x) => !hay.has(x)));
    }
    if (faltan.length) {
      return resultado(
        nombre,
        nombre,
        true,
        'error',
        `${version}, pero le falta: ${faltan.join(', ')}`,
        `Instala la compilación completa: ${INSTALAR_FFMPEG}.`,
      );
    }
  }
  return resultado(nombre, nombre, true, 'ok', `${version}${donde}`);
}

async function lanzarChromiumReal(limiteMs) {
  // Import dinámico: si faltan las dependencias npm, el doctor tiene que poder decirlo en vez de no arrancar.
  const { chromium } = await import('playwright');
  const navegador = await chromium.launch({ timeout: limiteMs });
  try {
    return navegador.version();
  } finally {
    await navegador.close();
  }
}

/** El Chromium de Playwright arranca y se cierra antes de `limiteMs`. */
export async function comprobarChromium({ lanzar = lanzarChromiumReal, limiteMs = 30_000 } = {}) {
  const nombre = 'Chromium (Playwright)';
  const t0 = Date.now();
  let temporizador;
  try {
    const limite = new Promise((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error(`no arrancó en ${limiteMs / 1000} s`)), limiteMs);
    });
    const version = await Promise.race([lanzar(limiteMs), limite]);
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    return resultado('chromium', nombre, true, 'ok', `${version ? `versión ${version}, ` : ''}arranca en ${s} s`);
  } catch (e) {
    const sinPaquete = e?.code === 'ERR_MODULE_NOT_FOUND';
    return resultado(
      'chromium',
      nombre,
      true,
      'error',
      sinPaquete ? 'falta el paquete playwright' : String(e?.message ?? e).split('\n')[0],
      sinPaquete
        ? 'En _estudio: npm install y después npx playwright install chromium.'
        : 'En _estudio: npx playwright install chromium (si sigue fallando, reinicia y vuelve a probar).',
    );
  } finally {
    clearTimeout(temporizador);
  }
}

/** Python del estudio con librosa: mide el ritmo de la música (BPM, pulsos y subida). Obligatorio. */
export function comprobarPython({ python = rutaPython(), existe = fs.existsSync, ejecutar = ejecutarComando } = {}) {
  const nombre = 'Python con librosa (ritmo de la música)';
  if (!existe(python)) {
    return resultado('python', nombre, true, 'error', `no hay entorno en ${python}`, INSTRUCCIONES_VENV);
  }
  const r = ejecutar(python, ['-c', 'import librosa, soundfile; print(librosa.__version__)'], { timeout: 90_000 });
  if (r.codigo !== 0) {
    return resultado('python', nombre, true, 'error', 'el entorno existe pero no carga librosa', INSTRUCCIONES_VENV);
  }
  return resultado('python', nombre, true, 'ok', `librosa ${r.salida.trim().split(/\s+/).pop()}`);
}

export function comprobarGit({ ejecutar = ejecutarComando } = {}) {
  const r = ejecutar('git', ['--version']);
  if (r.codigo !== 0) {
    return resultado(
      'git',
      'git',
      false,
      'aviso',
      'no encontrado',
      'winget install --id Git.Git -e (para versionar el estudio).',
    );
  }
  return resultado('git', 'git', false, 'ok', r.salida.trim().replace(/^git version\s*/, ''));
}

/** Fuente que usa revisar.mjs para la marca de tiempo de las hojas de contactos (sin ella salen sin marca). */
export function comprobarFuente({ existe = fs.existsSync } = {}) {
  const nombre = 'Fuente para las marcas de tiempo';
  let fuente = null;
  // Se reutiliza la búsqueda de revisar.mjs para no mantener dos listas de fuentes.
  const filtro = filtroMarcaTiempo(0, (f) => {
    if (!existe(f)) return false;
    fuente ??= f;
    return true;
  });
  if (filtro) return resultado('fuente', nombre, false, 'ok', fuente);
  return resultado(
    'fuente',
    nombre,
    false,
    'aviso',
    'no hay Arial, Segoe UI ni DejaVu Sans',
    'Las hojas de contactos de revisar.mjs saldrán sin marca de tiempo. Instala Arial o DejaVu Sans.',
  );
}

/** Ejecuta todas las comprobaciones en orden. `dep` permite sustituir cada dependencia (tests). */
export async function diagnosticar(dep = {}) {
  const ejecutar = dep.ejecutar ?? ejecutarComando;
  const resolver = dep.resolver ?? resolverBinario;
  return [
    comprobarNode(dep.versionNode),
    comprobarBinario('ffmpeg', { resolver, ejecutar, requisitos: REQUISITOS_FFMPEG }),
    comprobarBinario('ffprobe', { resolver, ejecutar }),
    await comprobarChromium({ lanzar: dep.lanzar, limiteMs: dep.limiteMs }),
    comprobarPython({ python: dep.python, existe: dep.existe, ejecutar }),
    comprobarGit({ ejecutar }),
    comprobarFuente({ existe: dep.existe }),
  ];
}

/** 1 si falla algo obligatorio; los avisos de lo opcional no cuentan. */
export const codigoSalida = (resultados) => (resultados.some((r) => r.obligatorio && r.estado === 'error') ? 1 : 0);

const ICONO = { ok: '✅', aviso: '⚠', error: '❌' };

export function informe(resultados, estudio = ESTUDIO) {
  const lineas = [`Diagnóstico del estudio youtubeman (${estudio})`, ''];
  for (const r of resultados) {
    lineas.push(`${ICONO[r.estado]} ${r.nombre}${r.obligatorio ? '' : ' (opcional)'}: ${r.detalle}`);
    if (r.arreglo && r.estado !== 'ok') lineas.push(`   → ${r.arreglo}`);
  }
  lineas.push('');
  if (codigoSalida(resultados)) {
    lineas.push('❌ Falta algo obligatorio: arréglalo con las instrucciones de arriba y vuelve a ejecutar el doctor.');
  } else if (resultados.some((r) => r.estado !== 'ok')) {
    lineas.push('✅ Lo obligatorio está listo (hay avisos en lo opcional).');
  } else {
    lineas.push('✅ Todo listo.');
  }
  return lineas.join('\n');
}

export function leerOpciones(argv) {
  const { values } = leerArgs({
    args: argv,
    strict: true,
    options: {
      json: { type: 'boolean', default: false },
      limite: { type: 'string', default: '30' },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.ayuda) return { ayuda: true };
  const limite = Number(values.limite);
  if (!(limite > 0))
    throw new Error(`--limite debe ser un número de segundos mayor que 0 (recibido: ${values.limite}).`);
  return { json: values.json, limiteMs: limite * 1000 };
}

if (esPrincipal(import.meta.url)) {
  try {
    const op = leerOpciones(process.argv.slice(2));
    if (op.ayuda) console.log(AYUDA);
    else {
      const resultados = await diagnosticar({ limiteMs: op.limiteMs });
      console.log(
        op.json ? JSON.stringify({ ok: !codigoSalida(resultados), resultados }, null, 2) : informe(resultados),
      );
      // exit explícito: si Chromium se quedó colgado tras el límite, el proceso no debe quedarse esperándolo.
      process.exit(codigoSalida(resultados));
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
