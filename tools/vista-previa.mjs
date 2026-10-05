#!/usr/bin/env node
// Vista previa de una escena o película en el navegador, con la barra de tiempo del runtime (play, arrastrar,
// fotograma a fotograma y cambio de formato). Sirve el proyecto por HTTP como el render, pero sin render=1:
// sin ese parámetro el runtime monta la barra.
//
//   node tools/vista-previa.mjs --proyecto <dir> --modulo <ruta> [--formato 16:9] [--puerto 0] [--abrir]
//
// Sigue en marcha hasta Ctrl+C. El servidor no guarda caché: guarda la escena y recarga (F5) para verla.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { leerArgs } from './lib/args.mjs';
import { iniciarServidor } from './lib/servidor.mjs';
import { ESTUDIO, esPrincipal, rutaURLModulo } from './lib/rutas.mjs';
import { normalizarFormato } from '../engine/layout.js';

export const AYUDA = `Uso: node tools/vista-previa.mjs --proyecto <carpeta> --modulo <escena.js|pelicula.js> [opciones]
  --formato 16:9   formato inicial (16:9, 9:16, 1:1, 4:5); se cambia luego desde la barra
  --puerto 0       puerto local (0 = uno libre)
  --abrir          abre la vista previa en el navegador por defecto
  --ayuda          esta ayuda

En la página: Espacio = play/pausa · ←/→ = fotograma a fotograma · F5 tras guardar la escena.
Sigue en marcha hasta Ctrl+C.`;

