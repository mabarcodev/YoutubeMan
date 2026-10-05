// Tests de tools/vista-previa.mjs: la URL (sin render=1, con espacios, tildes y barras de Windows), cómo se abre
// el navegador en cada sistema (con un lanzador falso: nunca se abre uno de verdad), las opciones y el servidor
// real en 127.0.0.1 sirviendo la página, el módulo y el motor. También la herramienta desde la consola.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  abrirNavegador,
  cerrarAlSalir,
  comandoAbrir,
  construirURL,
  iniciarVistaPrevia,
  leerOpciones,
} from '../../tools/vista-previa.mjs';
import { iniciarServidor } from '../../tools/lib/servidor.mjs';
import { ESTUDIO, borrar, carpetaTemporal } from '../helpers/entorno.mjs';

const ESCENA = `export default { duracion: 1, dibujar() {} };\n`;

describe('cerrarAlSalir (Ctrl+C)', () => {
  // En Windows, kill('SIGINT') desde Node mata el proceso sin pasar por el manejador: se prueba con un proceso falso.
  /** EventEmitter con exit(): `salio` se cumple con el código de la primera salida. */
  function procesoFalso() {
    const p = new EventEmitter();
    p.salidas = [];
    p.salio = new Promise((resolve) => {
      p.exit = (codigo) => {
        p.salidas.push(codigo);
        resolve(codigo);
      };
    });
    return p;
  }

  test('Ctrl+C cierra el servidor una sola vez y sale con 0', async () => {
    const proceso = procesoFalso();
    const log = [];
    let cierres = 0;
    cerrarAlSalir({ cerrar: async () => cierres++ }, { proceso, log: (m) => log.push(m) });
    assert.equal(proceso.listenerCount('SIGINT'), 1);
    assert.equal(proceso.listenerCount('SIGTERM'), 1);
    proceso.emit('SIGINT');
    proceso.emit('SIGINT'); // dos Ctrl+C seguidos
    assert.equal(await proceso.salio, 0);
    await new Promise((r) => setImmediate(r));
    assert.equal(cierres, 1);
    assert.deepEqual(proceso.salidas, [0]);
    assert.deepEqual(log, ['✅ Vista previa cerrada.']);
  });

  test('si el servidor tarda en cerrar (un navegador conectado), sale igual al pasar la espera', async () => {
    const proceso = procesoFalso();
    const t0 = Date.now();
    cerrarAlSalir({ cerrar: () => new Promise(() => {}) }, { proceso, log: () => {}, esperaMs: 30 });
    proceso.emit('SIGTERM');
    assert.equal(await proceso.salio, 0);
    assert.ok(Date.now() - t0 < 2000);
  });
});

describe('construirURL', () => {
  const proyecto = path.resolve('/Vídeos/Mi proyecto');

  test('página del motor con el módulo relativo al proyecto y el formato, sin render=1', () => {
    const url = construirURL('http://127.0.0.1:5173', proyecto, 'escenas/01-gancho/escena.js', '16:9');
    assert.equal(
      url,
      'http://127.0.0.1:5173/estudio/engine/pagina.html?modulo=/escenas/01-gancho/escena.js&formato=16:9',
    );
    assert.doesNotMatch(url, /render=/);
  });

  test('acepta rutas absolutas con barras de Windows y la base con barra final', () => {
    const modulo = path.join(proyecto, 'escenas', '02', 'escena.js');
    assert.equal(
      construirURL('http://127.0.0.1:80/', proyecto, modulo),
      'http://127.0.0.1:80/estudio/engine/pagina.html?modulo=/escenas/02/escena.js&formato=16:9',
    );
  });

  test('codifica espacios, tildes y lo que rompería la consulta (& # ? + %)', () => {
    const url = construirURL('http://h', proyecto, 'escenas/01 gancho & más #1?+%/vídeo.js', 'vertical');
    const consulta = new URL(url).searchParams;
    assert.equal(consulta.get('modulo'), '/escenas/01 gancho & más #1?+%/vídeo.js', 'el runtime lee la ruta exacta');
    assert.equal(consulta.get('formato'), '9:16');
    assert.equal([...consulta.keys()].join(','), 'modulo,formato');
  });

  test('un módulo fuera del proyecto o un formato desconocido: error', () => {
    assert.throws(() => construirURL('http://h', proyecto, '../otro/escena.js'), /no está dentro del proyecto/);
    assert.throws(() => construirURL('http://h', proyecto, 'escena.js', '5:4'), /Formato desconocido/);
  });
});

