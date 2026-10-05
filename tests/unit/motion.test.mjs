// Tests de engine/motion.js: la librería de movimiento. Todo es función pura de t, así que se puede
// comprobar con fórmulas cerradas y propiedades (continuidad, rangos, determinismo).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MUELLES,
  clamp,
  ease,
  hash01,
  indicador,
  keyframes,
  lerp,
  logZoom,
  loopT,
  progreso,
  rng,
  ruido,
  spring,
  springTo,
  stagger,
  swapAlpha,
  track,
  trackN,
} from '../../engine/motion.js';
import { cerca } from '../helpers/entorno.mjs';

const PRESETS = Object.keys(MUELLES);

/** Valores de f en n+1 puntos equiespaciados de [a, b] (por índice, sin acumular error de coma flotante). */
function muestrear(f, a, b, n) {
  return Array.from({ length: n + 1 }, (_, i) => f(a + ((b - a) * i) / n));
}

/** Primer instante (con resolución dt) en el que f(t) >= umbral. */
function tiempoHasta(f, umbral, dt = 1e-3, max = 10) {
  for (let i = 0; i * dt <= max; i++) if (f(i * dt) >= umbral) return i * dt;
  return Infinity;
}

describe('clamp, lerp y progreso', () => {
  test('clamp limita a [0, 1] por defecto y a cualquier rango', () => {
    assert.equal(clamp(-0.5), 0);
    assert.equal(clamp(1.5), 1);
    assert.equal(clamp(0.25), 0.25);
    assert.equal(clamp(15, 0, 10), 10);
    assert.equal(clamp(-3, -2, 2), -2);
  });

  test('lerp interpola y extrapola en línea recta', () => {
    assert.equal(lerp(2, 4, 0), 2);
    assert.equal(lerp(2, 4, 1), 4);
    assert.equal(lerp(0, 10, 0.5), 5);
    assert.equal(lerp(0, 10, 2), 20);
    assert.equal(lerp(10, 0, 0.25), 7.5);
  });

  test('progreso va de 0 a 1 dentro de la ventana y se queda fuera de ella', () => {
    assert.equal(progreso(5, 0, 10), 0.5);
    assert.equal(progreso(-1, 0, 10), 0);
    assert.equal(progreso(11, 0, 10), 1);
    assert.equal(progreso(2, 2, 4), 0);
    assert.equal(progreso(4, 2, 4), 1);
  });

  test('progreso con ventana nula es un escalón en ese instante (sin dividir por 0)', () => {
    assert.equal(progreso(0.999, 1, 1), 0);
    assert.equal(progreso(1, 1, 1), 1);
    assert.equal(progreso(3, 1, 1), 1);
    assert.ok(!Number.isNaN(progreso(1, 1, 1)));
  });
});

