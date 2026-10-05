#!/usr/bin/env node
// Prueba de humo: demuestra que el estudio funciona de punta a punta.
//  1. Determinismo: el fotograma 90 renderizado dos veces (en otro orden y en otra página) es idéntico al byte.
//  2. Desenfoque de movimiento: a mitad del estirado, el borde de la píldora aparece difuminado.
//  3. Sincronía de audio: el pico del pitido cae en t = 1.000 s del MP4 final (±15 ms).
// Deja smoke/salida/smoke.mp4 y smoke/salida/test.png (primer, medio y último fotograma).

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ESTUDIO, esPrincipal } from './lib/rutas.mjs';
import { abrirEscena, fotograma } from './lib/navegador.mjs';
import { render } from './render.mjs';
import { ffmpeg, decodificarPCM } from './lib/ffmpeg.mjs';
import { medirMuestras } from './lib/audio.mjs';

const PROYECTO = path.join(ESTUDIO, 'smoke');
const SALIDA = path.join(PROYECTO, 'salida');
const FPS = 60;
const T_PITIDO = 1.0;

/** Píxeles de una fila que no son ni fondo ni relleno: mide lo ancho que es un borde. */
export function anchoBorde(fila, { fondo, relleno, tolerancia = 18 }) {
  let n = 0;
  for (const v of fila) if (Math.abs(v - fondo) > tolerancia && Math.abs(v - relleno) > tolerancia) n++;
  return n;
}

/** Fila y (en gris) de un fotograma de vídeo o de un PNG de 1920 px de ancho. */
async function filaGris(origen, { fotogramaN, y, w = 1920, esPNG = false }) {
  const args = esPNG ? ['-i', origen] : ['-i', origen, '-vf', `select=eq(n\\,${fotogramaN})`, '-frames:v', '1'];
  const r = await ffmpeg([...args, '-pix_fmt', 'gray', '-f', 'rawvideo', '-']);
  return r.stdout.subarray(y * w, (y + 1) * w);
}

export async function ejecutarSmoke(log = console.log) {
  fs.mkdirSync(SALIDA, { recursive: true });
  const resultados = {};
  const navegador = await chromium.launch();
  try {
    // 1. Determinismo
    const a = await abrirEscena({ proyecto: PROYECTO, modulo: 'escena.js', navegador });
    const b = await abrirEscena({ proyecto: PROYECTO, modulo: 'escena.js', navegador });
    const t90 = 90 / FPS;
    const f1 = await fotograma(a.pagina, t90);
    await fotograma(a.pagina, 0.4);
    await fotograma(a.pagina, 2.7);
    const f2 = await fotograma(a.pagina, t90);
    await fotograma(b.pagina, 2.2);
    const f3 = await fotograma(b.pagina, t90);
    resultados.determinismo = {
      ok: f1.equals(f2) && f1.equals(f3),
      detalle: 'fotograma 90: misma página en otro orden y página nueva',
    };
    // Captura nítida (sin desenfoque) a mitad del estirado, para comparar con el MP4.
    const tMitad = 63 / FPS;
    fs.writeFileSync(path.join(SALIDA, 'nitido-63.png'), await fotograma(a.pagina, tMitad));
    await a.cerrar();
    await b.cerrar();
  } finally {
    await navegador.close();
  }

  // 2. Render completo con desenfoque y audio
  const [r] = await render(
    {
      proyecto: PROYECTO,
      modulo: 'escena.js',
      formatos: ['16:9'],
      fps: FPS,
      sub: 4,
      escala: 1,
      desde: 0,
      hasta: null,
      fotos: null,
      salida: path.join(SALIDA, 'smoke.mp4'),
      sinAudio: false,
      crf: 16,
      borrador: false,
    },
    () => {},
  );
  const mp4 = r.salida;
  log(`  render: ${mp4} (${r.tiempoRender} s)`);

  // Desenfoque: la fila central de la píldora a mitad del estirado.
  const y = 540;
  const opciones = { fondo: 247, relleno: 98 }; // #F7F8F6 y #0B8F63 en gris aproximado
  const borroso = anchoBorde(await filaGris(mp4, { fotogramaN: 63, y }), opciones);
  const nitido = anchoBorde(await filaGris(path.join(SALIDA, 'nitido-63.png'), { y, esPNG: true }), opciones);
  resultados.desenfoque = {
    ok: borroso >= nitido + 6,
    detalle: `borde con desenfoque ${borroso} px vs nítido ${nitido} px`,
  };

  // 3. Sincronía de audio
  const pcm = await decodificarPCM(mp4, 48000);
  const { picoMs } = medirMuestras(pcm, 48000);
  const error = Math.abs(picoMs - T_PITIDO * 1000);
  resultados.audio = {
    ok: error <= 15,
    detalle: `pico en ${picoMs} ms (esperado ${T_PITIDO * 1000} ms, error ${error.toFixed(1)} ms)`,
  };

  // test.png: primer, medio y último fotograma lado a lado.
  await ffmpeg([
    '-i',
    mp4,
    '-vf',
    `select=eq(n\\,0)+eq(n\\,90)+eq(n\\,179),scale=640:-1,tile=3x1`,
    '-frames:v',
    '1',
    path.join(SALIDA, 'test.png'),
  ]);

  resultados.ok = resultados.determinismo.ok && resultados.desenfoque.ok && resultados.audio.ok;
  fs.writeFileSync(path.join(SALIDA, 'resultado.json'), JSON.stringify(resultados, null, 2));
  return resultados;
}

if (esPrincipal(import.meta.url)) {
  console.log('Prueba de humo del estudio…');
  try {
    const r = await ejecutarSmoke();
    for (const k of ['determinismo', 'desenfoque', 'audio'])
      console.log(`${r[k].ok ? '✅' : '❌'} ${k}: ${r[k].detalle}`);
    console.log(r.ok ? '\n✅ Estudio listo.' : '\n❌ Algo falla: revisa los puntos marcados.');
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error(`❌ ${e.stack || e.message}`);
    process.exit(1);
  }
}
