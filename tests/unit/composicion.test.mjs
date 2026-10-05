// Tests de engine/composicion.js: montaje de escenas en una sola línea de tiempo.
// montar() y dibujar() de secuencia() solo crean capas y asignan estilos, así que se prueban con un DOM falso.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activasEn,
  encadenar,
  imagenesDe,
  inicioEncadenado,
  planificar,
  secuencia,
  sonidosDe,
  unirFuentes,
  unirImagenes,
  valor,
} from '../../engine/composicion.js';
import { crearTempo } from '../../engine/tempo.js';
import { instalarDomFalso } from '../helpers/dom-falso.mjs';
import { cerca } from '../helpers/entorno.mjs';

const ctx = { tempo: crearTempo({ bpm: 120 }) };
const escena = (duracion, extra = {}) => ({ duracion, dibujar: () => {}, ...extra });
const tiempos = (plan) => plan.items.map((it) => [it.inicio, it.fin]);

describe('valor', () => {
  test('devuelve los valores fijos tal cual y llama a las funciones con el contexto', () => {
    assert.equal(valor(3, ctx), 3);
    assert.equal(valor(undefined, ctx), undefined);
    const obj = { a: 1 };
    assert.equal(valor(obj, ctx), obj);
    assert.equal(
      valor((c) => c.tempo.beat(4), ctx),
      2,
    );
  });
});

describe('planificar', () => {
  test('acepta [escena, inicio] y { escena, inicio }, con inicio 0 por defecto', () => {
    const a = escena(2);
    const b = escena(3);
    const p1 = planificar(
      [
        [a, 0],
        [b, 2],
      ],
      ctx,
    );
    const p2 = planificar([{ escena: a }, { escena: b, inicio: 2 }], ctx);
    assert.deepEqual(tiempos(p1), [
      [0, 2],
      [2, 5],
    ]);
    assert.deepEqual(tiempos(p2), tiempos(p1));
    assert.deepEqual(
      p1.items.map((it) => [it.indice, it.duracion, it.escena]),
      [
        [0, 2, a],
        [1, 3, b],
      ],
    );
    assert.equal(p1.duracion, 5);
  });

  test('inicios y duraciones pueden ser funciones del contexto (pulsos)', () => {
    const plan = planificar(
      [
        [escena((c) => c.tempo.pulsos(8)), 0],
        [escena(1), (c) => c.tempo.beat(6)],
      ],
      ctx,
    );
    assert.deepEqual(tiempos(plan), [
      [0, 4],
      [3, 4],
    ]);
    assert.equal(plan.duracion, 4);
  });

  test('la duración total es el fin más tardío, no el de la última entrada', () => {
    const plan = planificar(
      [
        [escena(10), 0],
        [escena(1), 2],
      ],
      ctx,
    );
    assert.equal(plan.duracion, 10);
  });

  test('sin escenas lanza un error', () => {
    assert.throws(() => planificar([], ctx), { message: /La secuencia no tiene escenas/ });
  });

  test('una entrada que no es una escena (sin dibujar) dice cuál es', () => {
    for (const mala of [null, {}, { dibujar: 'no' }, { duracion: 2 }]) {
      assert.throws(
        () =>
          planificar(
            [
              [escena(1), 0],
              [mala, 1],
            ],
            ctx,
          ),
        {
          message: /La entrada 1 de la secuencia no es una escena válida \(falta dibujar\)/,
        },
      );
    }
  });

  test('duración 0, negativa o ausente lanza un error con el nombre (o el índice) de la escena', () => {
    assert.throws(() => planificar([[escena(0, { nombre: 'gancho' }), 0]], ctx), {
      message: /La escena "gancho" necesita duracion > 0/,
    });
    assert.throws(
      () =>
        planificar(
          [
            [escena(2), 0],
            [escena(-1), 0],
          ],
          ctx,
        ),
      { message: /La escena "1" necesita/ },
    );
    assert.throws(() => planificar([[escena(undefined), 0]], ctx), { message: /necesita duracion > 0/ });
    assert.throws(() => planificar([[escena(NaN), 0]], ctx), { message: /necesita duracion > 0/ });
    assert.throws(() => planificar([[escena(() => 0), 0]], ctx), { message: /necesita duracion > 0/ });
  });
});