describe('spring', () => {
  test('vale 0 en t <= 0 con cualquier muelle', () => {
    for (const m of [...PRESETS, { k: 50, d: 30 }, undefined]) {
      assert.equal(spring(0, m), 0);
      assert.equal(spring(-1, m), 0);
      assert.equal(spring(-Infinity, m), 0);
    }
  });

  test('todos los presets tienden a 1', () => {
    for (const m of PRESETS) {
      cerca(spring(5, m), 1, 1e-5, `preset ${m} a los 5 s`);
      cerca(spring(30, m), 1, 1e-12, `preset ${m} a los 30 s`);
    }
  });

  test('arranca con velocidad 0: es continuo en t = 0 y empieza suave', () => {
    for (const m of PRESETS) {
      // Cerca de 0 un muelle crece como k·t²/2: con t = 1e-4 queda muy por debajo de 1e-5.
      assert.ok(spring(1e-4, m) < 1e-5, `preset ${m}: ${spring(1e-4, m)}`);
      assert.ok(spring(1e-4, m) > 0, `preset ${m} no arranca`);
    }
  });

  test('hay cuatro presets, todos con k y d positivos', () => {
    assert.deepEqual(PRESETS.sort(), ['jugueton', 'normal', 'pesado', 'rapido']);
    for (const { k, d } of Object.values(MUELLES)) {
      assert.ok(k > 0 && d > 0);
    }
  });

  test('el rebote está acotado según el preset (y coincide con la teoría)', () => {
    const rebote = (m) => Math.max(...muestrear((t) => spring(t, m), 0, 4, 8000)) - 1;
    // Sobreoscilación teórica de un muelle subamortiguado: exp(-z·π / √(1 - z²)).
    const teorico = (m) => {
      const { k, d } = MUELLES[m];
      const z = d / (2 * Math.sqrt(k));
      return z < 1 ? Math.exp((-z * Math.PI) / Math.sqrt(1 - z * z)) : 0;
    };
    const r = Object.fromEntries(PRESETS.map((m) => [m, rebote(m)]));
    assert.ok(r.rapido > 0.004 && r.rapido < 0.012, `rapido rebota ~1 %: ${r.rapido}`);
    assert.ok(r.normal < 1e-6, `normal no debe rebotar: ${r.normal}`);
    assert.ok(r.pesado < 1e-9, `pesado no debe pasarse de 1: ${r.pesado}`);
    assert.ok(r.jugueton > 0.2 && r.jugueton < 0.26, `jugueton rebota ~23 %: ${r.jugueton}`);
    for (const m of PRESETS) cerca(Math.max(0, r[m]), teorico(m), 1e-4, `rebote de ${m}`);
  });

  test('rapido llega antes que normal, y normal antes que pesado', () => {
    const t90 = (m) => tiempoHasta((t) => spring(t, m), 0.9);
    assert.ok(t90('rapido') < t90('normal'), `${t90('rapido')} vs ${t90('normal')}`);
    assert.ok(t90('normal') < t90('pesado'), `${t90('normal')} vs ${t90('pesado')}`);
  });

  test('sin muelle (undefined o null) usa el preset normal', () => {
    for (const t of [0.05, 0.3, 1]) {
      assert.equal(spring(t), spring(t, 'normal'));
      assert.equal(spring(t, null), spring(t, 'normal'));
    }
  });

  test('acepta un muelle propio {k, d}: rama crítica (z = 1) con su fórmula cerrada', () => {
    // k = 100, d = 20 → w0 = 10, z = 1: x(t) = 1 − e^(−10t)·(1 + 10t)
    for (const t of [0.01, 0.1, 0.25, 0.7, 2]) {
      cerca(spring(t, { k: 100, d: 20 }), 1 - Math.exp(-10 * t) * (1 + 10 * t), 1e-12, `t=${t}`);
    }
  });

  test('rama subamortiguada propia: coincide con la fórmula y rebota', () => {
    // k = 100, d = 10 → w0 = 10, z = 0.5, wd = 10·√0.75
    const wd = 10 * Math.sqrt(0.75);
    const esperado = (t) => 1 - Math.exp(-5 * t) * (Math.cos(wd * t) + (5 / wd) * Math.sin(wd * t));
    for (const t of [0.05, 0.2, 0.36, 1]) cerca(spring(t, { k: 100, d: 10 }), esperado(t), 1e-12, `t=${t}`);
    assert.ok(Math.max(...muestrear((t) => spring(t, { k: 100, d: 10 }), 0, 2, 2000)) > 1.1);
  });

  test('rama sobreamortiguada: sube monótona, nunca pasa de 1 y es más lenta que la crítica', () => {
    const sobre = { k: 100, d: 40 }; // z = 2
    const valores = muestrear((t) => spring(t, sobre), 0, 5, 2000);
    for (let i = 1; i < valores.length; i++) assert.ok(valores[i] >= valores[i - 1], `baja en la muestra ${i}`);
    assert.ok(Math.max(...valores) <= 1);
    assert.ok(spring(0.3, sobre) < spring(0.3, { k: 100, d: 20 }));
    // Fórmula de dos raíces reales: r1 = −10(2 − √3), r2 = −10(2 + √3)
    const r1 = -10 * (2 - Math.sqrt(3));
    const r2 = -10 * (2 + Math.sqrt(3));
    const esperado = (t) => 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
    for (const t of [0.1, 0.5, 2]) cerca(spring(t, sobre), esperado(t), 1e-12, `t=${t}`);
    cerca(spring(30, sobre), 1, 1e-9);
  });

  test('un preset desconocido lanza un error que dice cuáles hay', () => {
    assert.throws(() => spring(1, 'rapidisimo'), {
      message: /Muelle desconocido: "rapidisimo".*rapido, normal, pesado, jugueton/,
    });
  });
});

