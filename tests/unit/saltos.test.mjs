// Tests de tools/lib/saltos.mjs con fotogramas sintéticos: un fotograma raro aislado es un salto;
// un corte de plano o un vídeo quieto no lo son.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarSaltos, diferenciaMedia } from '../../tools/lib/saltos.mjs';

const TAM = 16 * 9;
const liso = (v) => new Uint8Array(TAM).fill(v);
/** Degradado que se desplaza un poco en cada fotograma: movimiento suave normal. */
const degradado = (desplazamiento) => Uint8Array.from({ length: TAM }, (_, i) => (i * 2 + desplazamiento) % 256);
const suave = (n) => Array.from({ length: n }, (_, i) => degradado(i * 2));

describe('diferenciaMedia', () => {
  test('0 entre fotogramas iguales y la media del valor absoluto si no', () => {
    assert.equal(diferenciaMedia(liso(7), liso(7)), 0);
    assert.equal(diferenciaMedia(Uint8Array.from([0, 0]), Uint8Array.from([10, 20])), 15);
    assert.equal(diferenciaMedia(Uint8Array.from([200, 0]), Uint8Array.from([0, 200])), 200);
  });

  test('fotogramas de distinto tamaño: error claro', () => {
    assert.throws(() => diferenciaMedia(new Uint8Array(4), new Uint8Array(5)), {
      message: /Los fotogramas deben tener el mismo tamaño/,
    });
  });
});

describe('detectarSaltos', () => {
  test('detecta un fotograma raro aislado con su índice y puntuación', () => {
    const fotos = suave(10);
    fotos[5] = liso(255);
    const saltos = detectarSaltos(fotos);
    assert.equal(saltos.length, 1);
    assert.equal(saltos[0].indice, 5);
    assert.ok(saltos[0].puntuacion > 50, `puntuación ${saltos[0].puntuacion}`);
    assert.equal(saltos[0].puntuacion, Math.round(saltos[0].puntuacion * 10) / 10);
  });

  test('un corte de plano NO es un salto', () => {
    const fotos = [...Array(5).fill(liso(0)), ...Array(5).fill(liso(255))];
    assert.deepEqual(detectarSaltos(fotos), []);
    const conMovimiento = [...suave(5), ...suave(5).map((f) => f.map((v) => 255 - v))];
    assert.deepEqual(detectarSaltos(conMovimiento), []);
  });

  test('un vídeo quieto o con movimiento suave NO tiene saltos', () => {
    assert.deepEqual(detectarSaltos(Array(8).fill(liso(128))), []);
    assert.deepEqual(detectarSaltos(suave(30)), []);
  });

  test('con menos de 3 fotogramas no hay vecinos que comparar', () => {
    assert.deepEqual(detectarSaltos([]), []);
    assert.deepEqual(detectarSaltos([liso(0)]), []);
    assert.deepEqual(detectarSaltos([liso(0), liso(255)]), []);
  });

  test('varios saltos salen ordenados de peor a menos malo', () => {
    const fotos = Array.from({ length: 12 }, () => liso(100));
    fotos[3] = liso(130); // salto pequeño (30)
    fotos[8] = liso(250); // salto grande (150)
    const saltos = detectarSaltos(fotos);
    assert.deepEqual(
      saltos.map((s) => s.indice),
      [8, 3],
    );
    assert.deepEqual(
      saltos.map((s) => s.puntuacion),
      [150, 30],
    );
  });

  test('el umbral decide qué cuenta como salto', () => {
    const fotos = Array.from({ length: 5 }, () => liso(100));
    fotos[2] = liso(108); // diferencia 8
    assert.deepEqual(detectarSaltos(fotos), []); // umbral 10 por defecto
    assert.deepEqual(
      detectarSaltos(fotos, { umbral: 5 }).map((s) => s.indice),
      [2],
    );
  });
});
