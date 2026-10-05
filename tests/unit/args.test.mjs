import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { leerArgs, traducirErrorArgs } from '../../tools/lib/args.mjs';

const OPCIONES = { fps: { type: 'string' }, borrador: { type: 'boolean' } };

describe('leerArgs', () => {
  test('con argumentos válidos devuelve lo mismo que parseArgs', () => {
    const { values } = leerArgs({ args: ['--fps', '30', '--borrador'], options: OPCIONES, strict: true });
    assert.deepEqual({ ...values }, { fps: '30', borrador: true });
  });

  test('un número negativo separado del nombre explica cómo escribirlo', () => {
    assert.throws(() => leerArgs({ args: ['--fps', '-30'], options: OPCIONES, strict: true }), {
      message: /Falta el valor de --fps .*--fps=-30/,
    });
  });

  test('una opción sin valor al final también se explica', () => {
    assert.throws(() => leerArgs({ args: ['--fps'], options: OPCIONES, strict: true }), {
      message: /Falta el valor de --fps/,
    });
  });

  test('con alias corto el mensaje usa el nombre largo de la opción', () => {
    const opciones = { salida: { type: 'string', short: 'o' } };
    assert.throws(() => leerArgs({ args: ['-o'], options: opciones, strict: true }), {
      message: /^Falta el valor de --salida /,
    });
  });

  test('un interruptor con valor dice que no lleva valor (no que le falta)', () => {
    assert.throws(() => leerArgs({ args: ['--borrador=si'], options: OPCIONES, strict: true }), {
      message: /^--borrador no lleva valor: es un interruptor/,
    });
  });

  test('una opción desconocida dice cuál es y remite a --ayuda', () => {
    assert.throws(() => leerArgs({ args: ['--nope'], options: OPCIONES, strict: true }), {
      message: /Opción desconocida: --nope\. Usa --ayuda/,
    });
  });

  test('un argumento suelto inesperado dice cuál es', () => {
    assert.throws(() => leerArgs({ args: ['suelto ñ'], options: OPCIONES, strict: true }), {
      message: /Argumento inesperado: "suelto ñ"/,
    });
  });

  test('el error original queda como causa y se conserva su código', () => {
    try {
      leerArgs({ args: ['--nope'], options: OPCIONES, strict: true });
      assert.fail('debería lanzar');
    } catch (e) {
      assert.equal(e.cause?.code, 'ERR_PARSE_ARGS_UNKNOWN_OPTION');
      assert.equal(e.code, 'ERR_PARSE_ARGS_UNKNOWN_OPTION');
    }
  });
});

describe('traducirErrorArgs', () => {
  test('un error que no es de parseArgs conserva su mensaje', () => {
    assert.equal(traducirErrorArgs(new Error('otra cosa')), 'otra cosa');
    assert.equal(traducirErrorArgs('texto'), 'texto');
  });
});
