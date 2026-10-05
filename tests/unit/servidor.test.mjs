// Tests de tools/lib/servidor.mjs: traducción de URL a archivo (sin salir nunca de su raíz) y el servidor
// HTTP de verdad en 127.0.0.1 (solo red local).

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { iniciarServidor, resolverRuta, tipoMime } from '../../tools/lib/servidor.mjs';
import { borrar, carpetaTemporal } from '../helpers/entorno.mjs';

describe('tipoMime', () => {
  test('tipos de lo que sirve el estudio, sin distinguir mayúsculas', () => {
    assert.equal(tipoMime('escena.js'), 'text/javascript; charset=utf-8');
    assert.equal(tipoMime('ESCENA.JS'), 'text/javascript; charset=utf-8');
    assert.equal(tipoMime('pagina.html'), 'text/html; charset=utf-8');
    assert.equal(tipoMime('proyecto.json'), 'application/json; charset=utf-8');
    assert.equal(tipoMime('kit/fuentes/inter.woff2'), 'font/woff2');
    assert.equal(tipoMime('kit/capturas/a.PNG'), 'image/png');
    assert.equal(tipoMime('kit/audio/clic.wav'), 'audio/wav');
  });

  test('desconocido o sin extensión: binario genérico', () => {
    assert.equal(tipoMime('archivo.xyz'), 'application/octet-stream');
    assert.equal(tipoMime('LEEME'), 'application/octet-stream');
  });
});

describe('resolverRuta', () => {
  // Rutas con espacios y tildes, como las carpetas reales de vídeos en Windows.
  const raiz = path.resolve('/tmp-estudio-test/Vídeos con espacios');
  const proyecto = path.join(raiz, 'Mi proyecto');
  const estudio = path.join(raiz, '_estudio');
  const raices = { proyecto, estudio };
  const dentro = (abs, base) => abs === base || abs.startsWith(base + path.sep);

  test('/... va al proyecto y /estudio/... al estudio', () => {
    assert.equal(resolverRuta('/escena.js', raices), path.join(proyecto, 'escena.js'));
    assert.equal(resolverRuta('/kit/capturas/a.png', raices), path.join(proyecto, 'kit', 'capturas', 'a.png'));
    assert.equal(resolverRuta('/estudio/engine/motion.js', raices), path.join(estudio, 'engine', 'motion.js'));
    assert.equal(resolverRuta('/estudio', raices), estudio);
  });

  test('"/estudiox" no es el estudio: es una carpeta del proyecto', () => {
    assert.equal(resolverRuta('/estudiox/a.js', raices), path.join(proyecto, 'estudiox', 'a.js'));
  });

  test('ignora ?consulta y #ancla y decodifica espacios y tildes', () => {
    assert.equal(resolverRuta('/escena.js?v=2#x', raices), path.join(proyecto, 'escena.js'));
    assert.equal(
      resolverRuta('/escenas/01%20gancho/v%C3%ADdeo.js', raices),
      path.join(proyecto, 'escenas', '01 gancho', 'vídeo.js'),
    );
  });

  test('ningún intento de salir de la raíz sale de ella', () => {
    const intentos = [
      '/../secreto.txt',
      '/../../secreto.txt',
      '/%2e%2e/%2e%2e/secreto.txt',
      '/%2E%2E%2F%2E%2E%2Fsecreto.txt',
      '/..%5c..%5csecreto.txt',
      '/..\\..\\secreto.txt',
      '/escenas/../../secreto.txt',
      '/C:/Windows/win.ini',
      '/C:%5cWindows%5cwin.ini',
      'C:\\Windows\\win.ini',
      '//servidor/compartido/x',
      '\\\\servidor\\compartido\\x',
      '/estudio/../../secreto.txt',
      '/estudio/..%5c..%5csecreto.txt',
      '/estudio%2f..%2f..%2fsecreto.txt',
      '/%00',
    ];
    for (const url of intentos) {
      const abs = resolverRuta(url, raices);
      if (abs === null) continue; // rechazada: perfecto
      assert.ok(dentro(abs, proyecto) || dentro(abs, estudio), `${url} → ${abs} sale de las raíces`);
    }
    // Las variantes con barra invertida sí se rechazan explícitamente.
    assert.equal(resolverRuta('/..%5c..%5csecreto.txt', raices), null);
    assert.equal(resolverRuta('/..\\..\\secreto.txt', raices), null);
  });

  test('"/estudio/../x" se queda dentro del estudio (nunca sube a la carpeta de vídeos)', () => {
    assert.equal(resolverRuta('/estudio/../package.json', raices), path.join(estudio, 'package.json'));
  });

  test('una codificación % rota devuelve null en vez de lanzar', () => {
    assert.equal(resolverRuta('/%E0%A4%A', raices), null);
    assert.equal(resolverRuta('/%', raices), null);
  });

  test('funciona aunque el proyecto esté en la raíz de una unidad', () => {
    const unidad = path.parse(process.cwd()).root; // 'D:\' en Windows, '/' en Linux/macOS
    assert.equal(resolverRuta('/escena.js', { proyecto: unidad, estudio }), path.join(unidad, 'escena.js'));
  });
});

