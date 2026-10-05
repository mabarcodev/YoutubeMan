// Tests de tools/lib/rutas.mjs: raíces del estudio, detección del script principal, rutas URL de módulos
// (con las barras y unidades de Windows) y nombres de archivo seguros.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESTUDIO, VIDEOS, esPrincipal, rutaURLModulo, slug } from '../../tools/lib/rutas.mjs';
import { ESTUDIO as ESTUDIO_TESTS } from '../helpers/entorno.mjs';

describe('ESTUDIO y VIDEOS', () => {
  test('ESTUDIO es la raíz de _estudio y VIDEOS su carpeta padre', () => {
    assert.equal(ESTUDIO, ESTUDIO_TESTS);
    assert.ok(fs.existsSync(path.join(ESTUDIO, 'engine', 'motion.js')));
    assert.ok(fs.existsSync(path.join(ESTUDIO, 'tools', 'render.mjs')));
    assert.equal(VIDEOS, path.dirname(ESTUDIO));
  });
});

describe('esPrincipal', () => {
  /** Ejecuta fn con process.argv[1] cambiado y lo restaura pase lo que pase. */
  function conArgv1(valor, fn) {
    const antes = process.argv[1];
    try {
      if (valor === undefined) process.argv.splice(1, 1);
      else process.argv[1] = valor;
      return fn();
    } finally {
      if (valor === undefined) process.argv.splice(1, 0, antes);
      else process.argv[1] = antes;
    }
  }

  test('true solo para el módulo que se ha ejecutado con node', () => {
    const script = path.join(ESTUDIO, 'tools', 'render.mjs');
    conArgv1(script, () => {
      assert.equal(esPrincipal(pathToFileURL(script).href), true);
      assert.equal(esPrincipal(pathToFileURL(path.join(ESTUDIO, 'tools', 'revisar.mjs')).href), false);
    });
  });

  test('funciona con rutas relativas y con espacios y tildes (import.meta.url las codifica)', () => {
    const script = path.resolve('Vídeos con espacios', 'herramienta ñ.mjs');
    const url = pathToFileURL(script).href;
    assert.match(url, /V%C3%ADdeos%20con%20espacios/);
    conArgv1(path.relative(process.cwd(), script), () => assert.equal(esPrincipal(url), true));
  });

  test('false si no hay script (node -e, REPL)', () => {
    conArgv1(undefined, () => assert.equal(esPrincipal(pathToFileURL(path.join(ESTUDIO, 'x.mjs')).href), false));
  });
});

describe('rutaURLModulo', () => {
  const proyecto = path.resolve('/tmp-estudio-test/Vídeos/Mi proyecto');

  test('ruta relativa al proyecto → ruta URL con barras /', () => {
    assert.equal(rutaURLModulo(proyecto, 'pelicula.js'), '/pelicula.js');
    assert.equal(rutaURLModulo(proyecto, 'escenas/01-gancho/escena.js'), '/escenas/01-gancho/escena.js');
    assert.equal(rutaURLModulo(proyecto, 'escenas/01 gancho/escena.js'), '/escenas/01 gancho/escena.js');
  });

  test('ruta absoluta dentro del proyecto', () => {
    assert.equal(
      rutaURLModulo(proyecto, path.join(proyecto, 'escenas', '02-demo', 'escena.js')),
      '/escenas/02-demo/escena.js',
    );
  });

  test('barras invertidas de Windows', { skip: process.platform !== 'win32' && 'solo en Windows' }, () => {
    assert.equal(rutaURLModulo(proyecto, 'escenas\\03-cierre\\escena.js'), '/escenas/03-cierre/escena.js');
  });

  test('fuera del proyecto lanza un error que dice dónde está cada cosa', () => {
    assert.throws(() => rutaURLModulo(proyecto, '../otro/escena.js'), {
      message: /El módulo .*otro.*escena\.js no está dentro del proyecto .*Mi proyecto/,
    });
    assert.throws(
      () => rutaURLModulo(proyecto, path.resolve('/otra-carpeta/escena.js')),
      /no está dentro del proyecto/,
    );
  });

  test('otra unidad de disco', { skip: process.platform !== 'win32' && 'solo en Windows' }, () => {
    const otraUnidad = proyecto.startsWith('Z:') ? 'Y:\\x\\escena.js' : 'Z:\\x\\escena.js';
    assert.throws(() => rutaURLModulo(proyecto, otraUnidad), /no está dentro del proyecto/);
  });

  test('un archivo cuyo nombre empieza por ".." sigue estando dentro del proyecto', () => {
    assert.equal(rutaURLModulo(proyecto, '..borrador.js'), '/..borrador.js');
  });
});

describe('slug', () => {
  test('minúsculas, sin tildes ni eñes, guiones en lugar de espacios y símbolos', () => {
    assert.equal(slug('Gancho Inicial'), 'gancho-inicial');
    assert.equal(slug('Canción ñandú: Vídeo FINAL!!'), 'cancion-nandu-video-final');
    assert.equal(slug('ÁÉÍÓÚ Ü ç'), 'aeiou-u-c');
    assert.equal(slug('16:9'), '16-9');
  });

  test('sin guiones al principio o al final ni repetidos', () => {
    assert.equal(slug('  --Hola__Mundo!!  '), 'hola-mundo');
    assert.equal(slug('a   b'), 'a-b');
    assert.equal(slug('Vídeo 🎬 final'), 'video-final');
  });

  test('acepta cualquier valor y la cadena vacía', () => {
    assert.equal(slug(16), '16');
    assert.equal(slug(''), '');
    assert.equal(slug('¿?¡!'), '');
  });
});
