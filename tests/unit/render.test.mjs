// Tests de las partes puras de tools/render.mjs: opciones, nombres y rutas de salida, plan de muestras,
// recorte de audio y captura en paralelo con entrega en orden. Más el CLI en lo que no necesita navegador.
// El render de verdad (Chromium + ffmpeg) está en tests/integracion/render.test.mjs.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AYUDA,
  capturarEnOrden,
  leerOpciones,
  nombreModulo,
  planMuestras,
  recortarAudio,
  rutaSalida,
  rutaVersionada,
} from '../../tools/render.mjs';
import { hash01 } from '../../engine/motion.js';
import { borrar, carpetaTemporal, cerca, ejecutarNode } from '../helpers/entorno.mjs';

let tmp;
before(() => {
  tmp = carpetaTemporal('render');
});
after(() => borrar(tmp));

/** Carpeta de proyecto nueva dentro de la temporal (con espacios y tildes, como en Windows real). */
function proyectoNuevo(nombre = 'Proyecto ñ con espacios') {
  const dir = fs.mkdtempSync(path.join(tmp, `${nombre}-`));
  return dir;
}

describe('leerOpciones', () => {
  test('--ayuda y -h piden la ayuda sin validar nada más', () => {
    assert.deepEqual(leerOpciones(['--ayuda']), { ayuda: true });
    assert.deepEqual(leerOpciones(['-h']), { ayuda: true });
  });

  test('valores por defecto (render final)', () => {
    const proyecto = proyectoNuevo();
    assert.deepEqual(leerOpciones(['--proyecto', proyecto, '--modulo', 'escena.js']), {
      proyecto,
      modulo: 'escena.js',
      formatos: ['16:9'],
      fps: 60,
      sub: 4,
      escala: 1,
      desde: 0,
      hasta: null,
      borrador: false,
      fotos: null,
      salida: null,
      sinAudio: false,
      crf: 16,
      hilos: 4,
    });
  });

  test('--borrador cambia los valores por defecto, pero lo explícito manda', () => {
    const proyecto = proyectoNuevo();
    const b = leerOpciones(['--proyecto', proyecto, '--modulo', 'a.js', '--borrador']);
    assert.deepEqual([b.borrador, b.fps, b.sub, b.escala], [true, 30, 1, 0.5]);
    const c = leerOpciones(['--proyecto', proyecto, '--modulo', 'a.js', '--borrador', '--fps', '24', '--escala', '1']);
    assert.deepEqual([c.fps, c.sub, c.escala], [24, 1, 1]);
  });

  test('normaliza formatos, alias y espacios', () => {
    const proyecto = proyectoNuevo();
    const op = leerOpciones(['--proyecto', proyecto, '--modulo', 'a.js', '--formato', 'vertical,16x9, cuadrado ,4X5']);
    assert.deepEqual(op.formatos, ['9:16', '16:9', '1:1', '4:5']);
  });

  test('un formato repetido con otro nombre se renderiza una sola vez', () => {
    const op = leerOpciones(['--proyecto', proyectoNuevo(), '--modulo', 'a.js', '--formato', '9:16,reels']);
    assert.deepEqual(op.formatos, ['9:16']);
  });

  test('--fotos, --hilos, tramo, --sin-audio, --crf y --salida relativa', () => {
    const proyecto = proyectoNuevo();
    const op = leerOpciones([
      ...['--proyecto', proyecto, '--modulo', 'escenas/01-gancho/escena.js'],
      ...['--fotos', '0,1.5, 3', '--hilos', '2', '--desde', '1.5', '--hasta', '4'],
      ...['--sin-audio', '--crf', '20', '--salida', 'fotos de prueba'],
    ]);
    assert.deepEqual(op.fotos, [0, 1.5, 3]);
    assert.deepEqual([op.hilos, op.desde, op.hasta, op.sinAudio, op.crf], [2, 1.5, 4, true, 20]);
    assert.equal(op.salida, path.resolve('fotos de prueba'));
  });

  test('sin --proyecto usa la carpeta actual', () => {
    assert.equal(leerOpciones(['--modulo', 'x.js']).proyecto, path.resolve(process.cwd()));
  });

  test('sin --modulo usa pelicula.js si existe; si no, error claro', () => {
    const conPelicula = proyectoNuevo();
    fs.writeFileSync(path.join(conPelicula, 'pelicula.js'), 'export default {};');
    assert.equal(leerOpciones(['--proyecto', conPelicula]).modulo, 'pelicula.js');
    assert.throws(() => leerOpciones(['--proyecto', proyectoNuevo()]), { message: /Falta --modulo/ });
  });

  test('errores de validación con mensajes claros', () => {
    const base = ['--proyecto', proyectoNuevo(), '--modulo', 'a.js'];
    const casos = [
      [['--fps', 'rapido'], /--fps debe ser un número/],
      [['--sub', 'x'], /--sub debe ser un número/],
      [['--sub', '0'], /--sub debe ser un entero >= 1/],
      [['--sub', '2.5'], /--sub debe ser un entero >= 1/],
      [['--escala', 'doble'], /--escala debe ser un número/],
      [['--desde', 'inicio'], /--desde debe ser un número/],
      [['--crf', 'alta'], /--crf debe ser un número/],
      [['--hilos', 'muchos'], /--hilos debe ser un número/],
      [['--fotos', '1,dos,3'], /--fotos debe ser una lista de segundos: 0,1\.5,3/],
      [['--formato', '7:3'], /Formato desconocido: "7:3"/],
    ];
    for (const [extra, mensaje] of casos) assert.throws(() => leerOpciones([...base, ...extra]), { message: mensaje });
  });

  test('opciones desconocidas o argumentos sueltos no se aceptan', () => {
    const base = ['--proyecto', proyectoNuevo(), '--modulo', 'a.js'];
    assert.throws(() => leerOpciones([...base, '--velocidad', '2']), { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' });
    assert.throws(() => leerOpciones([...base, 'suelto']), { code: 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL' });
  });

  test('--hasta también se valida como número', () => {
    const base = ['--proyecto', proyectoNuevo(), '--modulo', 'a.js'];
    assert.throws(() => leerOpciones([...base, '--hasta', 'abc']), { message: /--hasta debe ser un número/ });
  });

  /** Cada caso [argumentos extra, mensaje exacto] tiene que fallar con ese mensaje. */
  function fallanCon(casos) {
    const base = ['--proyecto', proyectoNuevo(), '--modulo', 'a.js'];
    for (const [extra, message] of casos) {
      assert.throws(() => leerOpciones([...base, ...extra]), { message }, extra.join(' '));
    }
  }

  test('fps y escala tienen que ser > 0 (un negativo se escribe --fps=-30)', () => {
    fallanCon([
      [['--fps', '0'], '--fps debe ser mayor que 0.'],
      [['--fps=-30'], '--fps debe ser mayor que 0.'],
      [['--escala', '0'], '--escala debe ser mayor que 0.'],
      [['--escala=-1'], '--escala debe ser mayor que 0.'],
    ]);
  });

  test('"--fps -30" (con espacio) lo para parseArgs, con la pista de cómo escribirlo', () => {
    const base = ['--proyecto', proyectoNuevo(), '--modulo', 'a.js'];
    assert.throws(() => leerOpciones([...base, '--fps', '-30']), {
      code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
      message: /--fps=<valor>/,
    });
  });

  test('el tramo: --desde no puede ser negativo y --hasta tiene que ir después de --desde', () => {
    fallanCon([
      [['--desde=-1'], '--desde debe ser 0 o más.'],
      [['--desde', '3', '--hasta', '2'], '--hasta debe ser mayor que --desde.'],
      [['--desde', '2', '--hasta', '2'], '--hasta debe ser mayor que --desde.'],
      [['--hasta', '0'], '--hasta debe ser mayor que --desde.'],
    ]);
    const base = ['--proyecto', proyectoNuevo(), '--modulo', 'a.js'];
    const op = leerOpciones([...base, '--desde', '0', '--hasta', '0.001']);
    assert.deepEqual([op.desde, op.hasta], [0, 0.001]);
  });

  test('--hilos tiene que ser un entero >= 1 y --crf estar entre 0 y 51 (bordes incluidos)', () => {
    fallanCon([
      [['--hilos', '0'], '--hilos debe ser un entero >= 1.'],
      [['--hilos', '1.5'], '--hilos debe ser un entero >= 1.'],
      [['--crf=-1'], '--crf debe ser un número entre 0 y 51.'],
      [['--crf', '52'], '--crf debe ser un número entre 0 y 51.'],
    ]);
    const base = ['--proyecto', proyectoNuevo(), '--modulo', 'a.js'];
    for (const [extra, clave, v] of [
      [['--hilos', '1'], 'hilos', 1],
      [['--crf', '0'], 'crf', 0],
      [['--crf', '51'], 'crf', 51],
    ]) {
      assert.equal(leerOpciones([...base, ...extra])[clave], v, extra.join(' '));
    }
  });

  test('--fotos con un hueco ("1,,3" o una coma al final) no se inventa una foto en el segundo 0', () => {
    const base = ['--proyecto', proyectoNuevo(), '--modulo', 'a.js'];
    for (const fotos of ['1,,3', '1,3,']) {
      let op;
      try {
        op = leerOpciones([...base, '--fotos', fotos]);
      } catch (e) {
        assert.match(e.message, /--fotos/); // también vale un error claro
        continue;
      }
      assert.deepEqual(op.fotos, [1, 3], `--fotos ${fotos}`);
    }
  });
});

describe('nombreModulo', () => {
  test('película: el nombre del archivo; escena: el nombre de su carpeta', () => {
    assert.equal(nombreModulo('pelicula.js'), 'pelicula');
    assert.equal(nombreModulo('otra-version.mjs'), 'otra-version');
    assert.equal(nombreModulo('escenas/01-gancho/escena.js'), '01-gancho');
    assert.equal(nombreModulo('escenas/02-demo/index.js'), '02-demo');
    assert.equal(nombreModulo(path.join(tmp, 'escenas', '03-cierre', 'escena.js')), '03-cierre');
  });

  test('rutas con barras invertidas de Windows', { skip: process.platform !== 'win32' && 'solo en Windows' }, () => {
    assert.equal(nombreModulo('escenas\\04-precio\\escena.js'), '04-precio');
  });
});

describe('rutaVersionada', () => {
  test('primera versión libre: -v1, -v2... sin pisar nunca un final', () => {
    const dir = proyectoNuevo('versiones');
    assert.equal(rutaVersionada(dir, 'miproducto-16x9'), path.join(dir, 'miproducto-16x9-v1.mp4'));
    fs.writeFileSync(path.join(dir, 'miproducto-16x9-v1.mp4'), '');
    assert.equal(rutaVersionada(dir, 'miproducto-16x9'), path.join(dir, 'miproducto-16x9-v2.mp4'));
    fs.writeFileSync(path.join(dir, 'miproducto-16x9-v2.mp4'), '');
    assert.equal(rutaVersionada(dir, 'miproducto-16x9'), path.join(dir, 'miproducto-16x9-v3.mp4'));
  });

  test('rellena huecos, admite otra extensión y una carpeta que aún no existe', () => {
    const dir = proyectoNuevo('versiones');
    fs.writeFileSync(path.join(dir, 'post-v2.png'), '');
    assert.equal(rutaVersionada(dir, 'post', '.png'), path.join(dir, 'post-v1.png'));
    const nueva = path.join(dir, 'salida');
    assert.equal(rutaVersionada(nueva, 'x'), path.join(nueva, 'x-v1.mp4'));
  });
});

describe('rutaSalida', () => {
  const opciones = (proyecto, extra = [], modulo = 'pelicula.js') =>
    leerOpciones(['--proyecto', proyecto, '--modulo', modulo, ...extra]);

  test('película final → salida/ versionada, con el nombre del proyecto en slug', () => {
    const proyecto = path.join(proyectoNuevo('finales'), 'Mi Vídeo ñ');
    const op = opciones(proyecto);
    const v1 = path.join(proyecto, 'salida', 'mi-video-n-16x9-v1.mp4');
    assert.equal(rutaSalida(op, '16:9'), v1);
    fs.mkdirSync(path.dirname(v1), { recursive: true });
    fs.writeFileSync(v1, '');
    assert.equal(rutaSalida(op, '16:9'), path.join(proyecto, 'salida', 'mi-video-n-16x9-v2.mp4'));
    assert.equal(rutaSalida(op, '9:16'), path.join(proyecto, 'salida', 'mi-video-n-9x16-v1.mp4'));
  });

  test('película en borrador o por tramos → revision/pelicula/, sin versionar', () => {
    const proyecto = proyectoNuevo();
    const rev = path.join(proyecto, 'revision', 'pelicula');
    assert.equal(rutaSalida(opciones(proyecto, ['--borrador']), '16:9'), path.join(rev, 'pelicula-16x9-borrador.mp4'));
    assert.equal(
      rutaSalida(opciones(proyecto, ['--desde', '2', '--hasta', '5']), '9:16'),
      path.join(rev, 'pelicula-9x16-2-5s.mp4'),
    );
    assert.equal(
      rutaSalida(opciones(proyecto, ['--borrador', '--hasta', '2.5']), '1:1'),
      path.join(rev, 'pelicula-1x1-borrador-0-2.5s.mp4'),
    );
  });

  test('escena → revision/<escena>/ aunque sea un render completo', () => {
    const proyecto = proyectoNuevo();
    const op = opciones(proyecto, [], 'escenas/01-gancho/escena.js');
    assert.equal(rutaSalida(op, '16:9'), path.join(proyecto, 'revision', '01-gancho', '01-gancho-16x9.mp4'));
    const borrador = opciones(proyecto, ['--borrador'], 'escenas/01-gancho/escena.js');
    assert.equal(
      rutaSalida(borrador, '4:5'),
      path.join(proyecto, 'revision', '01-gancho', '01-gancho-4x5-borrador.mp4'),
    );
  });

  test('--salida con un .mp4 y un solo formato: ese archivo tal cual', () => {
    const proyecto = proyectoNuevo();
    const archivo = path.join(tmp, 'Entrega final', 'vídeo.MP4');
    assert.equal(rutaSalida(opciones(proyecto, ['--salida', archivo]), '16:9'), archivo);
  });

  test('--salida con una carpeta: dentro, con nombre y sufijos', () => {
    const proyecto = proyectoNuevo();
    const carpeta = path.join(tmp, 'Carpeta de salida');
    assert.equal(
      rutaSalida(opciones(proyecto, ['--salida', carpeta, '--borrador', '--desde', '1', '--hasta', '3']), '16:9'),
      path.join(carpeta, 'pelicula-16x9-borrador-1-3s.mp4'),
    );
  });

  test('--salida x.mp4 con dos formatos no crea una carpeta llamada "x.mp4"', () => {
    const archivo = path.join(tmp, 'final.mp4');
    const op = opciones(proyectoNuevo(), ['--formato', '16:9,9:16', '--salida', archivo]);
    const rutas = op.formatos.map((f) => rutaSalida(op, f));
    for (const r of rutas) assert.equal(path.dirname(r), path.dirname(archivo), r);
    assert.notEqual(rutas[0], rutas[1]);
  });

  test('un render parcial con solo --desde no es un final', () => {
    const proyecto = proyectoNuevo();
    const r = rutaSalida(opciones(proyecto, ['--desde', '5']), '16:9');
    assert.ok(!r.startsWith(path.join(proyecto, 'salida')), r);
    assert.match(path.basename(r), /5/);
  });

  test('una escena en la raíz del proyecto (escena.js) se nombra por el proyecto, no por la carpeta actual', () => {
    const proyecto = path.join(proyectoNuevo('raiz'), 'mi-escena-suelta');
    const op = opciones(proyecto, [], 'escena.js');
    assert.equal(
      rutaSalida(op, '16:9'),
      path.join(proyecto, 'revision', 'mi-escena-suelta', 'mi-escena-suelta-16x9.mp4'),
    );
  });
});

describe('planMuestras', () => {
  test('con submuestras: la muestra i·sub cierra el fotograma i', () => {
    const p = planMuestras({ desde: 0, hasta: 3, fps: 60, sub: 4 });
    assert.equal(p.fotogramas, 180);
    assert.equal(p.total, 179 * 4 + 1);
    assert.equal(p.tiempo(0), 0);
    cerca(p.tiempo(4), 1 / 60, 1e-12);
    cerca(p.tiempo(1), 1 / 240, 1e-12);
    cerca(p.tiempo(p.total - 1), 179 / 60, 1e-12);
  });

  test('sub = 1: una muestra por fotograma', () => {
    const p = planMuestras({ desde: 2, hasta: 3.5, fps: 30, sub: 1 });
    assert.equal(p.fotogramas, 45);
    assert.equal(p.total, 45);
    assert.equal(p.tiempo(0), 2);
    cerca(p.tiempo(44), 2 + 44 / 30, 1e-12);
  });

  test('un tramo más corto que un fotograma da al menos uno', () => {
    const p = planMuestras({ desde: 1, hasta: 1.001, fps: 60, sub: 4 });
    assert.equal(p.fotogramas, 1);
    assert.equal(p.total, 1);
    assert.equal(p.tiempo(0), 1);
  });
});

describe('recortarAudio', () => {
  test('se queda con los sonidos del tramo (bordes incluidos) y los desplaza al inicio', () => {
    const sonidos = [
      { t: 0.5, tipo: 'a' },
      { t: 1, tipo: 'b' },
      { t: 2.5, tipo: 'c', volumen: 0.3 },
      { t: 3, tipo: 'd' },
      { t: 4, tipo: 'e' },
    ];
    const r = recortarAudio({ sonidos }, 1, 3);
    assert.deepEqual(r.sonidos, [
      { t: 0, tipo: 'b' },
      { t: 1.5, tipo: 'c', volumen: 0.3 },
      { t: 2, tipo: 'd' },
    ]);
    assert.equal(r.musica, null);
    assert.equal(sonidos[1].t, 1, 'no modifica los originales');
  });

  test('la música avanza su punto de lectura si el tramo empieza después de que suene', () => {
    const musica = { archivo: 'm.wav', desde: 2, inicio: 1, volumen: 0.5 };
    assert.deepEqual(recortarAudio({ musica }, 3, 6).musica, { archivo: 'm.wav', desde: 4, inicio: 0, volumen: 0.5 });
  });

  test('la música se retrasa si el tramo empieza antes de que suene', () => {
    const r = recortarAudio({ musica: { archivo: 'm.wav', inicio: 2 } }, 0.5, 4);
    assert.deepEqual(r.musica, { archivo: 'm.wav', desde: 0, inicio: 1.5 });
  });

  test('sin sonidos ni música', () => {
    assert.deepEqual(recortarAudio({}, 0, 3), { sonidos: [], musica: null });
  });

  test('música sin "inicio" ni "desde": suena desde el segundo 0 del vídeo y de la canción', () => {
    assert.deepEqual(recortarAudio({ musica: { archivo: 'm.wav' } }, 0, 5).musica, {
      archivo: 'm.wav',
      desde: 0,
      inicio: 0,
    });
    assert.deepEqual(recortarAudio({ musica: { archivo: 'm.wav' } }, 2, 5).musica, {
      archivo: 'm.wav',
      desde: 2,
      inicio: 0,
    });
  });
});

describe('capturarEnOrden', () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Páginas falsas con velocidades distintas; cada captura tarda un poco distinto según la muestra. */
  function escenario({ paginas = 3, total = 40 } = {}) {
    const lista = Array.from({ length: paginas }, (_, i) => ({ nombre: `p${i}`, lenta: 1 + i * 3 }));
    const capturadas = [];
    const capturar = async (pagina, t) => {
      const i = Math.round(t * 100);
      await espera(pagina.lenta + Math.floor(hash01(9, i) * 6));
      capturadas.push(i);
      return { i, pagina: pagina.nombre };
    };
    return { lista, capturadas, capturar, total, tiempo: (i) => i / 100 };
  }

  test('con páginas de velocidades distintas, escribe en orden y cada muestra una sola vez', async () => {
    const e = escenario();
    const escritas = [];
    const avances = [];
    await capturarEnOrden({
      paginas: e.lista,
      total: e.total,
      tiempo: e.tiempo,
      capturar: e.capturar,
      escribir: async (d) => {
        escritas.push(d.i);
      },
      progreso: (n) => avances.push(n),
    });
    const esperado = Array.from({ length: e.total }, (_, i) => i);
    assert.deepEqual(escritas, esperado);
    assert.deepEqual(
      [...e.capturadas].sort((a, b) => a - b),
      esperado,
    );
    assert.notDeepEqual(e.capturadas, esperado, 'las capturas terminan desordenadas: si no, el test no prueba nada');
    assert.deepEqual(
      avances,
      esperado.map((i) => i + 1),
    );
  });

  test('un escribir lento (contrapresión) no rompe el orden', async () => {
    const e = escenario({ paginas: 4, total: 25 });
    const escritas = [];
    await capturarEnOrden({
      paginas: e.lista,
      total: e.total,
      tiempo: e.tiempo,
      capturar: e.capturar,
      escribir: async (d) => {
        escritas.push(d.i); // como ff.stdin.write: el dato se entrega al llamar
        await espera(2);
      },
    });
    assert.deepEqual(
      escritas,
      Array.from({ length: 25 }, (_, i) => i),
    );
  });

  test('total 0: no captura ni escribe nada', async () => {
    const e = escenario();
    let escritas = 0;
    await capturarEnOrden({
      paginas: e.lista,
      total: 0,
      tiempo: e.tiempo,
      capturar: e.capturar,
      escribir: () => escritas++,
    });
    assert.equal(escritas, 0);
    assert.deepEqual(e.capturadas, []);
  });

  test('más páginas que muestras', async () => {
    const e = escenario({ paginas: 6, total: 2 });
    const escritas = [];
    await capturarEnOrden({
      paginas: e.lista,
      total: 2,
      tiempo: e.tiempo,
      capturar: e.capturar,
      escribir: (d) => escritas.push(d.i),
    });
    assert.deepEqual(escritas, [0, 1]);
    assert.equal(e.capturadas.length, 2);
  });

  test('si una captura falla, el error llega al que llama', async () => {
    await assert.rejects(
      capturarEnOrden({
        paginas: [{}],
        total: 3,
        tiempo: (i) => i,
        capturar: async (_p, t) => {
          if (t === 1) throw new Error('la página se ha cerrado');
          return t;
        },
        escribir: () => {},
      }),
      { message: 'la página se ha cerrado' },
    );
  });
});

describe('CLI (sin navegador)', () => {
  test('la ayuda documenta todas las opciones', () => {
    for (const op of ['proyecto', 'modulo', 'formato', 'fps', 'sub', 'desde', 'hasta', 'borrador', 'fotos', 'escala']) {
      assert.ok(AYUDA.includes(`--${op}`), `falta --${op}`);
    }
    for (const op of ['salida', 'sin-audio', 'crf', 'hilos']) assert.ok(AYUDA.includes(`--${op}`), `falta --${op}`);
  });

  test('--ayuda imprime la ayuda y sale con 0', async () => {
    const r = await ejecutarNode(['tools/render.mjs', '--ayuda']);
    assert.equal(r.codigo, 0, r.stderr);
    assert.equal(r.stdout.trim(), AYUDA.trim());
  });

  test('un error sale con 1 y un mensaje "❌" legible', async () => {
    const sinModulo = await ejecutarNode(['tools/render.mjs', '--proyecto', proyectoNuevo()]);
    assert.equal(sinModulo.codigo, 1);
    assert.match(sinModulo.stderr, /^❌ Falta --modulo/);
    const rara = await ejecutarNode(['tools/render.mjs', '--opcion-rara']);
    assert.equal(rara.codigo, 1);
    assert.match(rara.stderr, /^❌ .*--opcion-rara/);
  });
});
