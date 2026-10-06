#!/usr/bin/env node
// Instala el estudio en un solo comando, también recién clonado, con las mismas versiones en cualquier ordenador:
//   0. las librerías de Node (npm ci, versiones exactas de package-lock.json), si aún no están,
//   1. el Chromium de Playwright (la versión que fija package-lock.json),
//   2. el entorno de Python del estudio (.venv) con librosa y compañía (versiones de requirements.txt),
//   3. el diagnóstico (doctor.mjs), que sale con 1 si aún falta algo.
//
//   npm run instalar            (o node tools/preparar.mjs; npm run preparar es el nombre antiguo)
//
// Funciona antes de instalar nada porque solo importa módulos de Node y archivos del estudio. Node, Python y ffmpeg
// son programas del sistema: no los instala esto (los instala la persona o su IA; los comandos están en el README).
// Se puede ejecutar las veces que haga falta: lo que ya está, se deja. No toca nada fuera de la carpeta del estudio
// salvo el Chromium, que Playwright guarda en su carpeta de navegadores.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { leerArgs } from './lib/args.mjs';
import { ESTUDIO, esPrincipal } from './lib/rutas.mjs';
import { rutaPython } from './medir-audio.mjs';

export const AYUDA = `Uso: npm run instalar   (o node tools/preparar.mjs)
  --ayuda   esta ayuda

Instala las librerías del estudio (si faltan), el navegador de capturas (Chromium de Playwright) y el entorno de
Python del estudio (.venv) con las versiones de requirements.txt, y termina con el diagnóstico. Necesita Node,
Python 3 y ffmpeg ya instalados.`;

/** Formas de llamar al Python del sistema, en orden de preferencia (en Windows, el lanzador "py"). */
export function candidatosPython(plataforma = process.platform) {
  return plataforma === 'win32'
    ? [
        ['py', ['-3']],
        ['python', []],
        ['python3', []],
      ]
    : [
        ['python3', []],
        ['python', []],
      ];
}

/** El primer Python 3 del sistema que responde, o null. */
export function buscarPython({ plataforma = process.platform, correr = spawnSync } = {}) {
  for (const [bin, previos] of candidatosPython(plataforma)) {
    const r = correr(bin, [...previos, '--version'], { encoding: 'utf8' });
    if (r.status === 0 && /Python 3\./.test(`${r.stdout}${r.stderr}`)) return [bin, previos];
  }
  return null;
}

/**
 * Paso de las librerías de Node con las versiones exactas del lock (npm ci). Lanzado con `npm run`, npm deja en
 * npm_execpath la ruta de su npm-cli.js y se ejecuta con este mismo Node. Si no (node tools/preparar.mjs, o con otro
 * gestor como pnpm), se llama a npm por su nombre; en Windows npm es un .cmd, que Node solo arranca con la shell.
 */
export function pasoLibrerias({
  npmExecPath = process.env.npm_execpath,
  plataforma = process.platform,
  nodo = process.execPath,
} = {}) {
  const descripcion = 'Librerías del estudio (npm ci, versiones de package-lock.json)';
  if (npmExecPath && /^npm-cli\.c?js$/i.test(path.basename(npmExecPath))) {
    return { descripcion, bin: nodo, args: [npmExecPath, 'ci'] };
  }
  if (plataforma === 'win32') return { descripcion, bin: 'npm ci', args: [], shell: true };
  return { descripcion, bin: 'npm', args: ['ci'] };
}

/**
 * Los pasos que hay que dar, sin ejecutar nada: { descripcion, bin, args, shell? }. `hayModulos` y `hayVenv`
 * evitan repetir lo que ya está. `python` es el del sistema ([bin, argsPrevios]); solo hace falta si no hay entorno.
 */
export function pasosPreparar({
  estudio = ESTUDIO,
  plataforma = process.platform,
  hayModulos = true,
  hayVenv,
  python,
  nodo = process.execPath,
  npmExecPath = process.env.npm_execpath,
}) {
  const venv = rutaPython(estudio, plataforma);
  // Python se comprueba antes de instalar nada: sin él no tiene sentido descargar el resto.
  if (!hayVenv && !python) {
    throw new Error('No encuentro Python 3. Instálalo (ver README) y vuelve a ejecutar npm run instalar.');
  }
  const pasos = [];
  if (!hayModulos) pasos.push(pasoLibrerias({ npmExecPath, plataforma, nodo }));
  pasos.push({
    descripcion: 'Navegador de capturas (Chromium de Playwright)',
    bin: nodo,
    args: [path.join(estudio, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'],
  });
  if (!hayVenv) {
    pasos.push({
      descripcion: 'Entorno de Python del estudio (.venv)',
      bin: python[0],
      args: [...python[1], '-m', 'venv', path.join(estudio, '.venv')],
    });
  }
  pasos.push(
    {
      descripcion: 'pip al día dentro del entorno',
      bin: venv,
      args: ['-m', 'pip', 'install', '--upgrade', 'pip'],
    },
    {
      descripcion: 'librosa y compañía (requirements.txt)',
      bin: venv,
      args: ['-m', 'pip', 'install', '-r', path.join(estudio, 'requirements.txt')],
    },
    {
      descripcion: 'Diagnóstico',
      bin: nodo,
      args: [path.join(estudio, 'tools', 'doctor.mjs')],
    },
  );
  return pasos;
}

export function preparar({
  estudio = ESTUDIO,
  correr = spawnSync,
  existe = fs.existsSync,
  log = console.log,
  npmExecPath = process.env.npm_execpath,
} = {}) {
  const hayModulos = existe(path.join(estudio, 'node_modules', 'playwright'));
  const hayVenv = existe(rutaPython(estudio));
  const python = hayVenv ? null : buscarPython({ correr });
  const pasos = pasosPreparar({ estudio, hayModulos, hayVenv, python, npmExecPath });
  for (const [i, p] of pasos.entries()) {
    log(`\n▶ ${i + 1}/${pasos.length} · ${p.descripcion}`);
    const r = correr(p.bin, p.args, { stdio: 'inherit', cwd: estudio, ...(p.shell && { shell: true }) });
    if (r.status !== 0) {
      throw new Error(`Falló: ${p.descripcion}. Revisa el mensaje de arriba y vuelve a ejecutar npm run instalar.`);
    }
  }
  return pasos.length;
}

/** Lo último que ve la persona: qué hacer ahora para su primer vídeo. */
export function mensajeFinal(estudio = ESTUDIO) {
  return [
    '✅ youtubeman está listo.',
    `   Abre tu IA dentro de esta carpeta: ${estudio}`,
    '   · Claude Code (recomendado): escribe /youtubeman y pide tu vídeo.',
    '   · Otra IA (Codex, Cursor…): pídele que lea AGENTS.md y pide tu vídeo.',
  ].join('\n');
}

if (esPrincipal(import.meta.url)) {
  try {
    const { values } = leerArgs({
      args: process.argv.slice(2),
      strict: true,
      options: { ayuda: { type: 'boolean', short: 'h', default: false } },
    });
    if (values.ayuda) console.log(AYUDA);
    else {
      preparar();
      console.log(`\n${mensajeFinal()}`);
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
