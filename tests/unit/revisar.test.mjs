// Tests de las partes puras de tools/revisar.mjs (tramos, cuadrícula, filtro de marca de tiempo, resumen)
// y de su CLI en lo que no necesita ffmpeg. revisar() sobre un vídeo real está en tests/integracion/render.test.mjs.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { filas, filtroMarcaTiempo, numeroOpcion, resumenMarkdown, revisar, tramos } from '../../tools/revisar.mjs';
import { ejecutarNode } from '../helpers/entorno.mjs';

describe('tramos', () => {
  test('un vídeo corto es un solo tramo', () => {
    assert.deepEqual(tramos(10), [[0, 10]]);
    assert.deepEqual(tramos(30), [[0, 30]]);
  });

  test('un vídeo largo se parte en tramos de 30 s con el resto al final', () => {
    assert.deepEqual(tramos(65), [
      [0, 30],
      [30, 30],
      [60, 5],
    ]);
    assert.deepEqual(tramos(60), [
      [0, 30],
      [30, 30],
    ]);
  });

  test('tamaño de tramo propio y restos despreciables por redondeo', () => {
    assert.deepEqual(tramos(10, 4), [
      [0, 4],
      [4, 4],
      [8, 2],
    ]);
    assert.deepEqual(tramos(60 + 1e-7), [
      [0, 30],
      [30, 30],
    ]);
  });

  test('duración 0 da un tramo vacío en vez de ninguno', () => {
    assert.deepEqual(tramos(0), [[0, 0]]);
  });
});

describe('filas', () => {
  test('filas de una cuadrícula, al menos una', () => {
    assert.equal(filas(0, 5), 1);
    assert.equal(filas(1, 5), 1);
    assert.equal(filas(5, 5), 1);
    assert.equal(filas(6, 5), 2);
    assert.equal(filas(60, 5), 12);
  });
});

describe('filtroMarcaTiempo', () => {
  test('sin ninguna fuente del sistema no hay marca de tiempo', () => {
    assert.equal(
      filtroMarcaTiempo(0, () => false),
      null,
    );
  });

  test('con una fuente de Windows escapa los dos puntos de la unidad y deja el filtro listo', () => {
    const f = filtroMarcaTiempo(30, (ruta) => ruta === 'C:/Windows/Fonts/segoeui.ttf');
    assert.equal(
      f,
      "drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='%{pts\\:hms\\:30.000}':x=8:y=8:fontsize=18:" +
        'fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4',
    );
  });

  test('usa la primera fuente que exista, por orden de preferencia', () => {
    const f = filtroMarcaTiempo(0, () => true);
    assert.match(f, /fontfile='C\\:\/Windows\/Fonts\/arial\.ttf'/);
    assert.match(f, /%\{pts\\:hms\\:0\.000\}/);
  });

  test('con una ruta sin unidad (Linux) no escapa nada', () => {
    const linux = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    const f = filtroMarcaTiempo(1.5, (ruta) => ruta === linux);
    assert.match(
      f,
      new RegExp(`^drawtext=fontfile='${linux.replace(/\./g, '\\.')}':text='%\\{pts\\\\:hms\\\\:1\\.500\\}'`),
    );
  });

  test('sin "existe" inyectado consulta el disco de verdad', () => {
    const f = filtroMarcaTiempo(0);
    assert.ok(f === null || f.startsWith("drawtext=fontfile='"));
  });
});