describe('comandoAbrir y abrirNavegador', () => {
  const url = 'http://127.0.0.1:5000/estudio/engine/pagina.html?modulo=/escenas/01%20a/escena.js&formato=16:9';

  test('Windows: cmd /c start "" "<url>" sin que Node vuelva a entrecomillar', () => {
    const c = comandoAbrir(url, 'win32');
    assert.equal(c.bin, 'cmd.exe');
    assert.deepEqual(c.args, ['/d', '/s', '/c', `start "" "${url}"`]);
    assert.equal(c.opciones.windowsVerbatimArguments, true);
  });

  test('macOS: open; Linux: xdg-open', () => {
    assert.deepEqual(comandoAbrir(url, 'darwin'), { bin: 'open', args: [url], opciones: {} });
    assert.deepEqual(comandoAbrir(url, 'linux'), { bin: 'xdg-open', args: [url], opciones: {} });
  });

  test('lanza desacoplado, sin ventana ni salida, y suelta el proceso al arrancar', async () => {
    let llamada;
    let suelto = false;
    const hijo = new EventEmitter();
    hijo.unref = () => (suelto = true);
    const lanzar = (bin, args, opciones) => {
      llamada = { bin, args, opciones };
      setImmediate(() => hijo.emit('spawn'));
      return hijo;
    };
    await abrirNavegador(url, { plataforma: 'win32', lanzar });
    assert.equal(llamada.bin, 'cmd.exe');
    assert.equal(llamada.opciones.detached, true);
    assert.equal(llamada.opciones.stdio, 'ignore');
    assert.equal(llamada.opciones.windowsHide, true);
    assert.equal(llamada.opciones.windowsVerbatimArguments, true);
    assert.equal(suelto, true);
  });

  test('si no se puede lanzar, la promesa falla (la herramienta lo avisa y sigue)', async () => {
    const lanzar = () => {
      const hijo = new EventEmitter();
      setImmediate(() => hijo.emit('error', new Error('spawn xdg-open ENOENT')));
      return hijo;
    };
    await assert.rejects(abrirNavegador(url, { plataforma: 'linux', lanzar }), /ENOENT/);
  });
});

describe('leerOpciones', () => {
  let tmp;
  before(() => (tmp = carpetaTemporal('vista-opciones')));
  after(() => borrar(tmp));

  test('valores por defecto', () => {
    assert.deepEqual(leerOpciones(['--proyecto', tmp, '--modulo', 'escena.js']), {
      proyecto: path.resolve(tmp),
      modulo: 'escena.js',
      formato: '16:9',
      puerto: 0,
      abrir: false,
    });
  });

  test('formato normalizado, puerto y --abrir', () => {
    const op = leerOpciones([
      '--proyecto',
      tmp,
      '--modulo',
      'e.js',
      '--formato',
      'reels',
      '--puerto',
      '8080',
      '--abrir',
    ]);
    assert.equal(op.formato, '9:16');
    assert.equal(op.puerto, 8080);
    assert.equal(op.abrir, true);
  });

  test('sin --modulo usa pelicula.js si existe; si no, error', () => {
    assert.throws(() => leerOpciones(['--proyecto', tmp]), /Falta --modulo/);
    fs.writeFileSync(path.join(tmp, 'pelicula.js'), ESCENA);
    assert.equal(leerOpciones(['--proyecto', tmp]).modulo, 'pelicula.js');
  });

  test('puerto o formato inválidos, opción desconocida y --ayuda', () => {
    for (const p of ['70000', 'abc', '1.5', '-1']) {
      assert.throws(() => leerOpciones(['--proyecto', tmp, '--modulo', 'e.js', `--puerto=${p}`]), /--puerto debe ser/);
    }
    assert.throws(() => leerOpciones(['--proyecto', tmp, '--modulo', 'e.js', '--formato', '4:3']), /Formato/);
    assert.throws(() => leerOpciones(['--render']), /Opción desconocida: --render/);
    assert.deepEqual(leerOpciones(['--ayuda']), { ayuda: true });
  });
});