describe('springTo', () => {
  test('va de "de" a "a" con un muelle que arranca en "inicio"', () => {
    assert.equal(springTo(0.5, 10, 20, 1), 10);
    assert.equal(springTo(1, 10, 20, 1), 10);
    cerca(springTo(30, 10, 20, 1), 20, 1e-9);
    cerca(springTo(1.2, 10, 20, 1), 10 + 10 * spring(0.2), 1e-12);
  });

  test('inicio por defecto 0 y muelle a elegir', () => {
    cerca(springTo(0.3, 0, 100), 100 * spring(0.3), 1e-12);
    cerca(springTo(1.2, 0, 1, 1, 'jugueton'), spring(0.2, 'jugueton'), 1e-12);
    cerca(springTo(1.2, 5, -5, 1, { k: 100, d: 20 }), 5 - 10 * spring(0.2, { k: 100, d: 20 }), 1e-12);
  });
});

describe('track', () => {
  const claves = [
    [0, 0],
    [0.2, 100],
    [0.4, -50],
  ];

  test('sin claves lanza un error claro', () => {
    assert.throws(() => track(1, []), { message: /track\(\) necesita al menos una clave/ });
  });

  test('con una sola clave devuelve siempre ese valor', () => {
    for (const t of [-5, 0, 3, 100]) assert.equal(track(t, [[1, 7]]), 7);
  });

  test('antes del primer cambio vale el primer valor y al final llega al último', () => {
    assert.equal(track(-1, claves), 0);
    assert.equal(track(0.2, claves), 0);
    cerca(track(20, claves), -50, 1e-9);
  });

  test('en cada tiempo clave sigue el movimiento anterior: el nuevo muelle suma 0 en su arranque', () => {
    assert.equal(track(0.4, claves), track(0.4, claves.slice(0, 2)));
  });

  test('es continuo en los tiempos clave, en valor y en velocidad (no reinicia el muelle)', () => {
    const f = (t) => track(t, claves);
    // Con h pequeño, las derivadas por la izquierda y por la derecha solo difieren en O(h·aceleración).
    // Un muelle que se reiniciara daría un salto de velocidad de cientos de unidades por segundo.
    const h = 1e-7;
    for (const [tk] of claves.slice(1)) {
      assert.ok(Math.abs(f(tk + h) - f(tk - h)) < 1e-3, `salto de valor en t=${tk}`);
      const izq = (f(tk) - f(tk - h)) / h;
      const der = (f(tk + h) - f(tk)) / h;
      assert.ok(Math.abs(izq - der) < 0.05, `salto de velocidad en t=${tk}: ${izq} vs ${der}`);
    }
    // En t = 0.4 el primer muelle aún se mueve: el cambio de destino ocurre en pleno movimiento.
    assert.ok(Math.abs((f(0.4) - f(0.4 - h)) / h) > 1);
  });

  test('acepta presets y muelles propios', () => {
    const dos = [
      [0, 0],
      [1, 10],
    ];
    cerca(track(1.3, dos, 'rapido'), 10 * spring(0.3, 'rapido'), 1e-12);
    cerca(track(1.3, dos, { k: 100, d: 20 }), 10 * spring(0.3, { k: 100, d: 20 }), 1e-12);
  });
});