describe('activasEn', () => {
  const plan = planificar(
    [
      [escena(2, { nombre: 'a' }), 0],
      [escena(3, { nombre: 'b' }), 2],
    ],
    ctx,
  );
  const nombres = (t, p = plan) => activasEn(p, t).map((it) => it.escena.nombre);

  test('cada escena es visible en [inicio, fin): en el cambio solo se ve la nueva', () => {
    assert.deepEqual(nombres(0), ['a']);
    assert.deepEqual(nombres(1.999), ['a']);
    assert.deepEqual(nombres(2), ['b']);
    assert.deepEqual(nombres(4.9), ['b']);
  });

  test('antes del principio y después del final no hay nada', () => {
    assert.deepEqual(nombres(-0.01), []);
    assert.deepEqual(nombres(5.01), []);
  });

  test('en el último instante sigue visible la escena que acaba justo ahí', () => {
    assert.deepEqual(nombres(5), ['b']);
    const conCorta = planificar(
      [
        [escena(3, { nombre: 'larga' }), 0],
        [escena(1, { nombre: 'corta' }), 1],
      ],
      ctx,
    );
    // La corta acaba en 2: en t = 3 (el final) solo sigue la que acaba en 3.
    assert.deepEqual(nombres(3, conCorta), ['larga']);
  });

  test('las escenas que se solapan se ven a la vez (traspasos)', () => {
    const solape = planificar(
      [
        [escena(2, { nombre: 'a' }), 0],
        [escena(2, { nombre: 'b' }), 1.5],
      ],
      ctx,
    );
    assert.deepEqual(nombres(1.75, solape), ['a', 'b']);
    assert.deepEqual(nombres(1.4, solape), ['a']);
    assert.deepEqual(nombres(2, solape), ['b']);
  });
});

describe('sonidosDe', () => {
  test('desplaza los sonidos de cada escena a su inicio y los ordena por tiempo', () => {
    const a = escena(2, {
      sonidos: [
        { t: 1.5, tipo: 'pop' },
        { t: 0, tipo: 'click' },
      ],
    });
    const b = escena(2, { sonidos: (c) => [{ t: c.tempo.pulsos(1), tipo: 'ding' }] });
    const c = escena(1); // sin sonidos
    const plan = planificar(
      [
        [a, 0],
        [b, 1],
        [c, 3],
      ],
      ctx,
    );
    assert.deepEqual(sonidosDe(plan, ctx), [
      { t: 0, tipo: 'click' },
      { t: 1.5, tipo: 'pop' },
      { t: 1.5, tipo: 'ding' },
    ]);
  });

  test('con el mismo instante conserva el orden de las escenas y no modifica los originales', () => {
    const original = { t: 0.5, tipo: 'tick', volumen: 0.3 };
    const plan = planificar(
      [
        [escena(1, { sonidos: [original] }), 2],
        [escena(1, { sonidos: [{ t: 0, tipo: 'pop' }] }), 2.5],
      ],
      ctx,
    );
    assert.deepEqual(sonidosDe(plan, ctx), [
      { t: 2.5, tipo: 'tick', volumen: 0.3 },
      { t: 2.5, tipo: 'pop' },
    ]);
    assert.equal(original.t, 0.5);
  });
});

describe('unirFuentes, unirImagenes e imagenesDe', () => {
  test('unirFuentes quita duplicados (peso 400 y estilo normal por defecto)', () => {
    const inter = { familia: 'Inter', url: '/kit/fuentes/inter.woff2' };
    const fuentes = unirFuentes([
      { fuentes: [inter, { familia: 'Inter', peso: 700, url: '/kit/fuentes/inter-bold.woff2' }] },
      { fuentes: [{ ...inter, peso: 400, estilo: 'normal' }] },
      {},
      { fuentes: [{ familia: 'Inter', url: '/kit/fuentes/inter.woff2', estilo: 'italic' }] },
    ]);
    assert.equal(fuentes.length, 3);
    assert.deepEqual(
      fuentes.map((f) => `${f.familia}|${f.peso ?? 400}|${f.estilo ?? 'normal'}`),
      ['Inter|400|normal', 'Inter|700|normal', 'Inter|400|italic'],
    );
  });

  test('unirImagenes prefija cada clave con el índice de su escena', () => {
    const imgs = unirImagenes([
      { imagenes: { logo: '/kit/marca/logo.png' } },
      {},
      { imagenes: { logo: '/kit/marca/logo-blanco.png', captura: '/kit/capturas/a.png' } },
    ]);
    assert.deepEqual(imgs, {
      '0:logo': '/kit/marca/logo.png',
      '2:logo': '/kit/marca/logo-blanco.png',
      '2:captura': '/kit/capturas/a.png',
    });
  });

  test('imagenesDe traduce nombre → imagen cargada usando la caché por URL', () => {
    const img = { ancho: 10 };
    const cache = new Map([['/kit/a.png', img]]);
    assert.deepEqual(imagenesDe({ imagenes: { a: '/kit/a.png', b: '/kit/falta.png' } }, cache), {
      a: img,
      b: undefined,
    });
    assert.deepEqual(imagenesDe({}, cache), {});
  });
});

