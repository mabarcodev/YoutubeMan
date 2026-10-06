// Tests de tools/preparar.mjs con un "sistema" falso: nunca instala nada de verdad.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buscarPython,
  candidatosPython,
  mensajeFinal,
  pasoLibrerias,
  pasosPreparar,
  preparar,
} from '../../tools/preparar.mjs';

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

  test('sin entorno y sin Python: error claro, antes de descargar nada', () => {
    assert.throws(
      () => pasosPreparar({ estudio: E, hayModulos: false, hayVenv: false, python: null }),
      /No encuentro Python 3.*npm run instalar/,
    );
  });

  test('recién clonado (sin node_modules): lo primero son las librerías con npm ci', () => {
    const npm = path.join('C:', 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const pasos = pasosPreparar({
      estudio: E,
      plataforma: 'win32',
      hayModulos: false,
      hayVenv: false,
      python: ['py', ['-3']],
      nodo: 'node',
      npmExecPath: npm,
    });
    assert.equal(pasos.length, 6);
    assert.match(pasos[0].descripcion, /^Librerías del estudio \(npm ci/);
    assert.deepEqual([pasos[0].bin, ...pasos[0].args], ['node', npm, 'ci']);
    assert.equal(pasos[1].descripcion, 'Navegador de capturas (Chromium de Playwright)');
  });
});

describe('pasoLibrerias', () => {
  test('lanzado con npm run: usa el npm-cli.js de npm_execpath con el mismo Node', () => {
    const npm = '/usr/lib/node_modules/npm/bin/npm-cli.js';
    const p = pasoLibrerias({ npmExecPath: npm, plataforma: 'linux', nodo: '/usr/bin/node' });
    assert.deepEqual([p.bin, ...p.args], ['/usr/bin/node', npm, 'ci']);
    assert.equal(p.shell, undefined);
  });

  test('sin npm run (o con otro gestor): npm por su nombre; en Windows a través de la shell', () => {
    // null y no undefined: undefined activaría el valor por defecto, que bajo `npm test` es el npm real.
    assert.deepEqual(pasoLibrerias({ npmExecPath: null, plataforma: 'win32' }), {
      descripcion: 'Librerías del estudio (npm ci, versiones de package-lock.json)',
      bin: 'npm ci',
      args: [],
      shell: true,
    });
    const linux = pasoLibrerias({ npmExecPath: '/home/ana/.pnpm/pnpm.cjs', plataforma: 'linux' });
    assert.deepEqual([linux.bin, ...linux.args], ['npm', 'ci']);
  });
});

describe('mensajeFinal', () => {
  test('dice dónde abrir la IA y qué escribir, con Claude Code y con otras IAs', () => {
    const texto = mensajeFinal(E);
    assert.match(texto, /^✅ youtubeman está listo\./);
    assert.ok(texto.includes(`Abre tu IA dentro de esta carpeta: ${E}`));
    assert.match(texto, /Claude Code \(recomendado\): escribe \/youtubeman/);
    assert.match(texto, /Otra IA .*AGENTS\.md/);
  });
});

describe('preparar', () => {
  test('recién clonado: instala las librerías y sigue con todo lo demás', () => {
    const llamadas = [];
    const correr = (bin, args, opciones) => {
      llamadas.push({ orden: [bin, ...args].join(' '), shell: opciones?.shell });
      return args.includes('--version') ? { status: 0, stdout: 'Python 3.12.4' } : { status: 0 };
    };
    const n = preparar({ estudio: E, correr, existe: () => false, log: () => {}, npmExecPath: null });
    const pasos = llamadas.filter((l) => !l.orden.includes('--version'));
    assert.equal(n, 6);
    assert.equal(pasos.length, 6);
    assert.equal(pasos[0].orden, 'npm ci');
    assert.equal(pasos[0].shell, process.platform === 'win32' ? true : undefined, 'en Windows npm es un .cmd');
    assert.ok(pasos.at(-1).orden.endsWith('doctor.mjs'));
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