describe('trackN', () => {
  const claves = [
    [0, [0, 100]],
    [1, [50, 0]],
    [2, [-20, 40]],
  ];

  test('cada componente es un track() independiente', () => {
    const x = claves.map(([t, v]) => [t, v[0]]);
    const y = claves.map(([t, v]) => [t, v[1]]);
    for (const t of [-1, 0.5, 1.1, 2.05, 3]) {
      assert.deepEqual(trackN(t, claves), [track(t, x), track(t, y)]);
      assert.deepEqual(trackN(t, claves, 'rapido'), [track(t, x, 'rapido'), track(t, y, 'rapido')]);
    }
  });

  test('llega al destino y admite tuplas de cualquier longitud', () => {
    const [x, y] = trackN(30, claves);
    cerca(x, -20, 1e-9);
    cerca(y, 40, 1e-9);
    const tres = trackN(30, [
      [0, [1, 2, 3]],
      [1, [4, 5, 6]],
    ]);
    assert.equal(tres.length, 3);
    tres.forEach((v, i) => cerca(v, 4 + i, 1e-9));
  });

  test('sin claves lanza el mismo error claro que track()', () => {
    assert.throws(() => trackN(0, []), { message: /necesita al menos una clave/ });
  });
});

describe('logZoom', () => {
  test('siempre es > 0, incluso con un muelle que rebota (un track lineal se iría a negativo)', () => {
    const claves = [
      [0, 4],
      [0.5, 0.1],
    ];
    const zooms = muestrear((t) => logZoom(t, claves, 'jugueton'), 0, 3, 3000);
    assert.ok(Math.min(...zooms) > 0);
    const lineal = muestrear((t) => track(t, claves, 'jugueton'), 0, 3, 3000);
    assert.ok(Math.min(...lineal) < 0, 'el ejemplo debe ser uno en el que el zoom lineal falla');
  });

  test('extremos: zoom inicial antes del cambio y final al asentarse', () => {
    const claves = [
      [0, 1],
      [1, 4],
    ];
    cerca(logZoom(-1, claves), 1, 1e-12);
    cerca(logZoom(1, claves), 1, 1e-12);
    cerca(logZoom(30, claves), 4, 1e-9);
  });

  test('interpola en escala logarítmica: z = a·(b/a)^muelle', () => {
    for (const t of [1.05, 1.2, 1.5]) {
      cerca(
        logZoom(t, [
          [0, 1],
          [1, 4],
        ]),
        4 ** spring(t - 1),
        1e-12,
        `t=${t}`,
      );
    }
  });

  test('ir de 1x a 2x avanza en la misma proporción que ir de 2x a 4x', () => {
    for (const t of [0.05, 0.1, 0.3]) {
      const a = logZoom(t, [
        [0, 1],
        [0, 2],
      ]);
      const b = logZoom(t, [
        [0, 2],
        [0, 4],
      ]);
      cerca(b / a, 2, 1e-12);
    }
  });
});

describe('indicador', () => {
  test('quieto antes de moverse: izq = der = posición inicial', () => {
    assert.deepEqual(
      indicador(0.5, [
        [0, 0],
        [1, 100],
      ]),
      { izq: 0, der: 0 },
    );
  });

  test('hacia la derecha lidera el borde derecho (muelle más rígido) y la forma se estira', () => {
    const stops = [
      [0, 0],
      [1, 100],
    ];
    const { izq, der } = indicador(1.05, stops);
    assert.ok(der > izq, `${der} > ${izq}`);
    assert.equal(der, track(1.05, stops, { k: 320, d: 30 }));
    assert.equal(izq, track(1.05, stops, { k: 140, d: 22 }));
  });

  test('hacia la izquierda lidera el borde izquierdo', () => {
    const stops = [
      [0, 100],
      [1, 0],
    ];
    const { izq, der } = indicador(1.05, stops);
    assert.ok(izq < der);
    assert.equal(izq, track(1.05, stops, { k: 320, d: 30 }));
  });

  test('siempre izq <= der y ambos bordes acaban en el destino', () => {
    const stops = [
      [0, 0],
      [0.5, 300],
      [1, 120],
    ];
    for (const t of [0, 0.52, 0.6, 1.01, 1.2, 2]) {
      const { izq, der } = indicador(t, stops);
      assert.ok(izq <= der, `t=${t}`);
    }
    const fin = indicador(30, stops);
    cerca(fin.izq, 120, 1e-6);
    cerca(fin.der, 120, 1e-6);
  });
});