describe('secuencia(): propiedades puras', () => {
  const gancho = escena(2, {
    nombre: 'gancho',
    fuentes: [{ familia: 'Inter', url: '/kit/fuentes/inter.woff2' }],
    imagenes: { logo: '/kit/marca/logo.png' },
    sonidos: [{ t: 1, tipo: 'pop' }],
  });
  const demo = escena((c) => c.tempo.pulsos(8), {
    nombre: 'demo',
    fuentes: [{ familia: 'Inter', url: '/kit/fuentes/inter.woff2' }],
    imagenes: { logo: '/kit/marca/logo.png' },
    sonidos: (c) => [{ t: c.tempo.pulsos(2), tipo: 'click' }],
  });

  test('valores por defecto: nombre "pelicula", sin música ni fondo', () => {
    const peli = secuencia([[gancho, 0]]);
    assert.equal(peli.nombre, 'pelicula');
    assert.equal(peli.musica, null);
    assert.equal(peli.fondo, undefined);
    assert.equal(typeof peli.montar, 'function');
    assert.equal(typeof peli.dibujar, 'function');
  });

  test('une fuentes sin duplicados e imágenes con prefijo', () => {
    const peli = secuencia([
      [gancho, 0],
      [demo, 2],
    ]);
    assert.equal(peli.fuentes.length, 1);
    assert.deepEqual(Object.keys(peli.imagenes), ['0:logo', '1:logo']);
  });

  test('duracion(ctx) y sonidos(ctx) dependen del tempo; los sonidos propios se mezclan y ordenan', () => {
    const musica = { archivo: 'kit/audio/musica.wav' };
    const peli = secuencia([[gancho, 0], { escena: demo, inicio: (c) => c.tempo.beat(4) }], {
      nombre: 'lanzamiento',
      fondo: '#000',
      musica,
      sonidos: [{ t: 0.5, tipo: 'whoosh' }],
    });
    assert.equal(peli.nombre, 'lanzamiento');
    assert.equal(peli.fondo, '#000');
    assert.equal(peli.musica, musica);
    assert.equal(peli.duracion(ctx), 6); // demo empieza en el pulso 4 (2 s) y dura 8 pulsos (4 s)
    assert.deepEqual(peli.sonidos(ctx), [
      { t: 0.5, tipo: 'whoosh' },
      { t: 1, tipo: 'pop' },
      { t: 3, tipo: 'click' },
    ]);
    const lento = { tempo: crearTempo({ bpm: 60 }) };
    assert.equal(peli.duracion(lento), 12);
  });

  test('los sonidos propios también pueden ser una función del contexto', () => {
    const peli = secuencia([[gancho, 0]], { sonidos: (c) => [{ t: c.tempo.beat(1), tipo: 'tick' }] });
    assert.deepEqual(peli.sonidos(ctx), [
      { t: 0.5, tipo: 'tick' },
      { t: 1, tipo: 'pop' },
    ]);
  });
});

describe('encadenar e inicioEncadenado', () => {
  const tres = [
    escena(2, { sonidos: [{ t: 0, tipo: 'a' }] }),
    escena(3, { sonidos: [{ t: 0, tipo: 'b' }] }),
    escena(1),
  ];

  test('sin solape, cada escena empieza cuando acaba la anterior', () => {
    assert.deepEqual(
      [0, 1, 2].map((i) => inicioEncadenado(tres, i, 0, ctx)),
      [0, 2, 5],
    );
    const peli = encadenar(tres);
    assert.equal(peli.duracion(ctx), 6);
    assert.deepEqual(peli.sonidos(ctx), [
      { t: 0, tipo: 'a' },
      { t: 2, tipo: 'b' },
    ]);
  });

  test('con solape, cada escena empieza "solape" segundos antes de que acabe la anterior', () => {
    assert.deepEqual(
      [0, 1, 2].map((i) => inicioEncadenado(tres, i, 0.5, ctx)),
      [0, 1.5, 4],
    );
    assert.equal(encadenar(tres, { solape: 0.5 }).duracion(ctx), 5);
  });

  test('pasa el resto de opciones a secuencia() y admite duraciones en pulsos', () => {
    const conPulsos = [escena((c) => c.tempo.pulsos(4)), escena((c) => c.tempo.pulsos(2))];
    const peli = encadenar(conPulsos, { solape: 0.25, nombre: 'cadena', musica: { archivo: 'm.wav' } });
    assert.equal(peli.nombre, 'cadena');
    assert.deepEqual(peli.musica, { archivo: 'm.wav' });
    cerca(inicioEncadenado(conPulsos, 1, 0.25, ctx), 1.75, 1e-12);
    cerca(peli.duracion(ctx), 2.75, 1e-12);
  });
});

