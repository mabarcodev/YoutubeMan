// Tests de engine/tempo.js: el reloj en pulsos que comparten imagen y sonido.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearTempo } from '../../engine/tempo.js';
import { cerca } from '../helpers/entorno.mjs';

describe('crearTempo', () => {
  test('valores por defecto: 120 bpm, pulso 0 en el segundo 0, compases de 4', () => {
    for (const tempo of [crearTempo(), crearTempo({})]) {
      assert.equal(tempo.bpm, 120);
      assert.equal(tempo.primerPulso, 0);
      assert.equal(tempo.pulsosPorCompas, 4);
      assert.equal(tempo.pulso, 0.5);
      assert.equal(tempo.beat(4), 2);
    }
  });

  test('beat() admite fracciones y respeta el primer pulso', () => {
    const tempo = crearTempo({ bpm: 120, primerPulso: 0.25 });
    assert.equal(tempo.beat(0), 0.25);
    assert.equal(tempo.beat(1), 0.75);
    assert.equal(tempo.beat(2.5), 1.5);
    assert.equal(tempo.beat(-1), -0.25);
  });

  test('aBeat() es la inversa de beat()', () => {
    const tempo = crearTempo({ bpm: 93, primerPulso: 0.37 });
    for (const n of [0, 1, 2.5, 17, 64.25]) cerca(tempo.aBeat(tempo.beat(n)), n, 1e-9, `pulso ${n}`);
    cerca(tempo.aBeat(0.37), 0, 1e-12);
  });

  test('compas() y pulsos() con compases de 3', () => {
    const tempo = crearTempo({ bpm: 90, primerPulso: 1, pulsosPorCompas: 3 });
    cerca(tempo.pulso, 60 / 90, 1e-12);
    cerca(tempo.compas(0), 1, 1e-12);
    cerca(tempo.compas(2), 1 + 2 * 3 * (60 / 90), 1e-12);
    cerca(tempo.pulsos(6), 4, 1e-12);
    cerca(tempo.pulsos(0.5), 1 / 3, 1e-12);
  });

  test('un bpm que no es > 0 lanza un error que dice qué ha recibido', () => {
    for (const malo of [0, -10, NaN, null, 'abc']) {
      assert.throws(() => crearTempo({ bpm: malo }), { message: /^bpm debe ser > 0 \(recibido: .*\)\.$/ });
    }
    assert.throws(() => crearTempo({ bpm: -10 }), { message: /recibido: -10/ });
  });

  test('un bpm infinito también es inválido (pulso 0 y aBeat() sin sentido)', () => {
    assert.throws(() => crearTempo({ bpm: Infinity }), /bpm debe ser/);
    assert.throws(() => crearTempo(JSON.parse('{"bpm": 1e999}')), /bpm debe ser/);
  });

  test('primerPulso tiene que ser un número finito: un texto daría "0.25" + 0.5 = "0.250.5"', () => {
    for (const malo of [NaN, Infinity, -Infinity, null, '0.25']) {
      assert.throws(() => crearTempo({ primerPulso: malo }), {
        message: /^primerPulso debe ser un número \(recibido: .*\)\.$/,
      });
    }
    assert.throws(() => crearTempo({ primerPulso: '0.25' }), { message: /recibido: 0\.25/ });
  });

  test('primerPulso puede ser negativo (la música empieza antes que el vídeo)', () => {
    const tempo = crearTempo({ bpm: 120, primerPulso: -0.5 });
    assert.equal(tempo.beat(1), 0);
    assert.equal(tempo.aBeat(0), 1);
    assert.equal(tempo.compas(1), 1.5);
  });

  test('pulsosPorCompas tiene que ser un número > 0, como el bpm (si no, compas() da compases de 0 s o hacia atrás)', () => {
    for (const malo of [0, null, -4, NaN, Infinity]) {
      assert.throws(() => crearTempo({ pulsosPorCompas: malo }), /pulsosPorCompas/, `pulsosPorCompas ${malo}`);
    }
    // Un compás de 5/8 son 2.5 pulsos de negra: no tiene por qué ser entero.
    assert.equal(crearTempo({ bpm: 120, pulsosPorCompas: 2.5 }).compas(2), 2.5);
  });
});
