#!/usr/bin/env node
// Captura la maqueta de la app ficticia "Ruta" (kit/app/index.html) igual que se capturaría un producto real:
// abre la página en Chromium, hace una foto, pulsa "Optimizar ruta" DE VERDAD y hace otra. Lo repite en
// escritorio y en móvil (el formato 9:16 reencuadra con la versión móvil, no recorta la de escritorio).
//
// Guarda en kit/capturas/:
//   escritorio-entrada.png, escritorio-optimizada.png, movil-entrada.png, movil-optimizada.png
//   capturas.json  → los datos que muestra la app y dónde está cada zona (botón, distancia, mapa) en cada
//                    captura. Las escenas lo leen: el cursor apunta al botón real y el contador usa el dato real.
//
//   node ejemplos/demo/kit/app/capturar.mjs [--salida <carpeta>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { leerArgs } from '../../../../tools/lib/args.mjs';
import { iniciarServidor } from '../../../../tools/lib/servidor.mjs';
import { ESTUDIO, esPrincipal } from '../../../../tools/lib/rutas.mjs';

/** Carpeta del proyecto de ejemplo (la que contiene kit/). */
export const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Escala alta a propósito: la cámara del vídeo hace zoom sobre la captura y no debe verse pixelada.
export const DISPOSITIVOS = {
  escritorio: { ancho: 1280, alto: 800, escala: 2 },
  movil: { ancho: 390, alto: 844, escala: 3 },
};

export const ESTADOS = ['entrada', 'optimizada'];

export const AYUDA = `Uso: node ejemplos/demo/kit/app/capturar.mjs [opciones]
  --salida <carpeta>   dónde guardar las PNG y capturas.json (por defecto kit/capturas del ejemplo)
  --ayuda              muestra esta ayuda`;

export function leerOpciones(argv) {
  const { values } = leerArgs({
    args: argv,
    options: {
      salida: { type: 'string' },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  if (values.ayuda) return { ayuda: true };
  return { salida: path.resolve(values.salida ?? path.join(DEMO, 'kit', 'capturas')) };
}

/** Rectángulo en píxeles CSS de la captura, redondeado a 0,1 px para que el JSON sea estable entre ejecuciones. */
export function redondearRect({ x, y, width, height }) {
  const r = (v) => Math.round(v * 10) / 10;
  return { x: r(x), y: r(y), w: r(width), h: r(height) };
}

/** Nombre del archivo de una captura. */
export const nombreCaptura = (dispositivo, estado) => `${dispositivo}-${estado}.png`;

/**
 * Índice que leen las escenas. `imagen` es la ruta URL que sirve el estudio (relativa a la raíz del proyecto).
 *   capturas: { escritorio: { entrada: { zonas }, optimizada: { zonas } }, movil: {...} }
 */
export function construirIndice({ datos, textos, capturas }) {
  const dispositivos = {};
  for (const [nombre, disp] of Object.entries(DISPOSITIVOS)) {
    dispositivos[nombre] = { ...disp };
    for (const estado of ESTADOS) {
      const c = capturas[nombre]?.[estado];
      if (!c) throw new Error(`Falta la captura ${nombre}/${estado}.`);
      dispositivos[nombre][estado] = { imagen: `/kit/capturas/${nombreCaptura(nombre, estado)}`, zonas: c.zonas };
    }
  }
  return {
    app: 'kit/app/index.html',
    aviso: 'App ficticia de demostración',
    datos: { ...datos, textos },
    dispositivos,
  };
}

async function capturarDispositivo({ navegador, url, nombre, disp, salida }) {
  const pagina = await navegador.newPage({
    viewport: { width: disp.ancho, height: disp.alto },
    deviceScaleFactor: disp.escala,
  });
  try {
    await pagina.goto(`${url}/kit/app/index.html`);
    await pagina.waitForFunction(() => document.documentElement.dataset.listo === '1', null, { timeout: 30_000 });
    const leerZonas = () =>
      pagina.$$eval('[data-captura]', (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return [e.dataset.captura, { x: r.x, y: r.y, width: r.width, height: r.height }];
        }),
      );
    const leerTextos = () =>
      pagina.$$eval('[data-dato]', (els) => Object.fromEntries(els.map((e) => [e.dataset.dato, e.textContent.trim()])));

    const resultado = {};
    for (const estado of ESTADOS) {
      if (estado === 'optimizada') {
        // Clic real en el botón: la app recalcula la ruta como lo haría el producto.
        await pagina.click('[data-captura="boton"]');
        await pagina.waitForFunction(() => document.body.dataset.estado === 'optimizada');
      }
      const archivo = path.join(salida, nombreCaptura(nombre, estado));
      await pagina.screenshot({ path: archivo, animations: 'disabled', caret: 'hide' });
      const zonas = Object.fromEntries((await leerZonas()).map(([k, r]) => [k, redondearRect(r)]));
      resultado[estado] = { zonas, textos: await leerTextos(), archivo };
    }
    const datos = await pagina.evaluate(() => window.__ruta);
    return { resultado, datos };
  } finally {
    await pagina.close();
  }
}

export async function capturar({ salida }, log = console.log) {
  fs.mkdirSync(salida, { recursive: true });
  const servidor = await iniciarServidor({ proyecto: DEMO, estudio: ESTUDIO });
  const navegador = await chromium.launch();
  try {
    const capturas = {};
    let datos = null;
    let textos = null;
    for (const [nombre, disp] of Object.entries(DISPOSITIVOS)) {
      const r = await capturarDispositivo({ navegador, url: servidor.url, nombre, disp, salida });
      capturas[nombre] = r.resultado;
      for (const estado of ESTADOS) log(`  ${nombre} · ${estado} → ${r.resultado[estado].archivo}`);
      // Los datos no dependen del dispositivo; se guardan los del primero.
      datos ??= { paradas: r.datos.paradas, kmEntrada: r.datos.kmEntrada, kmOptimizada: r.datos.kmOptimizada };
      datos.kmAhorro ??= r.datos.kmAhorro;
      datos.porcentaje ??= r.datos.porcentaje;
      textos ??= {
        distanciaEntrada: r.resultado.entrada.textos.distancia,
        distanciaOptimizada: r.resultado.optimizada.textos.distancia,
        ahorro: r.resultado.optimizada.textos.ahorro,
      };
    }
    const indice = construirIndice({ datos, textos, capturas });
    const json = path.join(salida, 'capturas.json');
    fs.writeFileSync(json, JSON.stringify(indice, null, 2) + '\n');
    return { json, indice };
  } finally {
    await navegador.close();
    await servidor.cerrar();
  }
}

if (esPrincipal(import.meta.url)) {
  try {
    const op = leerOpciones(process.argv.slice(2));
    if (op.ayuda) console.log(AYUDA);
    else {
      console.log('Capturando la maqueta de Ruta (app ficticia)…');
      const { json, indice } = await capturar(op);
      const d = indice.datos;
      console.log(
        `✅ ${json}\n   ${d.paradas} paradas · ${d.textos.distanciaEntrada} → ${d.textos.distanciaOptimizada} (${d.textos.ahorro})`,
      );
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