describe('iniciarServidor (HTTP real en 127.0.0.1)', () => {
  let tmp;
  let servidor;
  const SECRETO = 'no debería poder leerse';

  before(async () => {
    tmp = carpetaTemporal('servidor');
    const proyecto = path.join(tmp, 'Vídeos de prueba', 'Proyecto ñ');
    const estudio = path.join(tmp, '_estudio');
    fs.mkdirSync(path.join(proyecto, 'carpeta con espacios'), { recursive: true });
    fs.mkdirSync(path.join(estudio, 'engine'), { recursive: true });
    fs.writeFileSync(path.join(proyecto, 'hola.txt'), 'hola mundo');
    fs.writeFileSync(path.join(proyecto, 'carpeta con espacios', 'vídeo.json'), '{"ok":true}');
    fs.writeFileSync(path.join(estudio, 'engine', 'motor.js'), 'export default 1;');
    fs.writeFileSync(path.join(tmp, 'secreto.txt'), SECRETO);
    fs.writeFileSync(path.join(tmp, 'Vídeos de prueba', 'secreto.txt'), SECRETO);
    servidor = await iniciarServidor({ proyecto, estudio });
  });

  after(async () => {
    await servidor?.cerrar();
    borrar(tmp);
  });

  /** Petición HTTP con la ruta tal cual (fetch normalizaría los "..", que es justo lo que se quiere probar). */
  function peticion(ruta, metodo = 'GET') {
    const { hostname, port } = new URL(servidor.url);
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname, port, path: ruta, method: metodo }, (res) => {
        let cuerpo = '';
        res.setEncoding('utf8');
        res.on('data', (d) => (cuerpo += d));
        res.on('end', () => resolve({ estado: res.statusCode, cabeceras: res.headers, cuerpo }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  test('escucha en 127.0.0.1 con un puerto libre', () => {
    assert.match(servidor.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test('200 con el tipo MIME y sin caché para un archivo del proyecto', async () => {
    const r = await fetch(`${servidor.url}/hola.txt`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(await r.text(), 'hola mundo');
  });

  test('sirve rutas con espacios y tildes y el motor bajo /estudio', async () => {
    const r = await fetch(`${servidor.url}/carpeta%20con%20espacios/v%C3%ADdeo.json`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    const m = await fetch(`${servidor.url}/estudio/engine/motor.js`);
    assert.equal(m.status, 200);
    assert.equal(m.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(await m.text(), 'export default 1;');
  });

  test('404 para lo que no existe y para carpetas', async () => {
    const r = await fetch(`${servidor.url}/no-existe.js`);
    assert.equal(r.status, 404);
    assert.equal(await r.text(), 'No encontrado: /no-existe.js');
    assert.equal((await peticion('/')).estado, 404);
    assert.equal((await peticion('/carpeta%20con%20espacios')).estado, 404);
    assert.equal((await peticion('/estudio')).estado, 404);
  });

  test('las rutas con ".." o barras invertidas no sirven nada de fuera', async () => {
    for (const ruta of [
      '/../secreto.txt',
      '/../../secreto.txt',
      '/%2e%2e/%2e%2e/secreto.txt',
      '/..%5c..%5csecreto.txt',
      '/..%5csecreto.txt',
      '/estudio/../../secreto.txt',
      '/estudio/..%5c..%5csecreto.txt',
    ]) {
      const r = await peticion(ruta);
      assert.equal(r.estado, 404, `${ruta} devolvió ${r.estado}`);
      assert.ok(!r.cuerpo.includes(SECRETO));
    }
  });

  test('HEAD: 200 con cabeceras y sin cuerpo', async () => {
    const r = await peticion('/hola.txt', 'HEAD');
    assert.equal(r.estado, 200);
    assert.equal(r.cabeceras['content-type'], 'text/plain; charset=utf-8');
    assert.equal(r.cuerpo, '');
  });

  test('405 para métodos que no son GET ni HEAD', async () => {
    for (const metodo of ['POST', 'PUT', 'DELETE']) {
      const r = await peticion('/hola.txt', metodo);
      assert.equal(r.estado, 405, metodo);
    }
  });

  test('si el puerto está ocupado, la promesa se rechaza', async () => {
    const puerto = Number(new URL(servidor.url).port);
    await assert.rejects(iniciarServidor({ proyecto: tmp, estudio: tmp, puerto }), { code: 'EADDRINUSE' });
  });

  test('cerrar() libera el puerto', async () => {
    const otro = await iniciarServidor({ proyecto: tmp, estudio: tmp });
    const puerto = Number(new URL(otro.url).port);
    await otro.cerrar();
    const denuevo = await iniciarServidor({ proyecto: tmp, estudio: tmp, puerto });
    await denuevo.cerrar();
  });
});