export function leerOpciones(argv) {
  const { values } = leerArgs({
    args: argv,
    strict: true,
    options: {
      proyecto: { type: 'string' },
      modulo: { type: 'string' },
      formato: { type: 'string', default: '16:9' },
      puerto: { type: 'string', default: '0' },
      abrir: { type: 'boolean', default: false },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.ayuda) return { ayuda: true };
  const proyecto = path.resolve(values.proyecto ?? process.cwd());
  // Igual que render.mjs: sin --modulo, la película del proyecto si existe.
  const modulo = values.modulo ?? (fs.existsSync(path.join(proyecto, 'pelicula.js')) ? 'pelicula.js' : null);
  if (!modulo) throw new Error('Falta --modulo (ruta a escena.js o pelicula.js, relativa al proyecto).');
  const puerto = Number(values.puerto);
  if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) {
    throw new Error(`--puerto debe ser un número entre 0 y 65535 (recibido: ${values.puerto}).`);
  }
  return { proyecto, modulo, formato: normalizarFormato(values.formato), puerto, abrir: values.abrir };
}

// "/" y ":" son válidos en una consulta: dejarlos sin codificar hace la URL legible (modulo=/escenas/01/escena.js).
const codificar = (v) => encodeURIComponent(v).replace(/%2F/gi, '/').replace(/%3A/gi, ':');

/** URL de la vista previa: la página del motor con el módulo (relativo al proyecto) y el formato. Sin render=1. */
export function construirURL(base, proyecto, modulo, formato = '16:9') {
  const ruta = rutaURLModulo(proyecto, modulo);
  const fmt = normalizarFormato(formato);
  return `${String(base).replace(/\/+$/, '')}/estudio/engine/pagina.html?modulo=${codificar(ruta)}&formato=${codificar(fmt)}`;
}

/**
 * Cómo abrir una URL en el navegador por defecto. En Windows, cmd /c start "" "<url>": el "" es el título
 * de la ventana (start toma el primer texto entre comillas como título) y las comillas de la URL evitan que
 * cmd corte en el "&" de la consulta. windowsVerbatimArguments impide que Node vuelva a entrecomillar.
 */
export function comandoAbrir(url, plataforma = process.platform) {
  if (plataforma === 'win32') {
    return {
      bin: 'cmd.exe',
      args: ['/d', '/s', '/c', `start "" "${url}"`],
      opciones: { windowsVerbatimArguments: true },
    };
  }
  if (plataforma === 'darwin') return { bin: 'open', args: [url], opciones: {} };
  return { bin: 'xdg-open', args: [url], opciones: {} };
}

/** Abre el navegador sin esperar a que se cierre. Devuelve una promesa que falla si no se pudo lanzar. */
export function abrirNavegador(url, { plataforma = process.platform, lanzar = spawn } = {}) {
  const { bin, args, opciones } = comandoAbrir(url, plataforma);
  return new Promise((resolve, reject) => {
    const hijo = lanzar(bin, args, { ...opciones, detached: true, stdio: 'ignore', windowsHide: true });
    hijo.once('error', reject);
    hijo.once('spawn', () => {
      hijo.unref();
      resolve();
    });
  });
}

/**
 * Comprueba el proyecto y el módulo, arranca el servidor y devuelve { url, base, modulo, avisos, cerrar }.
 * Los errores salen antes de abrir el puerto: una escena que no existe se dice aquí, no como un 404 en el navegador.
 */
export async function iniciarVistaPrevia({ proyecto, modulo, formato = '16:9', puerto = 0, estudio = ESTUDIO }) {
  if (!fs.existsSync(proyecto) || !fs.statSync(proyecto).isDirectory()) {
    throw new Error(`No existe la carpeta del proyecto: ${proyecto}`);
  }
  const absModulo = path.isAbsolute(modulo) ? modulo : path.resolve(proyecto, modulo);
  const relativo = rutaURLModulo(proyecto, absModulo); // lanza si el módulo está fuera del proyecto
  if (!fs.existsSync(absModulo) || !fs.statSync(absModulo).isFile())
    throw new Error(`No existe el módulo ${absModulo}`);
  const avisos = [];
  if (!fs.existsSync(path.join(proyecto, 'proyecto.json'))) {
    avisos.push('No hay proyecto.json: la escena usará el tempo por defecto (120 BPM, primer pulso en 0).');
  }
  let servidor;
  try {
    servidor = await iniciarServidor({ proyecto, estudio, puerto });
  } catch (e) {
    if (e.code === 'EADDRINUSE') {
      throw new Error(`El puerto ${puerto} está ocupado: usa otro o --puerto 0 (uno libre).`, { cause: e });
    }
    throw e;
  }
  return {
    url: construirURL(servidor.url, proyecto, absModulo, formato),
    base: servidor.url,
    modulo: relativo,
    avisos,
    cerrar: servidor.cerrar,
  };
}

/**
 * Con Ctrl+C (SIGINT) o SIGTERM cierra el servidor y sale con 0. Un navegador con la conexión abierta podría
 * retrasar el cierre, así que como mucho se esperan `esperaMs`. Devuelve la función de cierre.
 */
export function cerrarAlSalir(vp, { proceso = process, log = console.log, esperaMs = 2000 } = {}) {
  let cerrando = false;
  const cerrar = async () => {
    if (cerrando) return; // dos Ctrl+C seguidos no cierran dos veces
    cerrando = true;
    await Promise.race([vp.cerrar(), new Promise((r) => setTimeout(r, esperaMs))]);
    log('✅ Vista previa cerrada.');
    proceso.exit(0);
  };
  proceso.on('SIGINT', cerrar);
  proceso.on('SIGTERM', cerrar);
  return cerrar;
}

if (esPrincipal(import.meta.url)) {
  try {
    const op = leerOpciones(process.argv.slice(2));
    if (op.ayuda) console.log(AYUDA);
    else {
      const vp = await iniciarVistaPrevia(op);
      console.log(`✅ Vista previa de ${vp.modulo} (${op.formato}):\n   ${vp.url}`);
      for (const a of vp.avisos) console.log(`⚠ ${a}`);
      console.log('   Espacio = play/pausa · ←/→ = fotograma a fotograma · F5 tras guardar · Ctrl+C para cerrar.');
      if (op.abrir) {
        abrirNavegador(vp.url).catch((e) =>
          console.log(`⚠ No pude abrir el navegador (${e.message}): abre la URL a mano.`),
        );
      }
      cerrarAlSalir(vp);
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