describe('secuencia(): montar y dibujar (con DOM falso)', () => {
  let restaurar;
  before(() => {
    restaurar = instalarDomFalso();
  });
  after(() => restaurar());

  /** Escena que apunta qué se le pide montar y dibujar. */
  function espia(nombre, duracion, extra = {}) {
    const registro = { montajes: [], dibujos: [] };
    return {
      registro,
      escena: {
        nombre,
        duracion,
        ...extra,
        montar(capa, ctxHijo) {
          registro.montajes.push({ capa, ctxHijo });
        },
        dibujar(t, ctxHijo) {
          registro.dibujos.push({ t, ctxHijo });
        },
      },
    };
  }

  test('montar crea una capa por escena, apilada por orden, con su fondo y su contexto', async () => {
    const a = espia('a', 2, { fondo: '#111', imagenes: { logo: '/kit/logo.png' } });
    const b = espia(undefined, 3);
    const peli = encadenar([a.escena, b.escena], { solape: 0.5 });
    const escenario = document.createElement('div');
    const logo = { cargada: true };
    await peli.montar(escenario, { ...ctx, cache: new Map([['/kit/logo.png', logo]]) });

    assert.equal(escenario.children.length, 2);
    const [capaA, capaB] = escenario.children;
    assert.equal(capaA.dataset.escena, 'a');
    assert.equal(capaB.dataset.escena, '1'); // sin nombre: su índice
    assert.deepEqual(
      [capaA.style.position, capaA.style.inset, capaA.style.overflow, capaA.style.zIndex],
      ['absolute', '0', 'hidden', '0'],
    );
    assert.equal(capaB.style.zIndex, '1');
    assert.equal(capaA.style.background, '#111');
    assert.equal(capaB.style.background, undefined);

    const [{ capa, ctxHijo }] = a.registro.montajes;
    assert.equal(capa, capaA);
    assert.equal(ctxHijo.img.logo, logo);
    assert.equal(ctxHijo.inicioGlobal, 0);
    assert.equal(b.registro.montajes[0].ctxHijo.inicioGlobal, 1.5);
    assert.equal(b.registro.montajes[0].ctxHijo.tempo, ctx.tempo);
  });

  test('dibujar enseña solo las capas activas y les pasa su tiempo local', async () => {
    const a = espia('a', 2);
    const b = espia('b', 3);
    const peli = encadenar([a.escena, b.escena], { solape: 0.5 });
    const escenario = document.createElement('div');
    await peli.montar(escenario, ctx);
    const [capaA, capaB] = escenario.children;
    const visibles = () => [capaA.style.display, capaB.style.display];

    peli.dibujar(1, ctx);
    assert.deepEqual(visibles(), ['block', 'none']);
    assert.deepEqual(
      a.registro.dibujos.map((d) => d.t),
      [1],
    );

    peli.dibujar(1.75, ctx); // traspaso: las dos a la vez
    assert.deepEqual(visibles(), ['block', 'block']);
    assert.equal(a.registro.dibujos.at(-1).t, 1.75);
    cerca(b.registro.dibujos.at(-1).t, 0.25, 1e-12);

    peli.dibujar(4.5, ctx); // último instante
    assert.deepEqual(visibles(), ['none', 'block']);
    cerca(b.registro.dibujos.at(-1).t, 3, 1e-12);
    assert.equal(a.registro.dibujos.length, 2, 'una capa oculta no se dibuja');
  });

  test('sin caché en el contexto, montar no falla y las imágenes quedan sin cargar', async () => {
    const a = espia('a', 1, { imagenes: { logo: '/kit/logo.png' } });
    const peli = secuencia([[a.escena, 0]]);
    await peli.montar(document.createElement('div'), ctx);
    assert.deepEqual(a.registro.montajes[0].ctxHijo.img, { logo: undefined });
  });

  test('volver a montar sustituye las capas anteriores', async () => {
    const a = espia('a', 1);
    const peli = secuencia([[a.escena, 0]]);
    const primero = document.createElement('div');
    const segundo = document.createElement('div');
    await peli.montar(primero, ctx);
    await peli.montar(segundo, ctx);
    peli.dibujar(0.5, ctx);
    assert.equal(segundo.children[0].style.display, 'block');
    assert.equal(primero.children[0].style.display, undefined, 'la capa del primer montaje ya no se toca');
  });
});