describe('resumenMarkdown', () => {
  const base = {
    video: 'D:\\Vídeos\\MiProducto\\salida\\miproducto-16x9-v1.mp4',
    duracion: 12.5,
    tamano: '1920x1080',
    fps: 60,
    audio: true,
    saltos: [],
    diferenciaBucle: 0.4,
    bucleLimpio: true,
    archivos: {
      contacto: ['C:\\rev\\contacto-1.png'],
      movil: 'C:\\rev\\movil.png',
      primero: 'C:\\rev\\primero.png',
      ultimo: 'C:\\rev\\ultimo.png',
      tiras: [],
    },
  };

  test('resumen de un vídeo limpio', () => {
    assert.equal(
      resumenMarkdown(base),
      [
        '# Revisión automática',
        '',
        '- Vídeo: `D:\\Vídeos\\MiProducto\\salida\\miproducto-16x9-v1.mp4`',
        '- 12.50 s · 1920x1080 · 60.00 fps · audio: sí',
        '- Bucle: diferencia primer/último fotograma = 0.4 (limpio)',
        '- Saltos de un fotograma: ninguno',
        '',
        '## Imágenes para revisar',
        '- Hoja de contactos: C:\\rev\\contacto-1.png',
        '- Móvil (360 px): C:\\rev\\movil.png',
        '- Primer fotograma (miniatura del feed): C:\\rev\\primero.png',
        '- Último fotograma: C:\\rev\\ultimo.png',
        '',
      ].join('\n'),
    );
  });

  test('con saltos, bucle sucio, sin audio, varias hojas y tiras', () => {
    const md = resumenMarkdown({
      ...base,
      audio: false,
      saltos: [
        { indice: 90, puntuacion: 42.5, segundo: 1.5 },
        { indice: 12, puntuacion: 11, segundo: 0.2 },
      ],
      diferenciaBucle: 37.2,
      bucleLimpio: false,
      archivos: {
        ...base.archivos,
        contacto: ['c1.png', 'c2.png'],
        tiras: ['tira-4_2s.png'],
      },
    });
    assert.match(md, /audio: no/);
    assert.match(md, /= 37\.2 \(se nota el corte si el vídeo hace bucle\)/);
    assert.match(md, /Saltos de un fotograma: 1\.5 s \(fotograma 90, 42\.5\), 0\.2 s \(fotograma 12, 11\)/);
    assert.match(md, /- Hoja de contactos: c1\.png\n- Hoja de contactos: c2\.png\n/);
    assert.match(md, /- Tira: tira-4_2s\.png\n$/);
  });
});

describe('revisar() y CLI sin vídeo', () => {
  test('revisar() de un vídeo que no existe: error claro', async () => {
    const falta = path.join('no', 'existe.mp4');
    await assert.rejects(revisar(falta), { message: `No existe el vídeo: ${falta}` });
  });

  test('sin argumentos: sale con 1 y explica el uso', async () => {
    const r = await ejecutarNode(['tools/revisar.mjs']);
    assert.equal(r.codigo, 1);
    assert.match(r.stderr, /^❌ Uso: node tools\/revisar\.mjs <video\.mp4>/);
  });

  test('con un vídeo que no existe: sale con 1 y lo dice', async () => {
    const r = await ejecutarNode(['tools/revisar.mjs', 'no existe ñ.mp4']);
    assert.equal(r.codigo, 1);
    assert.match(r.stderr, /^❌ No existe el vídeo: .*no existe ñ\.mp4/);
  });

  test('--ayuda imprime el uso y sale con 0 (como el resto de herramientas)', async () => {
    const r = await ejecutarNode(['tools/revisar.mjs', '--ayuda']);
    assert.equal(r.codigo, 0, r.stderr);
    assert.match(r.stdout, /node tools\/revisar\.mjs <video\.mp4>/);
  });
});

describe('numeroOpcion', () => {
  test('sin valor devuelve undefined; con un número válido, el número', () => {
    assert.equal(numeroOpcion('--bpm', undefined), undefined);
    assert.equal(numeroOpcion('--bpm', '128', { mayorQue: 0 }), 128);
    assert.equal(numeroOpcion('--tiras', '0', { minimo: 0 }), 0);
    assert.equal(numeroOpcion('--umbral', ' 7.5 ', { minimo: 0 }), 7.5);
  });

  test('texto, vacío, infinito o fuera de rango: error que nombra la opción y lo recibido', () => {
    for (const [nombre, valor, limites] of [
      ['--umbral', 'abc', { minimo: 0 }],
      ['--umbral', '-1', { minimo: 0 }],
      ['--bpm', '0', { mayorQue: 0 }],
      ['--bpm', '', { mayorQue: 0 }],
      ['--tiras', 'Infinity', {}],
    ]) {
      assert.throws(() => numeroOpcion(nombre, valor, limites), {
        message: new RegExp(`^${nombre} debe ser un número.*recibido: "`),
      });
    }
  });
});
