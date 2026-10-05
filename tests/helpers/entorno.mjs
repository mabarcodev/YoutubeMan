// Utilidades comunes de los tests: carpetas temporales, detección de dependencias externas
// (ffmpeg, Chromium) y ejecución de las herramientas como las lanzaría el usuario.
// Los tests que necesitan algo que falta se SALTAN con el motivo, en vez de fallar con un error críptico.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolverBinario } from '../../tools/lib/ffmpeg.mjs';

/** Raíz del estudio, calculada desde este archivo para no depender del cwd con el que se lancen los tests. */
export const ESTUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Carpeta temporal única en el directorio temporal del sistema. Bórrala con borrar() en un after(). */
export function carpetaTemporal(prefijo) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `estudio-${prefijo}-`));
}

/** Borra con reintentos: en Windows, ffmpeg o Chromium pueden tardar unos milisegundos en soltar los archivos. */
export function borrar(ruta) {
  fs.rmSync(ruta, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

/** null si ffmpeg y ffprobe están disponibles; si no, el motivo con el que saltar el test. */
export function motivoSinFfmpeg() {
  try {
    resolverBinario('ffmpeg');
    resolverBinario('ffprobe');
    return null;
  } catch (e) {
    return `ffmpeg no está disponible: ${e.message}`;
  }
}

/** null si Playwright tiene su Chromium descargado; si no, el motivo con el que saltar el test. */
export async function motivoSinChromium() {
  try {
    const { chromium } = await import('playwright');
    const exe = chromium.executablePath();
    if (fs.existsSync(exe)) return null;
    return `falta el Chromium de Playwright (${exe}). Instálalo con: npx playwright install chromium`;
  } catch (e) {
    return `Playwright no está disponible: ${e.message}`;
  }
}

/** Ejecuta node con argumentos (sin shell, como en Windows real) y devuelve { codigo, stdout, stderr }. */
export function ejecutarNode(args, { cwd = ESTUDIO } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('error', reject);
    p.on('close', (codigo) => resolve({ codigo, stdout, stderr }));
  });
}

/** Comprueba que real está a ±tolerancia de esperado, con un mensaje que dice cuánto se ha desviado. */
export function cerca(real, esperado, tolerancia = 1e-9, mensaje = '') {
  if (!(Math.abs(real - esperado) <= tolerancia)) {
    throw new Error(`${mensaje ? mensaje + ': ' : ''}${real} no está a ±${tolerancia} de ${esperado}`);
  }
}