describe('swapAlpha', () => {
  test('entra después del inicio de la transformación y sale antes de la siguiente (valores por defecto)', () => {
    // retraso 0.08, entrada 0.12, salida 0.1
    const casos = [
      [1, 0],
      [1.08, 0],
      [1.14, 0.5],
      [1.2, 1],
      [2, 1],
      [2.8, 1],
      [2.85, 0.5],
      [2.9, 0],
      [3, 0],
    ];
    for (const [t, esperado] of casos) cerca(swapAlpha(t, 1, 3), esperado, 1e-9, `t=${t}`);
  });

  test('admite retraso, entrada y salida propios y siempre queda en [0, 1]', () => {
    const op = { retraso: 0, entrada: 0.5, salida: 0.5 };
    cerca(swapAlpha(0.25, 0, 2, op), 0.5, 1e-12);
    cerca(swapAlpha(1.25, 0, 2, op), 0.5, 1e-12);
    for (const v of muestrear((t) => swapAlpha(t, 0, 0.2), -1, 2, 300)) assert.ok(v >= 0 && v <= 1);
  });
});

describe('loopT y stagger', () => {
  test('loopT envuelve tiempos positivos y negativos a [0, dur)', () => {
    assert.equal(loopT(2.5, 2), 0.5);
    assert.equal(loopT(4, 2), 0);
    assert.equal(loopT(-0.5, 2), 1.5);
    assert.equal(loopT(-2, 2), 0);
    assert.ok(!Object.is(loopT(-2, 2), -0), 'nunca -0');
  });

  test('loopT siempre cae en [0, dur) (propiedad con 2000 valores)', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const t = (r() - 0.5) * 200;
      const dur = 0.1 + r() * 10;
      const v = loopT(t, dur);
      assert.ok(v >= 0 && v < dur, `loopT(${t}, ${dur}) = ${v}`);
    }
  });

  test('stagger escalona por índice con paso e inicio', () => {
    assert.equal(stagger(0), 0);
    cerca(stagger(3), 0.15, 1e-12);
    cerca(stagger(2, 0.1, 1), 1.2, 1e-12);
  });
});

