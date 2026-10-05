// Tests de engine/layout.js: formatos, alias, zonas seguras y encaje de cajas.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATOS,
  TEXTO_MINIMO,
  encajar,
  formato,
  normalizarFormato,
  orientacion,
  unidad,
  zonaSegura,
} from '../../engine/layout.js';

describe('FORMATOS', () => {
  test('los cuatro formatos con su tamaño en píxeles', () => {
    assert.deepEqual(Object.keys(FORMATOS).sort(), ['16:9', '1:1', '4:5', '9:16']);
    assert.deepEqual([FORMATOS['16:9'].w, FORMATOS['16:9'].h], [1920, 1080]);
    assert.deepEqual([FORMATOS['9:16'].w, FORMATOS['9:16'].h], [1080, 1920]);
    assert.deepEqual([FORMATOS['1:1'].w, FORMATOS['1:1'].h], [1080, 1080]);
    assert.deepEqual([FORMATOS['4:5'].w, FORMATOS['4:5'].h], [1080, 1350]);
  });

  test('todos tienen 1080 px de lado corto (la unidad de diseño)', () => {
    for (const f of Object.values(FORMATOS)) assert.equal(Math.min(f.w, f.h), 1080);
  });
});

describe('normalizarFormato y formato', () => {
  test('acepta la clave canónica, con x en vez de dos puntos, en mayúsculas o con espacios', () => {
    const casos = {
      '16:9': '16:9',
      '16x9': '16:9',
      '9X16': '9:16',
      ' 1:1 ': '1:1',
      '4x5': '4:5',
    };
    for (const [entrada, esperado] of Object.entries(casos)) assert.equal(normalizarFormato(entrada), esperado);
  });

  test('acepta los alias de plataforma y de forma', () => {
    const casos = {
      horizontal: '16:9',
      youtube: '16:9',
      vertical: '9:16',
      Vertical: '9:16',
      reel: '9:16',
      reels: '9:16',
      short: '9:16',
      shorts: '9:16',
      tiktok: '9:16',
      cuadrado: '1:1',
      post: '4:5',
    };
    for (const [entrada, esperado] of Object.entries(casos)) assert.equal(normalizarFormato(entrada), esperado);
  });

  test('sin argumento es 16:9', () => {
    assert.equal(normalizarFormato(), '16:9');
  });

  test('un formato desconocido lanza un error que dice cuáles hay', () => {
    for (const malo of ['7:3', '', 'panoramico', null, 'toString']) {
      assert.throws(() => normalizarFormato(malo), { message: /Formato desconocido: ".*"\. Usa 16:9, 9:16, 1:1, 4:5/ });
    }
  });

  test('nombres de propiedades heredadas de Object tampoco son formatos', () => {
    assert.throws(() => normalizarFormato('constructor'), /Formato desconocido/);
    assert.throws(() => normalizarFormato('__proto__'), /Formato desconocido/);
  });

  test('formato() devuelve la clave canónica junto con tamaño, nombre y usos', () => {
    assert.deepEqual(formato('reels'), { clave: '9:16', ...FORMATOS['9:16'] });
    const f = formato('4x5');
    assert.equal(f.clave, '4:5');
    assert.equal(f.w, 1080);
    assert.equal(f.h, 1350);
    assert.equal(f.nombre, 'post');
  });
});

describe('orientacion y unidad', () => {
  test('orientacion según el lado más largo', () => {
    assert.equal(orientacion({ w: 1920, h: 1080 }), 'horizontal');
    assert.equal(orientacion({ w: 1080, h: 1920 }), 'vertical');
    assert.equal(orientacion({ w: 1080, h: 1080 }), 'cuadrado');
    assert.equal(orientacion(FORMATOS['4:5']), 'vertical');
  });

  test('unidad vale 1 con 1080 px de lado corto y escala con él', () => {
    for (const f of Object.values(FORMATOS)) assert.equal(unidad(f), 1);
    assert.equal(unidad({ w: 960, h: 540 }), 0.5);
    assert.equal(unidad({ w: 2160, h: 3840 }), 2);
  });
});

describe('zonaSegura', () => {
  test('9:16 deja más margen abajo y a la derecha (interfaz de Reels/TikTok)', () => {
    const z = zonaSegura('9:16');
    assert.deepEqual(
      { arriba: z.arriba, derecha: z.derecha, abajo: z.abajo, izquierda: z.izquierda },
      { arriba: 200, derecha: 140, abajo: 380, izquierda: 64 },
    );
    assert.deepEqual({ x: z.x, y: z.y, w: z.w, h: z.h }, { x: 64, y: 200, w: 876, h: 1340 });
    assert.ok(z.abajo > z.arriba && z.derecha > z.izquierda);
  });

  test('16:9, 1:1 y 4:5 con sus márgenes', () => {
    assert.deepEqual((({ x, y, w, h }) => ({ x, y, w, h }))(zonaSegura('16:9')), { x: 96, y: 80, w: 1728, h: 920 });
    assert.deepEqual((({ x, y, w, h }) => ({ x, y, w, h }))(zonaSegura('1:1')), { x: 72, y: 72, w: 936, h: 936 });
    assert.deepEqual((({ x, y, w, h }) => ({ x, y, w, h }))(zonaSegura('4:5')), { x: 72, y: 72, w: 936, h: 1206 });
  });

  test('acepta alias y la zona siempre cabe dentro del lienzo', () => {
    assert.deepEqual(zonaSegura('reels'), zonaSegura('9:16'));
    for (const clave of Object.keys(FORMATOS)) {
      const z = zonaSegura(clave);
      const { w, h } = FORMATOS[clave];
      assert.ok(z.x > 0 && z.y > 0 && z.w > 0 && z.h > 0);
      assert.equal(z.x + z.w + z.derecha, w);
      assert.equal(z.y + z.h + z.abajo, h);
    }
  });
});

describe('encajar', () => {
  test('contain: cabe entera y queda centrada', () => {
    assert.deepEqual(encajar({ w: 1000, h: 500 }, { w: 200, h: 200 }), {
      x: 250,
      y: 0,
      w: 500,
      h: 500,
      escala: 2.5,
    });
  });

  test('cover: llena el contenedor y recorta lo que sobra', () => {
    assert.deepEqual(encajar({ w: 1000, h: 500 }, { w: 200, h: 200 }, 'cover'), {
      x: 0,
      y: -250,
      w: 1000,
      h: 1000,
      escala: 5,
    });
  });

  test('respeta la posición del contenedor y con la misma proporción llena exacto', () => {
    const r = encajar({ x: 10, y: 20, w: 192, h: 108 }, { w: 1920, h: 1080 });
    assert.deepEqual(r, { x: 10, y: 20, w: 192, h: 108, escala: 0.1 });
    assert.deepEqual(
      encajar({ x: 10, y: 20, w: 192, h: 108 }, { w: 1920, h: 1080 }, 'cover'),
      encajar({ x: 10, y: 20, w: 192, h: 108 }, { w: 1920, h: 1080 }, 'contain'),
    );
  });

  test('un modo desconocido se comporta como contain', () => {
    assert.deepEqual(
      encajar({ w: 300, h: 100 }, { w: 50, h: 50 }, 'otro'),
      encajar({ w: 300, h: 100 }, { w: 50, h: 50 }),
    );
  });
});

test('TEXTO_MINIMO es 28 px (legible en móvil)', () => {
  assert.equal(TEXTO_MINIMO, 28);
});