describe('iniciarVistaPrevia con el servidor real (127.0.0.1)', () => {
  let tmp;
  let proyecto;
  before(() => {
    tmp = carpetaTemporal('vista-servidor');
    proyecto = path.join(tmp, 'Vídeos', 'Proyecto ñ con espacios');
    fs.mkdirSync(path.join(proyecto, 'escenas', '01 gancho'), { recursive: true });
    fs.writeFileSync(path.join(proyecto, 'escenas', '01 gancho', 'escena.js'), ESCENA);
    fs.writeFileSync(path.join(proyecto, 'proyecto.json'), '{"tempo": {"bpm": 120, "primerPulso": 0}}');
  });
  after(() => borrar(tmp));

  test('sirve la página, el módulo y el motor; cerrar() libera el puerto', async () => {
    const vp = await iniciarVistaPrevia({ proyecto, modulo: 'escenas/01 gancho/escena.js', formato: '1:1' });
    try {
      assert.equal(vp.modulo, '/escenas/01 gancho/escena.js');
      assert.deepEqual(vp.avisos, []);
      assert.match(vp.url, /^http:\/\/127\.0\.0\.1:\d+\/estudio\/engine\/pagina\.html\?modulo=.*&formato=1:1$/);

      const pagina = await fetch(vp.url);
      assert.equal(pagina.status, 200);
      assert.match(pagina.headers.get('content-type'), /text\/html/);
      assert.match(await pagina.text(), /runtime\.js/);

      const modulo = await fetch(new URL(new URL(vp.url).searchParams.get('modulo'), vp.base));
      assert.equal(modulo.status, 200);
      assert.match(modulo.headers.get('content-type'), /javascript/);
      assert.equal(await modulo.text(), ESCENA);

      const runtime = await fetch(`${vp.base}/estudio/engine/runtime.js`);
      assert.equal(runtime.status, 200);
      await runtime.arrayBuffer();
    } finally {
      await vp.cerrar();
    }
    await assert.rejects(fetch(vp.url), 'tras cerrar ya no responde');
  });

  test('sin proyecto.json avisa del tempo por defecto', async () => {
    const otro = path.join(tmp, 'sin-proyecto');
    fs.mkdirSync(otro);
    fs.writeFileSync(path.join(otro, 'escena.js'), ESCENA);
    const vp = await iniciarVistaPrevia({ proyecto: otro, modulo: path.join(otro, 'escena.js') });
    await vp.cerrar();
    assert.equal(vp.avisos.length, 1);
    assert.match(vp.avisos[0], /No hay proyecto\.json/);
  });

  test('errores antes de abrir el puerto: carpeta, módulo inexistente o fuera del proyecto', async () => {
    await assert.rejects(
      iniciarVistaPrevia({ proyecto: path.join(tmp, 'no-existe'), modulo: 'e.js' }),
      /No existe la carpeta del proyecto/,
    );
    await assert.rejects(iniciarVistaPrevia({ proyecto, modulo: 'escenas/no-hay.js' }), /No existe el módulo/);
    await assert.rejects(iniciarVistaPrevia({ proyecto, modulo: 'escenas' }), /No existe el módulo/);
    await assert.rejects(iniciarVistaPrevia({ proyecto, modulo: '../fuera.js' }), /no está dentro del proyecto/);
  });

  test('puerto ocupado: mensaje claro con la causa original', async () => {
    const ocupado = await iniciarServidor({ proyecto, estudio: ESTUDIO });
    const puerto = Number(new URL(ocupado.url).port);
    try {
      await assert.rejects(iniciarVistaPrevia({ proyecto, modulo: 'escenas/01 gancho/escena.js', puerto }), (e) => {
        assert.match(e.message, new RegExp(`El puerto ${puerto} está ocupado`));
        assert.equal(e.cause?.code, 'EADDRINUSE');
        return true;
      });
    } finally {
      await ocupado.cerrar();
    }
  });
});

describe('la herramienta desde la consola', () => {
  let tmp;
  before(() => {
    tmp = carpetaTemporal('vista-cli');
    fs.writeFileSync(path.join(tmp, 'escena.js'), ESCENA);
  });
  after(() => borrar(tmp));

  /** Arranca la vista previa y espera a su última línea (la de Ctrl+C). Devuelve { url, salida, proceso }. */
  function arrancar(args) {
    return new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ['tools/vista-previa.mjs', ...args], { cwd: ESTUDIO, windowsHide: true });
      let salida = '';
      const limite = setTimeout(() => (p.kill(), reject(new Error(`No terminó de arrancar:\n${salida}`))), 20_000);
      p.stdout.on('data', (d) => {
        salida += d;
        const url = /http:\/\/127\.0\.0\.1:\d+\S+/.exec(salida)?.[0];
        if (url && salida.includes('Ctrl+C')) {
          clearTimeout(limite);
          resolve({ url, salida, proceso: p });
        }
      });
      p.stderr.on('data', (d) => (salida += d));
      p.on('error', reject);
    });
  }

  test('imprime la URL, responde 200 y sigue en marcha hasta que se cierra', async () => {
    const { url, salida, proceso } = await arrancar(['--proyecto', tmp, '--modulo', 'escena.js', '--formato', '9:16']);
    try {
      assert.match(salida, /✅ Vista previa de \/escena\.js \(9:16\)/);
      assert.match(salida, /No hay proyecto\.json/);
      assert.match(url, /formato=9:16$/);
      const r = await fetch(url);
      assert.equal(r.status, 200);
      await r.text();
      assert.equal(proceso.exitCode, null, 'sigue en marcha');
    } finally {
      const cerrado = new Promise((r) => proceso.once('close', r));
      proceso.kill();
      await cerrado;
    }
  });

  test('un módulo que no existe: ❌ y código 1', async () => {
    const p = spawn(process.execPath, ['tools/vista-previa.mjs', '--proyecto', tmp, '--modulo', 'no.js'], {
      cwd: ESTUDIO,
      windowsHide: true,
    });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    const codigo = await new Promise((r) => p.on('close', r));
    assert.equal(codigo, 1);
    assert.match(err, /^❌ No existe el módulo/);
  });
});