describe('rng, hash01 y ruido (aleatoriedad determinista)', () => {
  test('rng: la misma semilla da la misma secuencia', () => {
    const a = rng(42);
    const b = rng(42);
    for (let i = 0; i < 100; i++) assert.equal(a(), b());
  });

  test('rng: cada generador tiene su propio estado', () => {
    const a = rng(1);
    const b = rng(1);
    a();
    a();
    assert.equal(b(), rng(1)());
  });

  test('rng: valores en [0, 1) y repartidos de forma uniforme', () => {
    const r = rng(123);
    const cubos = new Array(10).fill(0);
    let suma = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1, `${v} fuera de [0, 1)`);
      suma += v;
      cubos[Math.floor(v * 10)]++;
    }
    cerca(suma / n, 0.5, 0.02, 'media');
    for (const c of cubos) assert.ok(c > n * 0.08 && c < n * 0.12, `decil con ${c}`);
  });

  test('rng: semillas distintas dan secuencias distintas; las decimales se truncan', () => {
    const primeros = [1, 2, 3, 42, 1000].map((s) => rng(s)());
    assert.equal(new Set(primeros).size, primeros.length);
    assert.equal(rng(7.9)(), rng(7)());
  });

  test('hash01: determinista, en [0, 1), con índice 0 por defecto y distinto para cada índice', () => {
    assert.equal(hash01(5, 3), hash01(5, 3));
    assert.equal(hash01(5), hash01(5, 0));
    const valores = Array.from({ length: 200 }, (_, i) => hash01(9, i));
    for (const v of valores) assert.ok(v >= 0 && v < 1);
    assert.ok(new Set(valores).size >= 195);
    assert.notEqual(hash01(1, 0), hash01(2, 0));
  });

  test('ruido: en [-1, 1] y determinista, también con x negativo', () => {
    for (const v of muestrear((x) => ruido(3, x), -20, 20, 4000)) assert.ok(v >= -1 && v <= 1);
    assert.equal(ruido(3, 1.234), ruido(3, 1.234));
    assert.notEqual(ruido(3, 1.5), ruido(4, 1.5));
  });

  test('ruido: en los enteros vale el hash del punto y entre ellos es continuo y suave', () => {
    for (const n of [-2, 0, 1, 5]) cerca(ruido(11, n), hash01(11, n) * 2 - 1, 1e-12);
    for (const n of [1, 2, 3, -1]) {
      // Continuo...
      assert.ok(Math.abs(ruido(11, n + 1e-7) - ruido(11, n - 1e-7)) < 1e-6);
      // ...y con pendiente 0 en los enteros (smoothstep): la diferencia es de orden h².
      const h = 1e-4;
      assert.ok(Math.abs(ruido(11, n + h) - ruido(11, n)) < 1e-6, `pendiente en ${n}`);
    }
  });
});

describe('ease y keyframes', () => {
  test('todas las curvas van de 0 a 1 y son crecientes', () => {
    for (const [nombre, f] of Object.entries(ease)) {
      cerca(f(0), 0, 1e-12, `${nombre}(0)`);
      cerca(f(1), 1, 1e-12, `${nombre}(1)`);
      const v = muestrear(f, 0, 1, 200);
      for (let i = 1; i < v.length; i++) assert.ok(v[i] >= v[i - 1] - 1e-12, `${nombre} baja en ${i}`);
    }
  });

  test('lineal es la identidad; inOutCubic es simétrica; outExpo no se pasa de 1', () => {
    assert.equal(ease.lineal(0.37), 0.37);
    assert.equal(ease.inOutCubic(0.5), 0.5);
    for (const p of [0.1, 0.25, 0.4]) cerca(ease.inOutCubic(p) + ease.inOutCubic(1 - p), 1, 1e-12);
    assert.equal(ease.outExpo(1.5), 1);
    cerca(ease.outCubic(0.5), 0.875, 1e-12);
  });

  test('keyframes: antes del primero, entre dos y después del último', () => {
    const claves = [
      [1, 0],
      [2, 10],
      [4, 30],
    ];
    assert.equal(keyframes(0, claves), 0);
    assert.equal(keyframes(1, claves), 0);
    assert.equal(keyframes(1.5, claves), 5); // inOutCubic(0.5) = 0.5
    cerca(keyframes(1.25, claves), 10 * ease.inOutCubic(0.25), 1e-12);
    assert.equal(keyframes(2, claves), 10);
    assert.equal(keyframes(3, claves), 20);
    assert.equal(keyframes(4, claves), 30);
    assert.equal(keyframes(99, claves), 30);
  });

  test('keyframes con otra curva y con una sola clave', () => {
    const claves = [
      [0, 0],
      [1, 10],
    ];
    assert.equal(keyframes(0.25, claves, ease.lineal), 2.5);
    cerca(keyframes(0.25, claves, ease.outCubic), 10 * ease.outCubic(0.25), 1e-12);
    for (const t of [-1, 1, 5]) assert.equal(keyframes(t, [[1, 7]]), 7);
  });
});
