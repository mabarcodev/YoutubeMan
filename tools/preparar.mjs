#!/usr/bin/env node
// Deja el estudio completo y con las mismas versiones en cualquier ordenador (después de `npm install`):
//   1. el Chromium de Playwright (la versión que fija package-lock.json),
//   2. el entorno de Python del estudio (.venv) con librosa y compañía (versiones de requirements.txt),
//   3. el diagnóstico (doctor.mjs), que sale con 1 si aún falta algo.
//
//   node tools/preparar.mjs            (o npm run preparar)
//
// Node, Python y ffmpeg son programas del sistema: no los instala esto (los instala la persona o su agente; los
// comandos están en el README). Se puede ejecutar las veces que haga falta: lo que ya está, se deja.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { leerArgs } from './lib/args.mjs';
import { ESTUDIO, esPrincipal } from './lib/rutas.mjs';
import { rutaPython } from './medir-audio.mjs';

export const AYUDA = `Uso: node tools/preparar.mjs   (o npm run preparar, después de npm install)
  --ayuda   esta ayuda

Instala el navegador de capturas (Chromium de Playwright), crea el entorno de Python del estudio (.venv) con
las versiones de requirements.txt y termina con el diagnóstico. Necesita Node, Python 3 y ffmpeg ya instalados.`;

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
 * Los pasos que hay que dar, sin ejecutar nada: { descripcion, bin, args }. `hayVenv` evita recrear el entorno.
 * `python` es el del sistema ([bin, argsPrevios]); solo hace falta si no hay entorno.
 */
export function pasosPreparar({
  estudio = ESTUDIO,
  plataforma = process.platform,
  hayVenv,
  python,
  nodo = process.execPath,
}) {
  const venv = rutaPython(estudio, plataforma);
  const pasos = [
    {
      descripcion: 'Navegador de capturas (Chromium de Playwright)',
      bin: nodo,
      args: [path.join(estudio, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'],
    },
  ];
  if (!hayVenv) {
    if (!python) throw new Error('No encuentro Python 3. Instálalo (ver README) y vuelve a ejecutar npm run preparar.');
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

export function preparar({ estudio = ESTUDIO, correr = spawnSync, existe = fs.existsSync, log = console.log } = {}) {
  if (!existe(path.join(estudio, 'node_modules', 'playwright'))) {
    throw new Error('Primero ejecuta npm install dentro del estudio.');
  }
  const hayVenv = existe(rutaPython(estudio));
  const python = hayVenv ? null : buscarPython({ correr });
  const pasos = pasosPreparar({ estudio, hayVenv, python });
  for (const [i, p] of pasos.entries()) {
    log(`\n▶ ${i + 1}/${pasos.length} · ${p.descripcion}`);
    const r = correr(p.bin, p.args, { stdio: 'inherit', cwd: estudio });
    if (r.status !== 0) {
      throw new Error(`Falló: ${p.descripcion}. Revisa el mensaje de arriba y vuelve a ejecutar npm run preparar.`);
    }
  }
  return pasos.length;
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
      console.log('\n✅ Estudio preparado.');
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
