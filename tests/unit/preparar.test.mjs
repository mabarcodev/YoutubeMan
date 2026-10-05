// Tests de tools/preparar.mjs con un "sistema" falso: nunca instala nada de verdad.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buscarPython, candidatosPython, pasosPreparar, preparar } from '../../tools/preparar.mjs';

const E = path.join('C:', 'Vídeos Ñ', '_estudio');

describe('buscarPython', () => {
  test('Windows prueba primero el lanzador py -3; macOS/Linux, python3', () => {
    assert.deepEqual(candidatosPython('win32')[0], ['py', ['-3']]);
    assert.deepEqual(candidatosPython('linux')[0], ['python3', []]);
  });

  test('devuelve el primero que responde con Python 3 y descarta Python 2', () => {
    const respuestas = {
      python3: { status: 0, stdout: '', stderr: 'Python 2.7.18' },
      python: { status: 0, stdout: 'Python 3.12.4', stderr: '' },
    };
    const correr = (bin) => respuestas[bin] ?? { status: 1, stdout: '', stderr: '' };
    assert.deepEqual(buscarPython({ plataforma: 'linux', correr }), ['python', []]);
    assert.equal(buscarPython({ plataforma: 'linux', correr: () => ({ status: 1 }) }), null);
  });
});

describe('pasosPreparar', () => {
  test('sin entorno: navegador, crear .venv, pip, requirements y diagnóstico', () => {
    const pasos = pasosPreparar({
      estudio: E,
      plataforma: 'win32',
      hayVenv: false,
      python: ['py', ['-3']],
      nodo: 'node',
    });
    assert.deepEqual(
      pasos.map((p) => p.descripcion),
      [
        'Navegador de capturas (Chromium de Playwright)',
        'Entorno de Python del estudio (.venv)',
        'pip al día dentro del entorno',
        'librosa y compañía (requirements.txt)',
        'Diagnóstico',
      ],
    );
    assert.deepEqual(pasos[1].args, ['-3', '-m', 'venv', path.join(E, '.venv')]);
    assert.equal(pasos[3].bin, path.join(E, '.venv', 'Scripts', 'python.exe'));
    assert.deepEqual(pasos[3].args.slice(-2), ['-r', path.join(E, 'requirements.txt')]);
  });

  test('con entorno: no lo recrea ni necesita el Python del sistema', () => {
    const pasos = pasosPreparar({ estudio: E, plataforma: 'linux', hayVenv: true, nodo: 'node' });
    assert.ok(!pasos.some((p) => p.args.includes('venv')));
    assert.equal(pasos[1].bin, path.join(E, '.venv', 'bin', 'python'));
  });

  test('sin entorno y sin Python: error claro', () => {
    assert.throws(() => pasosPreparar({ estudio: E, hayVenv: false, python: null }), /No encuentro Python 3/);
  });
});

describe('preparar', () => {
  test('sin npm install: lo pide antes de nada', () => {
    assert.throws(() => preparar({ estudio: E, existe: () => false }), /npm install/);
  });

  test('ejecuta los pasos en orden y se para en el primero que falla', () => {
    const llamadas = [];
    const correr = (bin, args) => {
      llamadas.push([bin, ...args].join(' '));
      if (args.includes('--version')) return { status: 0, stdout: 'Python 3.12.4' };
      return { status: args.includes('requirements.txt') || args.some((a) => a.endsWith('requirements.txt')) ? 1 : 0 };
    };
    const existe = (p) => !p.includes('.venv');
    assert.throws(() => preparar({ estudio: E, correr, existe, log: () => {} }), /Falló: librosa y compañía/);
    assert.ok(llamadas.some((l) => l.includes('install chromium')));
    assert.ok(llamadas.some((l) => l.includes('-m venv')));
    assert.ok(!llamadas.some((l) => l.includes('doctor.mjs')), 'tras un fallo no sigue');
  });
});
